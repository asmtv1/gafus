/** Shared Web/Mobile outage classification. A 403/404 must never trigger storage fallback. */
export function isCdnOutage(input: { status?: number; timedOut?: boolean; networkFailed?: boolean }) {
  if (input.status !== undefined) return Number.isInteger(input.status) && input.status >= 500 && input.status <= 599;
  return input.timedOut === true || input.networkFailed === true;
}
/** Per-client, per-CDN circuit breaker. Does not store S3 URLs or authorization grants.
 * Only a confirmed 5xx (or Gallery 499) on our signed CDN URL can open it. After 60 seconds,
 * the next media request retries the CDN; 403/404 never open the circuit.
 */
export type MediaCdnKind = 'gallery' | 'feed';
export const MEDIA_CDN_OUTAGE_COOLDOWN_MS = 60_000;
const cdnFailedUntil: Record<MediaCdnKind, number> = { gallery: 0, feed: 0 };

/** Public Feed URL validation is enabled only with an exact dedicated Beget host. */
function publicFeedCdnHost(): string | null {
  if (process.env.FEED_BUCKET_PUBLIC !== 'true') return null;
  const match = /^https:\/\/([a-z0-9-]+\.begetcdn\.cloud)$/.exec(process.env.FEED_CDN_BASE_URL ?? '');
  return match && match[1] !== 'garaquachegasourn.begetcdn.cloud' ? match[1] : null;
}
/** Classify approved CDN final-object URLs for isolated per-service failover. */
export function mediaCdnKindFromSignedUrl(raw: string): MediaCdnKind | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
        url.pathname.includes('%') || url.pathname.includes('..') || url.pathname.includes('//')) return null;
    if (url.hostname === publicFeedCdnHost() && !url.search) {
      const path = url.pathname;
      return /^\/posts\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/attachments\/[A-Za-z0-9_-]+\/(?:thumb|full|poster)\.webp$/.test(path) ||
        /^\/posts\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/attachments\/[A-Za-z0-9_-]+\/hls\/segment-[0-9]{3,5}\.ts$/.test(path)
        ? 'feed' : null;
    }
    const gallery = ['mepsuduyokabib.begetcdn.cloud', 'dikinuneceswe.begetcdn.cloud'].includes(url.hostname);
    const feed = url.hostname === 'garaquachegasourn.begetcdn.cloud';
    if (!gallery && !feed || url.search) return null;
    const path = url.pathname.replace(/^\/md5\([A-Za-z0-9_-]{22},\d{10}\)/, '');
    if (path === url.pathname) return null;
    if (gallery && /^\/albums\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+\/(?:thumb|full)\.webp$/.test(path)) return 'gallery';
    if (gallery && /^\/users\/[A-Za-z0-9_-]+\/pets\/[A-Za-z0-9_-]+\/vet-visits\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/thumb\.webp$/.test(path)) return 'gallery';
    if (feed && /^\/posts\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/attachments\/[A-Za-z0-9_-]+\/(?:thumb|full|poster)\.webp$/.test(path)) return 'feed';
    if (feed && /^\/posts\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/attachments\/[A-Za-z0-9_-]+\/hls\/segment-[0-9]{3,5}\.ts$/.test(path)) return 'feed';
  } catch { /* Unknown URLs must not affect circuit state. */ }
  return null;
}

export function isMediaCdnFailoverActive(kind: MediaCdnKind, now = Date.now()): boolean {
  return now < cdnFailedUntil[kind];
}
export function isSignedCdnFailoverActive(url: string, now = Date.now()): boolean {
  const kind = mediaCdnKindFromSignedUrl(url);
  return kind !== null && isMediaCdnFailoverActive(kind, now);
}

function recordSignedCdnOutage(url: string, now = Date.now()): void {
  const kind = mediaCdnKindFromSignedUrl(url);
  if (kind) cdnFailedUntil[kind] = now + MEDIA_CDN_OUTAGE_COOLDOWN_MS;
}

