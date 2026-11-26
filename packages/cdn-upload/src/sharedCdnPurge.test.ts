import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { beginSharedCdnPurge, expectedSharedCdnReceipts, sharedCdnPurgeDone } from './sharedCdnPurge';
import { cdnRequest } from './yandexCdnRequest';
import { beginBegetCdnPurge, begetCdnPurgeDone } from './begetCdnPurge';
vi.mock('./yandexCdnRequest',()=>({cdnRequest:vi.fn()}));
vi.mock('./begetCdnPurge',async original=>({...await original<typeof import('./begetCdnPurge')>(),beginBegetCdnPurge:vi.fn(async(_scope,_paths,ops)=>[...ops,'beget:old']),begetCdnPurgeDone:vi.fn(async()=>true)}));
const path='/media/v2/test_media/v1/image/s.webp';
const baseline={...process.env};
const resource='bc8rr3yxsrkobnonoi2w';
beforeEach(()=>{process.env={...baseline,FEED_CDN_PROVIDER:'yandex',FEED_CDN_BASE_URL:'https://cdn.gafus.ru',FEED_CDN_SECRET:'A'.repeat(32),YANDEX_SHARED_CDN_RESOURCE_ID:resource,YANDEX_SHARED_CDN_EDGE_VERIFIED:'true',YANDEX_SHARED_CDN_PURGE_VERIFIED:'true',CDN_CLEANUP_SERVICE_ACCOUNT_KEY_B64:'mock'};vi.clearAllMocks();vi.mocked(cdnRequest).mockResolvedValue({id:'op_test',done:true})});
afterEach(()=>{process.env=baseline;});
describe('single-resource dual purge',()=>{
 it('rejects unverified resource and unsafe paths before network',async()=>{await expect(beginSharedCdnPurge('feed',['/*'],[])).rejects.toThrow('SHARED_CDN_UNSAFE_PATH');process.env.YANDEX_SHARED_CDN_RESOURCE_ID='wrong';await expect(beginSharedCdnPurge('feed',[path],[])).rejects.toThrow('SHARED_CDN_PURGE_UNVERIFIED');expect(cdnRequest).not.toHaveBeenCalled();expect(beginBegetCdnPurge).not.toHaveBeenCalled()});
 it('checkpoints exact-path receipt and preserves old-provider proof',async()=>{const cb=vi.fn();const ops=await beginSharedCdnPurge('feed',[path],[],cb);expect(cdnRequest).toHaveBeenCalledWith(`cache/${resource}:purge`,{paths:[path]});expect(ops).toHaveLength(2);expect(expectedSharedCdnReceipts('feed',[path],ops)).toBe(2);expect(cb).toHaveBeenCalledTimes(1);await beginSharedCdnPurge('feed',[path],ops,cb);expect(cdnRequest).toHaveBeenCalledTimes(1);expect(await sharedCdnPurgeDone('beget:old')).toBe(true);expect(begetCdnPurgeDone).toHaveBeenCalled()});
 it('requires both anonymous and signed deletion proof after operation',async()=>{const [op]=await beginSharedCdnPurge('feed',[path],[]);const now=Date.now()+901000;const fetcher=vi.fn(async()=>new Response(null,{status:404}));expect(await sharedCdnPurgeDone(op!,now,process.env,fetcher)).toBe(true);expect(fetcher).toHaveBeenCalledTimes(4);expect(fetcher).toHaveBeenCalledWith(`https://cdn.gafus.ru${path}`,expect.objectContaining({method:'GET'}));fetcher.mockResolvedValue(new Response(null,{status:403}));expect(await sharedCdnPurgeDone(op!,now,process.env,fetcher)).toBe(false)});
});
