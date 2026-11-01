import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createGalleryStorageFromEnv } from './index';
import { galleryStorageConfigFromEnv } from './config';
import { canonicalGalleryRequest, signGalleryRequest, createGalleryRequestVerifier } from './hmac';
import { signGalleryCdnUrl } from './cdn';
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
  it('signs vet previews only through Beget, never signs medical originals',()=>{
    const preview='users/owner/pets/pet/vet-visits/visit/photo/thumb.webp';
    const expires=timestamp+120;
    const url=new URL(signGalleryCdnUrl('https://fupiquafifeswu.begetcdn.cloud',preview,new Date(expires*1000),secret,timestamp*1000));
    const signature=createHash('md5').update(`${secret}/${preview}${expires}`).digest('base64url');
    expect(url.pathname).toBe(`/md5(${signature},${expires})/${preview}`);
    expect(url.search).toBe('');
    expect(originKey('/'+preview)).toBe(preview);
    expect(()=>originKey('/users/owner/pets/pet/vet-visits/visit/photo/original.pdf')).toThrow();
    expect(()=>signGalleryCdnUrl('https://gallery-dev.gafus.ru',preview,new Date(expires*1000),secret,timestamp*1000)).toThrow('CDN_PROVIDER_MISMATCH');
    expect(()=>signGalleryCdnUrl('https://fupiquafifeswu.begetcdn.cloud','users/owner/pets/pet/vet-visits/visit/photo/original.jpg',new Date(expires*1000),secret,timestamp*1000)).toThrow();
  });
  it('uses CDNvideo/Beget path-token syntax without exposing signing secret', () => {
    const expires = timestamp + 300;
    const url = new URL(signGalleryCdnUrl('https://fupiquafifeswu.begetcdn.cloud',key,new Date(expires*1000),secret,timestamp*1000));
    const md5 = createHash('md5').update(`${secret}/${key}${expires}`).digest('base64url');
    expect(url.pathname).toBe(`/md5(${md5},${expires})/${key}`);
    expect(url.search).toBe('');
    expect(url.toString()).not.toContain(secret);
    expect(() => signGalleryCdnUrl('https://feed.gafus.ru', key,
      new Date(expires * 1000), secret, timestamp * 1000)).toThrow('CDN_PROVIDER_MISMATCH');
    expect(() => signGalleryCdnUrl('https://other.begetcdn.cloud', key,
      new Date(expires * 1000), secret, timestamp * 1000)).toThrow('CDN_PROVIDER_MISMATCH');
    expect(() => signGalleryCdnUrl('https://images.example.org', key,
      new Date(expires * 1000), secret, timestamp * 1000, 'beget')).toThrow('CDN_PROVIDER_MISMATCH');
    expect(() => signGalleryCdnUrl('https://fupiquafifeswu.begetcdn.cloud',
      'albums/o/a/incoming/x/source.jpg',new Date(expires*1000),secret,timestamp*1000)).toThrow();
  });
  it('uses separate Beget signing keys only for explicitly selected new redirect CDN', () => {
    const next = { GALLERY_ENABLED: 'true', GALLERY_PROCESSOR_READY: 'true',
      GALLERY_BUCKET: 'gafus-gallery-private', GALLERY_S3_ENDPOINT: 'https://s3.cloud.ru',
      GALLERY_S3_ACCESS_KEY_ID: 'tenant:cloudru', GALLERY_S3_SECRET_ACCESS_KEY: 'fake-test-secret',
      GALLERY_CDN_SECRET: 'A'.repeat(32), GALLERY_INTERNAL_BASE_URL: 'https://api.example.test',
      GALLERY_INTERNAL_HMAC_SECRET: 'K'.repeat(32), GALLERY_CDN_PROVIDER: 'beget', GALLERY_CDN_REDIRECT_ENABLED: 'true',
      GALLERY_CDN_ORIGIN_ROUTE_ENABLED: 'true', GALLERY_CDN_EDGE_TOKEN_VERIFIED: 'true',
      GALLERY_CDN_REDIRECT_ORIGIN_SECRET: 'V'.repeat(48),
      GALLERY_CDN_REDIRECT_SIGNING_SECRET: 'R'.repeat(32),
      GALLERY_CDN_BASE_URL: 'https://fupiquafifeswu.begetcdn.cloud' };
    const c = galleryStorageConfigFromEnv(next);
    expect(c.cdnBaseUrl).toBe(next.GALLERY_CDN_BASE_URL);
    expect(c.cdnSecret).toBe(next.GALLERY_CDN_REDIRECT_SIGNING_SECRET);
    const url = signGalleryCdnUrl(c.cdnBaseUrl, key, new Date((timestamp+240)*1000), c.cdnSecret, timestamp*1000);
    expect(new URL(url).hostname).toBe('fupiquafifeswu.begetcdn.cloud');
    expect(() => galleryStorageConfigFromEnv({ ...next, GALLERY_CDN_BASE_URL: 'https://mepsuduyokabib.begetcdn.cloud' })).toThrow('UNSAFE_CDN_URL');
    expect(() => galleryStorageConfigFromEnv({ ...next, GALLERY_CDN_REDIRECT_ENABLED: 'false' })).toThrow('GALLERY_REDIRECT_REQUIRED');
    expect(() => galleryStorageConfigFromEnv({ ...next, GALLERY_CDN_ORIGIN_ROUTE_ENABLED: 'false' })).toThrow('GALLERY_CDN_REDIRECT_REQUIRES_ORIGIN');
  });
  it('disabled HEAD without credentials cannot prove deletion',async()=>{
    const storage=createGalleryStorageFromEnv({GALLERY_ENABLED:'false'});
    expect(storage.enabled).toBe(false); await expect(storage.head(key)).rejects.toThrow('MISSING_GALLERY_STORAGE');
  });
  it.each([{GALLERY_ENABLED:'true'},{GALLERY_BUCKET_PUBLIC:'true'},{GALLERY_ENABLED:'yes'}])('rejects unsafe/missing production configuration',env=>expect(()=>galleryStorageConfigFromEnv(env)).toThrow());
  it.each(['/albums/o/a/photos/p/%2e%2e/full.webp','/albums/o/a/photos/p/../full.webp','/albums/o/a/incoming/u/source.jpg','//albums/o/a/photos/p/full.webp','/albums/o/a/photos/p/full.webp?x=1'])('rejects untrusted origin path %s',path=>expect(()=>originKey(path)).toThrow());
});
