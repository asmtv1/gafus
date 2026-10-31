import { describe, expect, it } from 'vitest';
import { signGalleryCloudruFallback } from './fallback.js';
const key = 'albums/owner/album/photos/photo/full.webp';
const env = {
  GALLERY_ENABLED: 'true', GALLERY_PROCESSOR_READY: 'true',
  GALLERY_MEDIA_FALLBACK_ENABLED: 'true', GALLERY_CDN_EDGE_TOKEN_VERIFIED: 'true',
  GALLERY_BUCKET: 'gafus-gallery-private', GALLERY_S3_ENDPOINT: 'https://s3.cloud.ru',
  GALLERY_S3_ACCESS_KEY_ID: 'tenant:cloudru', GALLERY_S3_SECRET_ACCESS_KEY: 'fake-test-secret',
  GALLERY_CDN_BASE_URL: 'https://mepsuduyokabib.begetcdn.cloud', GALLERY_CDN_SECRET: 's'.repeat(24),
  GALLERY_INTERNAL_BASE_URL: 'https://api.example.test', GALLERY_INTERNAL_HMAC_SECRET: 'h'.repeat(32),
};
describe('Cloud.ru gallery fallback presigning', () => {
  it('issues short-lived SigV4 for an authorized final image', async () => {
    const url = new URL(await signGalleryCloudruFallback(key, 60, env));
    expect(url.hostname).toBe('s3.cloud.ru');
    expect(url.pathname).toBe('/gafus-gallery-private/' + key);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('fails closed on disabled mode and wrong keys/buckets', async () => {
    await expect(signGalleryCloudruFallback('albums/owner/album/incoming/u/source.jpg', 90, env))
      .rejects.toThrow('UNTRUSTED_FINAL_KEY');
    await expect(signGalleryCloudruFallback(key, 3600, env)).rejects.toThrow('INVALID_FALLBACK_TTL');
    await expect(signGalleryCloudruFallback(key, 90, { ...env, GALLERY_MEDIA_FALLBACK_ENABLED: 'false' }))
      .rejects.toThrow('GALLERY_FALLBACK_DISABLED');
    await expect(signGalleryCloudruFallback(key, 90, { ...env, GALLERY_BUCKET: 'other-private' }))
      .rejects.toThrow('GALLERY_FALLBACK_DISABLED');
  });
});

describe('private CDN origin presigning', () => {
  const active = { ...env, GALLERY_CDN_ORIGIN_ROUTE_ENABLED: 'true',
    GALLERY_CDN_REDIRECT_ORIGIN_SECRET: 'V'.repeat(48),
    GALLERY_CDN_REDIRECT_SIGNING_SECRET: 'R'.repeat(32) };
  it('signs GET/HEAD for only private finalized images, 60s TTL', async () => {
    const { signGalleryCloudruCdnOrigin } = await import('./fallback.js');
    for (const path of [key, 'gallery/owner/media/p/v2/thumb.webp',
      'users/u/pets/p/vet-visits/v/a/thumb.webp']) {
      for (const method of ['GET','HEAD'] as const) {
        const url = new URL(await signGalleryCloudruCdnOrigin(path,method,active));
        expect(url.hostname).toBe('s3.cloud.ru');
        expect(url.pathname).toBe(`/gafus-gallery-private/${path}`);
        expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
        expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });
  it('refuses disabled feature, public bucket, originals and arbitrary source',async()=>{
    const { signGalleryCloudruCdnOrigin } = await import('./fallback.js');
    for (const path of ['albums/o/a/incoming/id/source.jpg',
      'users/u/pets/p/vet-visits/v/a/original.pdf'])
      await expect(signGalleryCloudruCdnOrigin(path,'GET',active)).rejects.toThrow();
    for (const overrides of [
      {GALLERY_CDN_ORIGIN_ROUTE_ENABLED:'false'}, {GALLERY_BUCKET:'other-bucket'},
      {GALLERY_CDN_EDGE_TOKEN_VERIFIED:'false'}, {GALLERY_CDN_REDIRECT_ORIGIN_SECRET:'weak'},
    ]) await expect(signGalleryCloudruCdnOrigin(key,'GET',{...active,...overrides})).rejects.toThrow();
  });
});
