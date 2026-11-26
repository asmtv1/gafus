import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { cdnRequest } from '../../packages/cdn-upload/src/yandexCdnRequest.ts';
const resource='bc8rr3yxsrkobnonoi2w';
const path='/media/v2/cdn_canary_20261125/v1/image/s.webp';
const manifest=JSON.parse(process.env.YANDEX_SHARED_CDN_SMOKE_MANIFEST||'{}');
const item=manifest.feedImage;
if(process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.YANDEX_SHARED_CDN_RESOURCE_ID!==resource||item?.key!==path.slice(1)||!/^[a-f0-9]{64}$/.test(item.sha256||'')||item.bytes!==88) throw Error('CANARY_SCOPE_INVALID');
const key=JSON.parse(Buffer.from(process.env.CDN_CLEANUP_SERVICE_ACCOUNT_KEY_B64||'','base64').toString('utf8'));
if(key.service_account_id!=='ajehgn5m3laqrcb7lppr') throw Error('CANARY_ACCOUNT_INVALID');
async function get(){const r=await fetch('https://cdn.gafus.ru'+path,{redirect:'error',signal:AbortSignal.timeout(10000)});const b=Buffer.from(await r.arrayBuffer());if(r.status!==200||b.length!==item.bytes||createHash('sha256').update(b).digest('hex')!==item.sha256)throw Error('CANARY_BYTES_MISMATCH');return {cache:r.headers.get('cache-status'),host:r.headers.get('cache-host')};}
const before=await get();const warm=await get();console.log('CANARY_BEFORE',before.cache,warm.cache,'same_edge',before.host===warm.host);
const operation=await cdnRequest(`cache/${resource}:purge`,{paths:[path]});if(!/^[A-Za-z0-9_-]{1,128}$/.test(operation.id||''))throw Error('CANARY_INVALID_OPERATION');let done=operation.done;for(let i=0;!done&&i<20;i++){await delay(3000);done=(await cdnRequest(`operations/${operation.id}`)).done;}if(!done)throw Error('CANARY_PURGE_TIMEOUT');console.log('CANARY_IAM_PURGE_API_PASS',operation.id);
const after=await get();console.log('CANARY_AFTER',after.cache,'same_edge',after.host===warm.host);if(warm.cache==='HIT'&&after.host===warm.host&&after.cache==='MISS')console.log('CANARY_EDGE_EVICTION_OBSERVED');else console.log('CANARY_EDGE_EVICTION_NOT_PROVEN');
