import { describe, expect, it } from 'vitest';
import { signFeedCloudruFallback } from './fallback.js';
const key = 'posts/owner/post/attachments/media/hls/segment-000.ts';
const env = {
  FEED_ENABLED: 'true', FEED_PROCESSOR_READY: 'true',
  FEED_MEDIA_FALLBACK_ENABLED: 'true', FEED_CDN_EDGE_TOKEN_VERIFIED: 'true',
  FEED_BUCKET: 'gafus-feed-private', FEED_S3_ENDPOINT: 'https://s3.cloud.ru',
  FEED_S3_ACCESS_KEY_ID: 'tenant:cloudru', FEED_S3_SECRET_ACCESS_KEY: 'fake-testing-only-secret',
  FEED_CDN_BASE_URL: 'https://feed.example.test', FEED_CDN_SECRET: 's'.repeat(24),
  FEED_INTERNAL_HMAC_SECRET: 'h'.repeat(32),
};
describe('Cloud.ru feed fallback presigning', () => {
  it('presigns the exact final HLS segment without a network call', async () => {
    const url = new URL(await signFeedCloudruFallback(key, 90, env));
    expect(url.hostname).toBe('s3.cloud.ru');
    expect(url.pathname).toBe('/gafus-feed-private/' + key);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('90');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('response-cache-control')).toBe('private, no-store');
  });
  it('rejects unapproved keys, disabled fallback, wrong destination and long TTL', async () => {
    await expect(signFeedCloudruFallback('posts/owner/post/incoming/id/source.mp4', 90, env))
      .rejects.toThrow('UNTRUSTED_FEED_FINAL_KEY');
    await expect(signFeedCloudruFallback(key, 3600, env)).rejects.toThrow('INVALID_FALLBACK_TTL');
    await expect(signFeedCloudruFallback(key, 90, { ...env, FEED_MEDIA_FALLBACK_ENABLED: 'false' }))
      .rejects.toThrow('FEED_FALLBACK_DISABLED');
    await expect(signFeedCloudruFallback(key, 90, { ...env, FEED_BUCKET: 'unapproved-private' }))
      .rejects.toThrow('FEED_FALLBACK_DISABLED');
  });
});
