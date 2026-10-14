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
