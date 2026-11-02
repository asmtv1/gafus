import { describe, it, expect, vi } from 'vitest';
import { isCdnOutage, isMediaCdnFailoverActive, isSignedCdnFailoverActive, MEDIA_CDN_OUTAGE_COOLDOWN_MS, probeCdnOutage, isTrustedCdnProbeUrl, mediaCdnKindFromSignedUrl } from './index';
describe('CDN fail-closed transport fallback policy', () => {
  it('does not bypass 403/404; recognizes 410 edge retirement and 5xx failures', () => {
    for (const status of [200, 204, 301, 400, 401, 403, 404, 429])
      expect(isCdnOutage({ status, timedOut: true, networkFailed: true })).toBe(false);
    for (const status of [410, 500, 502, 503, 504, 599]) expect(isCdnOutage({ status })).toBe(true);
  });
  it('does not turn opaque Web CORS failures into storage bypasses', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError('CORS blocked'); }) as unknown as typeof fetch;
    expect(await probeCdnOutage('https://cdn.gafus.test/signed.webp', { fetcher })).toBe(false);
    expect(await probeCdnOutage('https://cdn.gafus.test/signed.webp', { fetcher, nativeNetwork: true })).toBe(true);
    expect(await probeCdnOutage('http://127.0.0.1/private', { fetcher, nativeNetwork: true })).toBe(false);
  });
  it('allows 410 and 5xx HEAD statuses, not 403/404', async () => {
    for (const [status, expected] of [[403, false], [404, false], [410, true], [503, true]] as const) {
      const fetcher = vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch;
      expect(await probeCdnOutage('https://cdn.gafus.test/path?md5=one', { fetcher })).toBe(expected);
      expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'HEAD' }));
    }
  });
  it('recognizes only signed Gallery V2 media on the migrated Beget CDN', () => {
    const path = '/gallery/owner/media/image/v2/thumb.webp';
    const token = `md5(${'A'.repeat(22)},1999999999)`;
    const url = `https://fupiquafifeswu.begetcdn.cloud/${token}${path}`;
    expect(mediaCdnKindFromSignedUrl(url)).toBe('gallery');
    expect(mediaCdnKindFromSignedUrl(url.replace('thumb.webp','original.pdf'))).toBeNull();
    expect(mediaCdnKindFromSignedUrl(url.replace('fupiquafifeswu.begetcdn.cloud','untrusted.test'))).toBeNull();
    expect(isTrustedCdnProbeUrl(url,['fupiquafifeswu.begetcdn.cloud'],1999990000000)).toBe(false);
    expect(isTrustedCdnProbeUrl(url,['fupiquafifeswu.begetcdn.cloud'],1999999800000)).toBe(true);
  });
  it('recognizes progressive MP4 CDN paths without using any HLS manifest', () => {
    const url = `https://quepraquiecebquomiel.begetcdn.cloud/media/v2/media/v1/video/360.mp4?md5=${'A'.repeat(22)}&expires=1999999999`;
    expect(mediaCdnKindFromSignedUrl(url)).toBe('feed');
    expect(mediaCdnKindFromSignedUrl(url.replace('quepraquiecebquomiel.begetcdn.cloud',
      'garaquachegasourn.begetcdn.cloud'))).toBeNull();
    expect(mediaCdnKindFromSignedUrl(url.replace('360.mp4','360.m3u8'))).toBeNull();
  });
});

