import { describe, it, expect, vi } from 'vitest';
import { isCdnOutage, isMediaCdnFailoverActive, isSignedCdnFailoverActive, MEDIA_CDN_OUTAGE_COOLDOWN_MS, probeCdnOutage, probeHlsCdnOutage, cloudruFallbackManifestUrl, isTrustedCdnProbeUrl, mediaCdnKindFromSignedUrl } from './index';
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
    const segment = `https://garaquachegasourn.begetcdn.cloud/md5(${'A'.repeat(22)},1999999999)/posts/a/b/attachments/c/hls/segment-000.ts`;
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
  const signed = `https://garaquachegasourn.begetcdn.cloud/md5(${'A'.repeat(22)},${Math.floor(now / 1000) + 90})${path}`;
  const allowed = ['garaquachegasourn.begetcdn.cloud', 'mepsuduyokabib.begetcdn.cloud'];
  it('accepts only supported signed media path on explicitly approved hosts', () => {
    expect(isTrustedCdnProbeUrl(signed, allowed, now)).toBe(true);
    expect(isTrustedCdnProbeUrl(signed.replace('garaquachegasourn.begetcdn.cloud', 'evil.example'), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('https:', 'http:'), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('/posts/', '/admin/'), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed + '&source=cloudru', allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('thumb.webp', 'secret.txt'), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('md5(', 'bad('), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('garaquachegasourn.begetcdn.cloud', 'garaquachegasourn.begetcdn.cloud:444'), allowed, now)).toBe(false);
  });
  it('accepts only signed Beget URLs on exact approved service hosts', () => {
    const expires = Math.floor(now / 1000) + 300;
    const beget = `https://garaquachegasourn.begetcdn.cloud/md5(${'A'.repeat(22)},${expires})${path}`;
    expect(isTrustedCdnProbeUrl(beget, [...allowed, 'garaquachegasourn.begetcdn.cloud'], now)).toBe(true);
    expect(isTrustedCdnProbeUrl(beget + '?x=1', [...allowed, 'garaquachegasourn.begetcdn.cloud'], now)).toBe(false);
    expect(isTrustedCdnProbeUrl(beget.replace('/posts/','/incoming/'), [...allowed, 'garaquachegasourn.begetcdn.cloud'], now)).toBe(false);
    expect(isTrustedCdnProbeUrl(beget, allowed.filter(host => host !== 'garaquachegasourn.begetcdn.cloud'), now)).toBe(false);
    expect(mediaCdnKindFromSignedUrl(beget)).toBe('feed');
    expect(mediaCdnKindFromSignedUrl(beget.replace('garaquachegasourn.begetcdn.cloud','evil.begetcdn.cloud'))).toBeNull();
  });
  it('rejects expired or long-lived probe URLs', () => {
    expect(isTrustedCdnProbeUrl(signed.replace(/,\d{10}\)/, `,${Math.floor(now/1000)-200})`),allowed,now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace(/,\d{10}\)/, `,${Math.floor(now/1000)+10000})`),allowed,now)).toBe(false);
  });
});


describe('60-second per-CDN failover circuit breaker', () => {
  const gallery = `https://mepsuduyokabib.begetcdn.cloud/md5(${'A'.repeat(22)},1999999999)/albums/owner/album/photos/photo/full.webp`;
  const feed = `https://garaquachegasourn.begetcdn.cloud/md5(${'B'.repeat(22)},1999999999)/posts/owner/post/attachments/item/poster.webp`;
  it('opens only the failing CDN for 60 seconds, then retries the CDN on demand', async () => {
    const now = Date.now() + 200_000;
    vi.useFakeTimers({ now });
    try {
      const unavailable = vi.fn(async () => new Response(null, { status: 504 })) as unknown as typeof fetch;
      expect(await probeCdnOutage(gallery, { fetcher: unavailable })).toBe(true);
      expect(isSignedCdnFailoverActive(gallery)).toBe(true);
      expect(isSignedCdnFailoverActive(feed)).toBe(false);
      expect(isMediaCdnFailoverActive('gallery')).toBe(true);
      expect(isMediaCdnFailoverActive('feed')).toBe(false);
      vi.advanceTimersByTime(MEDIA_CDN_OUTAGE_COOLDOWN_MS - 1);
      expect(isSignedCdnFailoverActive(gallery)).toBe(true);
      vi.advanceTimersByTime(1);
      expect(isSignedCdnFailoverActive(gallery)).toBe(false);
      expect(await probeCdnOutage(feed, { fetcher: unavailable })).toBe(true);
      expect(isMediaCdnFailoverActive('feed')).toBe(true);
      expect(isMediaCdnFailoverActive('gallery')).toBe(false);
      vi.advanceTimersByTime(MEDIA_CDN_OUTAGE_COOLDOWN_MS);
      expect(isMediaCdnFailoverActive('feed')).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it('does not open a CDN circuit on 403/404, native network failures or unsigned URLs', async () => {
    const now = Date.now() + 400_000;
    vi.useFakeTimers({ now });
    try {
      for (const status of [403, 404]) {
        expect(await probeCdnOutage(feed, { fetcher: async () => new Response(null, { status }) })).toBe(false);
        expect(isMediaCdnFailoverActive('feed')).toBe(false);
      }
      const networkError = async () => { throw new Error('offline'); };
      expect(await probeCdnOutage(feed, { fetcher: networkError, nativeNetwork: true })).toBe(true);
      expect(isMediaCdnFailoverActive('feed')).toBe(false);
      expect(await probeCdnOutage(feed.replace('garaquachegasourn.begetcdn.cloud', 'evil.example'), {
        fetcher: async () => new Response(null, { status: 504 }),
      })).toBe(true);
      expect(isMediaCdnFailoverActive('feed')).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
