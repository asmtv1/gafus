import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createGalleryStorageFromEnv } from './index';
import { galleryStorageConfigFromEnv } from './config';
import { canonicalGalleryRequest, signGalleryRequest, createGalleryRequestVerifier } from './hmac';
import { signGalleryCdnUrl, verifyGalleryCdnToken } from './cdn';
import { originKey } from './keys';
const secret = '0123456789abcdef0123456789abcdef';
const key = 'albums/o/a/photos/p/full.webp';
const path = '/internal/gallery/uploads/complete' as const;
const body = '{"uploadId":"u","attemptToken":"a"}';
const timestamp = 1800000000, nonce = 'nonce_0123456789abcdef';
describe('request authentication', () => {
  it('matches an independently constructed canonical vector', () => {
    const canonical = ['gallery-v1',String(timestamp),nonce,'POST',path,createHash('sha256').update(body).digest('hex')].join('\n');
    expect(canonicalGalleryRequest('POST',path,body,String(timestamp),nonce)).toBe(canonical);
    expect(signGalleryRequest({method:'POST',path,body,secret,timestamp,nonce})['x-gallery-signature']).toBe('ab7b961b134028dc7eae285c2b37f3952c6457f434648d1302f37d00e283213a');
  });
  it('consumes nonce once with future-safe expiry', async () => {
    const seen = new Set<string>(); const consume = vi.fn(async (n:string) => !seen.has(n) && !!seen.add(n));
    const verify = createGalleryRequestVerifier({secret,now:()=>timestamp*1000,nonces:{consume}});
    const request = {method:'POST',path,body,headers:signGalleryRequest({method:'POST',path,body,secret,timestamp:timestamp+60,nonce})};
    expect(await verify(request)).toBe(true); expect(await verify(request)).toBe(false);
    expect(consume).toHaveBeenCalledWith(`gallery-v1:${nonce}`, (timestamp+121)*1000);
  });
  it.each([['body',body+' '],['path','/internal/gallery/jobs/complete'],['method','GET']])('rejects altered %s before nonce consumption', async (field,value) => {
    const consume=vi.fn(async()=>true); const verify=createGalleryRequestVerifier({secret,now:()=>timestamp*1000,nonces:{consume}});
    expect(await verify({method:'POST',path,body,headers:signGalleryRequest({method:'POST',path,body,secret,timestamp,nonce}),[field]:value})).toBe(false); expect(consume).not.toHaveBeenCalled();
  });
  it.each([-61,61])('rejects timestamp outside 60 seconds (%s)',async offset=>{
    const verify=createGalleryRequestVerifier({secret,now:()=>timestamp*1000,nonces:{consume:async()=>true}});
    expect(await verify({method:'POST',path,body,headers:signGalleryRequest({method:'POST',path,body,secret,timestamp:timestamp+offset,nonce})})).toBe(false);
  });
  it('fails closed when shared nonce storage is unavailable',async()=>{
    const verify=createGalleryRequestVerifier({secret,now:()=>timestamp*1000,nonces:{consume:async()=>{throw Error('unavailable');}}});
    await expect(verify({method:'POST',path,body,headers:signGalleryRequest({method:'POST',path,body,secret,timestamp,nonce})})).rejects.toThrow('unavailable');
  });
});
describe('private CDN and configuration',()=>{
  it('allows signed vet previews and rejects medical originals at CDN origin',()=>{
    const preview='users/owner/pets/pet/vet-visits/visit/photo/thumb.webp';
    const url=new URL(signGalleryCdnUrl('https://images.example.org',preview,new Date((timestamp+120)*1000),secret,timestamp*1000));
    expect(originKey('/'+preview)).toBe(preview);
    expect(verifyGalleryCdnToken('/'+preview,Object.fromEntries(url.searchParams),secret,timestamp*1000)).toBe(true);
    expect(()=>originKey('/users/owner/pets/pet/vet-visits/visit/photo/original.pdf')).toThrow();
    expect(()=>originKey('/users/owner/pets/pet/vet-visits/visit/photo/original.jpg')).toThrow();
    expect(verifyGalleryCdnToken('/'+preview.replace('owner','other'),Object.fromEntries(url.searchParams),secret,timestamp*1000)).toBe(false);
  });
  it('uses Yandex MD5 expires+path+space+key without IP binding',()=>{
    const expires=timestamp+120;
    const url=new URL(signGalleryCdnUrl('https://images.example.org',key,new Date(expires*1000),secret,timestamp*1000));
    expect(url.searchParams.get('md5')).toBe(createHash('md5').update(`${expires}/${key} ${secret}`).digest('base64url'));
    expect(verifyGalleryCdnToken('/'+key,Object.fromEntries(url.searchParams),secret,timestamp*1000)).toBe(true);
    expect(verifyGalleryCdnToken('/'+key,Object.fromEntries(url.searchParams),secret,expires*1000)).toBe(false);
    expect(verifyGalleryCdnToken('/'+key.replace('full','thumb'),Object.fromEntries(url.searchParams),secret,timestamp*1000)).toBe(false);
  });
  it('disabled HEAD without credentials cannot prove deletion',async()=>{
    const storage=createGalleryStorageFromEnv({GALLERY_ENABLED:'false'});
    expect(storage.enabled).toBe(false); await expect(storage.head(key)).rejects.toThrow('MISSING_GALLERY_STORAGE');
  });
  it.each([{GALLERY_ENABLED:'true'},{GALLERY_BUCKET_PUBLIC:'true'},{GALLERY_ENABLED:'yes'}])('rejects unsafe/missing production configuration',env=>expect(()=>galleryStorageConfigFromEnv(env)).toThrow());
  it.each(['/albums/o/a/photos/p/%2e%2e/full.webp','/albums/o/a/photos/p/../full.webp','/albums/o/a/incoming/u/source.jpg','//albums/o/a/photos/p/full.webp','/albums/o/a/photos/p/full.webp?x=1'])('rejects untrusted origin path %s',path=>expect(()=>originKey(path)).toThrow());
});