describe('authorized same-origin Web CDN status proxy target', () => {
  const now = 1791820000000;
  const path = '/media/v2/media/v1/image/m.webp';
  const signed = `https://quepraquiecebquomiel.begetcdn.cloud${path}?md5=${'A'.repeat(22)}&expires=${Math.floor(now / 1000) + 90}`;
  const allowed = ['quepraquiecebquomiel.begetcdn.cloud', 'fupiquafifeswu.begetcdn.cloud'];
  it('accepts only supported signed media path on explicitly approved hosts', () => {
    expect(isTrustedCdnProbeUrl(signed, allowed, now)).toBe(true);
    expect(isTrustedCdnProbeUrl(signed.replace('quepraquiecebquomiel.begetcdn.cloud', 'evil.example'), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('https:', 'http:'), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('/media/', '/admin/'), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed + '&source=cloudru', allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('m.webp', 'secret.txt'), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('?md5=', '?bad='), allowed, now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace('quepraquiecebquomiel.begetcdn.cloud', 'quepraquiecebquomiel.begetcdn.cloud:444'), allowed, now)).toBe(false);
  });
  it('accepts only signed Beget URLs on exact approved service hosts', () => {
    const expires = Math.floor(now / 1000) + 300;
    const beget = `https://quepraquiecebquomiel.begetcdn.cloud${path}?md5=${'A'.repeat(22)}&expires=${expires}`;
    expect(isTrustedCdnProbeUrl(beget, [...allowed, 'quepraquiecebquomiel.begetcdn.cloud'], now)).toBe(true);
    expect(isTrustedCdnProbeUrl(beget + '&x=1', [...allowed, 'quepraquiecebquomiel.begetcdn.cloud'], now)).toBe(false);
    expect(isTrustedCdnProbeUrl(beget.replace('/media/','/incoming/'), [...allowed, 'quepraquiecebquomiel.begetcdn.cloud'], now)).toBe(false);
    expect(isTrustedCdnProbeUrl(beget, allowed.filter(host => host !== 'quepraquiecebquomiel.begetcdn.cloud'), now)).toBe(false);
    expect(mediaCdnKindFromSignedUrl(beget)).toBe('feed');
    expect(mediaCdnKindFromSignedUrl(beget.replace('quepraquiecebquomiel.begetcdn.cloud','evil.begetcdn.cloud'))).toBeNull();
  });
  it('rejects expired or long-lived probe URLs', () => {
    expect(isTrustedCdnProbeUrl(signed.replace(/expires=\d{10}/, `expires=${Math.floor(now/1000)-200}`),allowed,now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed.replace(/expires=\d{10}/, `expires=${Math.floor(now/1000)+10000}`),allowed,now)).toBe(false);
  });
});


describe('60-second per-CDN failover circuit breaker', () => {
  const gallery = `https://fupiquafifeswu.begetcdn.cloud/md5(${'A'.repeat(22)},1999999999)/albums/owner/album/photos/photo/full.webp`;
  const feed = `https://quepraquiecebquomiel.begetcdn.cloud/media/v2/item/v1/poster.webp?md5=${'B'.repeat(22)}&expires=1999999999`;
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
  it('410 object loss must not poison other media on the CDN', async () => {
    // Fixed future timestamp isolates this case from earlier circuit tests.
    const now = 2_000_000_000_000;
    vi.useFakeTimers({ now });
    try {
      expect(await probeCdnOutage(feed, { fetcher: async () => new Response(null, { status: 410 }) })).toBe(true);
      expect(isMediaCdnFailoverActive('feed')).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it('fails closed when the authenticated Web status proxy itself fails, but native can recover', async () => {
    const url=`https://fupiquafifeswu.begetcdn.cloud/md5(${'A'.repeat(22)},1999999999)/albums/owner/album/photos/photo/thumb.webp`;
    const failed=async()=>{throw new Error('proxy network failed');};
    expect(await probeCdnOutage(url,{fetcher:failed})).toBe(false);
    expect(await probeCdnOutage(url,{fetcher:failed,nativeNetwork:true})).toBe(true);
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
      expect(await probeCdnOutage(feed.replace('quepraquiecebquomiel.begetcdn.cloud', 'evil.example'), {
        fetcher: async () => new Response(null, { status: 504 }),
      })).toBe(true);
      expect(isMediaCdnFailoverActive('feed')).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});


describe('strict public finals status probe', () => {
  const chat='https://gonomudedoje.begetcdn.cloud/chat2/room/user/00000000-0000-4000-8000-000000000000/v1/video/360.mp4';
  const questions='https://ebiteskukingusk.begetcdn.cloud/questions/uploads/questions/v2/owner-1/01234567-89ab-4def-8123-456789abcdef/v1/image/s.webp';
  const hosts=['gonomudedoje.begetcdn.cloud','ebiteskukingusk.begetcdn.cloud'];
  it('permits exact immutable Chat2 and Questions CDN variants', () => {
    expect(isTrustedCdnProbeUrl(chat,hosts)).toBe(true);
    expect(isTrustedCdnProbeUrl(questions,hosts)).toBe(true);
  });
  it('rejects unknown hosts, query params, non-final keys, origin and escape', () => {
    for(const raw of [chat+'?token=x',chat.replace('gonomudedoje','unknown'),
      chat.replace('/video/360.mp4','/incoming/video.mp4'),
      questions.replace('/image/s.webp','/image/original.jpg'),
      questions.replace('ebiteskukingusk','unknown'),questions.replace('https:','http:'),
      questions.replace('/questions/','/questions/../')])
      expect(isTrustedCdnProbeUrl(raw,hosts)).toBe(false);
  });
});
