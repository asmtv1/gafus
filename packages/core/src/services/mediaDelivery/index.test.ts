import { describe, it, expect, vi } from 'vitest';
import { isCdnOutage, probeCdnOutage, probeHlsCdnOutage, cloudruFallbackManifestUrl, isTrustedCdnProbeUrl } from './index';
describe('CDN fail-closed transport fallback policy', () => {
  it('never bypasses 403/404 or any known non-5xx response', () => {
    for (const status of [200, 204, 301, 400, 401, 403, 404, 429])
      expect(isCdnOutage({ status, timedOut: true, networkFailed: true })).toBe(false);
    for (const status of [500, 502, 503, 504, 599]) expect(isCdnOutage({ status })).toBe(true);
  });
  it('does not turn opaque Web CORS failures into storage bypasses', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError('CORS blocked'); }) as unknown as typeof fetch;
    expect(await probeCdnOutage('https://cdn.gafus.test/signed.webp', { fetcher })).toBe(false);
    expect(await probeCdnOutage('https://cdn.gafus.test/signed.webp', { fetcher, nativeNetwork: true })).toBe(true);
    expect(await probeCdnOutage('http://127.0.0.1/private', { fetcher, nativeNetwork: true })).toBe(false);
  });
  it('allows only 5xx HEAD statuses, not 403/404', async () => {
    for (const [status, expected] of [[403, false], [404, false], [503, true]] as const) {
      const fetcher = vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch;
      expect(await probeCdnOutage('https://cdn.gafus.test/path?md5=one', { fetcher })).toBe(expected);
      expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'HEAD' }));
    }
  });
  it('requires a CDN segment, never treats an API manifest 5xx as CDN outage', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    expect(await probeHlsCdnOutage('https://api.gafus.test/manifest', { fetcher })).toBe(false);
    const segment = `https://cdn.gafus.test/posts/a/b/attachments/c/hls/segment-000.ts?md5=abc&expires=123`;
    const manifest = `#EXTM3U\n#EXTINF:2,\n${segment}\n#EXT-X-ENDLIST\n`;
    const good = vi.fn(async (url: string) => url.includes('manifest')
      ? new Response(manifest) : new Response(null, { status: 503 })) as unknown as typeof fetch;
    expect(await probeHlsCdnOutage('https://api.gafus.test/manifest', { fetcher: good })).toBe(true);
  });
  it('rejects any client-provided arbitrary fallback manifest URL', () => {
    expect(cloudruFallbackManifestUrl('/api/v1/feed-playback/media?ticket=abc.def'))
      .toBe('/api/v1/feed-playback/media?ticket=abc.def&source=cloudru');
    expect(() => cloudruFallbackManifestUrl('https://other.test/m3u8')).toThrow();
  });
});

describe('authorized same-origin Web CDN status proxy target', () => {
  const now = 1791820000000;
  const path = '/posts/owner/post/attachments/media/thumb.webp';
  const signed = `https://feed.gafus.ru${path}?md5=${'A'.repeat(22)}&expires=${Math.floor(now / 1000) + 90}`;
  const allowed = ['feed.gafus.ru', 'gallery-dev.gafus.ru'];
  it('accepts only supported signed media path on explicitly approved hosts', () => {
    expect(isTrustedCdnProbeUrl(signed, allowed, now)).toBe(true);
    expect(isTrustedCdnProbeUrl(signed.replace('feed.gafus.ru', 'evil.example'), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('https:', 'http:'), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('/posts/', '/admin/'), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed + '&source=cloudru', allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('thumb.webp', 'secret.txt'), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('expires=', 'xexpires='), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('feed.gafus.ru', 'feed.gafus.ru:444'), allowed, now)).toBe(false);
  });
  it('rejects expired or long-lived probe URLs', () => {
    expect(isTrustedCdnProbeUrl(signed.replace(/expires=\d+/, `expires=${Math.floor(now/1000)-200}`),allowed,now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace(/expires=\d+/, `expires=${Math.floor(now/1000)+10000}`),allowed,now)).toBe(false);
  });
});