/** HEAD probes are required because <img> and native players omit HTTP error status. */
export async function probeCdnOutage(
  url: string,
  options: { fetcher?: typeof fetch; timeoutMs?: number; nativeNetwork?: boolean } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 3500;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) return false;
  let target: URL;
  try { target = new URL(url); } catch { return false; }
  if (target.protocol !== 'https:' || target.username || target.password) return false;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: 'HEAD', signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
    });
    // Beget can surface a disconnected origin as HTTP 499.
    // Only the exact signed Gallery final-object URL may use fallback.
    const outage = isCdnOutage({ status: response.status }) ||
      (response.status === 499 && mediaCdnKindFromSignedUrl(url) === 'gallery');
    // Cache only verified 5xx. Native network failures and browser CORS errors
    // are ambiguous; their one-request fallback must not poison all media.
    if (outage) recordSignedCdnOutage(url);
    return outage;
  } catch {
    // On Web, a CORS failure is indistinguishable from HTTP 403/404: fail closed.
    return isCdnOutage({ timedOut, networkFailed: !timedOut && options.nativeNetwork === true });
  } finally { clearTimeout(timer); }
}
/** Confirm an HLS CDN segment failure, not a failure of our API manifest endpoint. */
export async function probeHlsCdnOutage(
  manifestUrl: string,
  options: { fetcher?: typeof fetch; nativeNetwork?: boolean; timeoutMs?: number } = {},
): Promise<boolean> {
  try {
    const response = await (options.fetcher ?? fetch)(manifestUrl, { cache: 'no-store' });
    if (!response.ok) return false;
    const playlist = await response.text();
    if (playlist.length > 65536 || !playlist.startsWith('#EXTM3U')) return false;
    const segments = playlist.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
    if (segments.length === 0 || segments.length > 128) return false;
    const first = new URL(segments[0]!);
    if (first.protocol !== 'https:' || !/\/hls\/segment-[0-9]+\.ts$/.test(first.pathname) ||
        mediaCdnKindFromSignedUrl(first.toString()) !== 'feed') return false;
    return probeCdnOutage(first.toString(), options);
  } catch { return false; }
}
export function cloudruFallbackManifestUrl(manifestUrl: string): string {
  if (!/^\/api\/v1\/feed-playback\/[A-Za-z0-9_-]{1,128}\?ticket=[A-Za-z0-9_.-]+$/.test(manifestUrl))
    throw new Error('INVALID_PLAYBACK_TICKET_URL');
  return `${manifestUrl}&source=cloudru`;
}

/** Validate a signed media HEAD target before our Web server contacts an origin.
 * An authenticated user cannot turn the probe into an arbitrary URL fetch or
 * bypass a 403/404: the caller still needs its normal media fallback grant.
 */
export function isTrustedCdnProbeUrl(
  raw: string,
  allowedHosts: readonly string[],
  nowMs = Date.now(),
): boolean {
  if (!raw || raw.length > 2048 || raw.includes('\\')) return false;
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
      !allowedHosts.includes(url.hostname) || url.pathname.includes('%') ||
      url.pathname.includes('//') || url.pathname.includes('/../') || url.pathname.includes('/./')) return false;
  if (url.search) return false;
  if (url.hostname === publicFeedCdnHost()) {
    // The origin is an approved Beget service, and only final media are probed.
    // No redirects, nonstandard ports or query params can reach the proxy.
    return mediaCdnKindFromSignedUrl(raw) === 'feed';
  }
  if (!['mepsuduyokabib.begetcdn.cloud', 'dikinuneceswe.begetcdn.cloud', 'garaquachegasourn.begetcdn.cloud'].includes(url.hostname))
    return false;
  const match = /^\/md5\(([A-Za-z0-9_-]{22}),(\d{10})\)(\/(?:albums|posts|users)\/[A-Za-z0-9_/-]+\.(?:webp|ts))$/.exec(url.pathname);
  if (!match) return false;
  const signature = match[1]!;
  const expiresRaw = match[2]!;
  const path = match[3]!;
  if (mediaCdnKindFromSignedUrl(raw) === null) return false;
  const expires = Number(expiresRaw);
  return /^\/(?:albums|posts|users)\/[A-Za-z0-9_/-]+\.(?:webp|ts)$/.test(path) &&
    /^[A-Za-z0-9_-]{22}$/.test(signature) && /^\d{10}$/.test(expiresRaw) &&
    Number.isSafeInteger(expires) && expires > Math.floor(nowMs / 1000) - 120 &&
    expires <= Math.floor(nowMs / 1000) + 600;
}

export * from "./remote-status";
