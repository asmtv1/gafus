import { describe, expect, it } from 'vitest';
import { signGalleryCloudruFallback, signGalleryCloudruRedirectProbe, signGalleryCloudruCdnOrigin } from './fallback.js';
const key = 'albums/beget-smoke-0123456789abcdef0123456789abcdef/beget-smoke-0123456789abcdef0123456789abcdef/photos/0123456789abcdef0123456789abcdef/full.webp';
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

describe('isolated Beget redirect probe signer', () => {
  it('signs GET and HEAD for exactly 60 seconds with distinct SigV4 method signatures', async () => {
    const get = new URL(await signGalleryCloudruRedirectProbe(key, 'GET', env));
    const head = new URL(await signGalleryCloudruRedirectProbe(key, 'HEAD', env));
    expect(get.hostname).toBe('s3.cloud.ru');
    expect(get.pathname).toBe('/gafus-gallery-private/' + key);
    expect(get.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(head.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(get.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(head.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(head.searchParams.get('X-Amz-Signature')).not.toBe(get.searchParams.get('X-Amz-Signature'));
    expect(get.searchParams.get('response-cache-control')).toBe('public, max-age=600');
  });
  it('rejects incoming objects, veterinary files and wrong buckets', async () => {
    await expect(signGalleryCloudruRedirectProbe('albums/a/b/incoming/c/source.jpg', 'GET', env)).rejects.toThrow();
    await expect(signGalleryCloudruRedirectProbe('users/u/pets/p/vet-visits/v/f/thumb.webp', 'GET', env)).rejects.toThrow();
    await expect(signGalleryCloudruRedirectProbe(key, 'GET', { ...env, GALLERY_BUCKET: 'other-private' })).rejects.toThrow();
  });
});

describe('Gallery CDN-only SigV4 origin signer', () => {
  const redirectEnv = { ...env, GALLERY_CDN_ORIGIN_ROUTE_ENABLED: 'true', GALLERY_CDN_REDIRECT_ENABLED: 'true',
    GALLERY_CDN_BASE_URL: 'https://dikinuneceswe.begetcdn.cloud',
    GALLERY_CDN_REDIRECT_ORIGIN_SECRET: 'V'.repeat(64),
    GALLERY_CDN_REDIRECT_SIGNING_SECRET: 'K'.repeat(32) };
  it('signs short-lived GET and HEAD without reading any S3 bytes', async () => {
    const get = new URL(await signGalleryCloudruCdnOrigin(key, 'GET', redirectEnv));
    const head = new URL(await signGalleryCloudruCdnOrigin(key, 'HEAD', redirectEnv));
    expect(get.hostname).toBe('s3.cloud.ru');
    expect(get.pathname).toBe('/gafus-gallery-private/' + key);
    expect(get.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(get.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(head.searchParams.get('X-Amz-Signature')).not.toBe(get.searchParams.get('X-Amz-Signature'));
  });
  it('works for canary origin requests before the viewer delivery host switches', async () => {
    const canary = { ...redirectEnv, GALLERY_CDN_REDIRECT_ENABLED: 'false',
      GALLERY_CDN_BASE_URL: env.GALLERY_CDN_BASE_URL };
    const url = new URL(await signGalleryCloudruCdnOrigin(key, 'GET', canary));
    expect(url.hostname).toBe('s3.cloud.ru');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
  });
  it('fails closed for original files, untrusted buckets and disabled mode', async () => {
    await expect(signGalleryCloudruCdnOrigin('users/u/pets/p/vet-visits/v/a/original.pdf', 'GET', redirectEnv)).rejects.toThrow();
    await expect(signGalleryCloudruCdnOrigin(key, 'GET', { ...redirectEnv, GALLERY_CDN_ORIGIN_ROUTE_ENABLED: 'false' })).rejects.toThrow();
    await expect(signGalleryCloudruCdnOrigin(key, 'GET', { ...redirectEnv, GALLERY_BUCKET: 'another-bucket' })).rejects.toThrow();
    await expect(signGalleryCloudruCdnOrigin(key, 'GET', { ...redirectEnv, GALLERY_CDN_BASE_URL: 'https://untrusted.begetcdn.cloud' })).rejects.toThrow();
  });
});
