/** Shared Web/Mobile failure classification. 410 = retired CDN edge; an authenticated media-specific fallback is still required. 403/404 never authorize fallback. */
export function isCdnOutage(input: { status?: number; timedOut?: boolean; networkFailed?: boolean }) {
  if (input.status !== undefined) return Number.isInteger(input.status) && (input.status === 410 || (input.status >= 500 && input.status <= 599));
  return input.timedOut === true || input.networkFailed === true;
}
/** Per-client, per-CDN circuit breaker. Does not store S3 URLs or authorization grants.
 * Only a confirmed 5xx on our signed CDN URL can open it. After 60 seconds,
 * the next media request retries the CDN; 403/404 never open the circuit.
 */
export type MediaCdnKind = 'gallery' | 'feed';
export const MEDIA_CDN_OUTAGE_COOLDOWN_MS = 60_000;
const cdnFailedUntil: Record<MediaCdnKind, number> = { gallery: 0, feed: 0 };

/** Classify signed, exact-host CDN URLs for isolated per-service failover. */
export function mediaCdnKindFromSignedUrl(raw: string): MediaCdnKind | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
        url.pathname.includes('%') || url.pathname.includes('..') || url.pathname.includes('//')) return null;
    const gallery = ['fupiquafifeswu.begetcdn.cloud'].includes(url.hostname);
    const feed = url.hostname === 'quepraquiecebquomiel.begetcdn.cloud';
    if (!gallery && !feed) return null;
    if (feed) {
      // Signed Cloud CDN URLs use exact query-based Beget Secure Token,
      // unlike the older Gallery CDNvideo path-style signer.
      const match = /^\?md5=([A-Za-z0-9_-]{22})&expires=(\d{10})$/.exec(url.search);
      if (!match) return null;
      return /^\/media\/v2\/[A-Za-z0-9_-]+\/v[1-9][0-9]*\/(?:image\/[sml]\.webp|poster\.webp|video\/(?:360|720|1080)\.mp4)$/.test(url.pathname) ? 'feed' : null;
    }
    if (url.search) return null;
    const path = url.pathname.replace(/^\/md5\([A-Za-z0-9_-]{22},\d{10}\)/, '');
    if (path === url.pathname) return null;
    if (gallery && /^\/albums\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+\/(?:thumb|full)\.webp$/.test(path)) return 'gallery';
    if (gallery && /^\/gallery\/[A-Za-z0-9_-]+\/media\/[A-Za-z0-9_-]+\/v2\/(?:thumb|full)\.webp$/.test(path)) return 'gallery';
    if (gallery && /^\/users\/[A-Za-z0-9_-]+\/pets\/[A-Za-z0-9_-]+\/vet-visits\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/thumb\.webp$/.test(path)) return 'gallery';
    if (feed && /^\/media\/v2\/[A-Za-z0-9_-]+\/v[1-9][0-9]*\/(?:image\/[sml]\.webp|poster\.webp|video\/(360|720|1080)\.mp4)$/.test(path)) return 'feed';
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
    const outage = isCdnOutage({ status: response.status });
    // Cache only verified 5xx (410 may refer to one retired object, not the whole CDN). Native network failures and browser CORS errors
    // are ambiguous; their one-request fallback must not poison all media.
    if (outage && response.status >= 500) recordSignedCdnOutage(url);
    return outage;
  } catch {
    // Web uses an authenticated Hono status proxy. If *that* fetch fails or
    // times out, we cannot establish the CDN's real HTTP status: fail closed.
    // Native requests have no browser CORS ambiguity and can recover per item.
    return options.nativeNetwork === true && isCdnOutage({ timedOut, networkFailed: !timedOut });
  } finally { clearTimeout(timer); }
}
/** Validate known signed Gallery/Feed URLs or exact public Chat2/Questions
 * final-object paths before the authenticated Hono server probes a CDN HEAD.
 * This status-only route grants no S3 access and never fetches arbitrary URLs.
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
  // Questions/Chat2 publish only immutable public renditions. Their CDN URLs
  // are not signed; allow only these exact, known host+final-object shapes,
  // never arbitrary paths, incoming uploads or third-party domains.
  if (url.hostname === 'ebiteskukingusk.begetcdn.cloud')
    return url.search === '' &&
      /^\/questions\/uploads\/questions\/v2\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\/v1\/image\/[sm]\.webp$/i.test(url.pathname);
  if (url.hostname === 'gonomudedoje.begetcdn.cloud')
    return url.search === '' &&
      /^\/chat2\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\/v1\/(?:image\/[sm]\.webp|poster\.webp|video\/(?:360|720|1080)\.mp4)$/i.test(url.pathname);
  if (!['fupiquafifeswu.begetcdn.cloud', 'quepraquiecebquomiel.begetcdn.cloud'].includes(url.hostname))
    return false;
  const feed = url.hostname === 'quepraquiecebquomiel.begetcdn.cloud';
  const match = feed
    ? /^\?md5=([A-Za-z0-9_-]{22})&expires=(\d{10})$/.exec(url.search)
    : /^\/md5\(([A-Za-z0-9_-]{22}),(\d{10})\)(\/(?:albums|users|gallery)\/[A-Za-z0-9_/-]+\.webp)$/.exec(url.pathname);
  if (!match || (!feed && url.search) || mediaCdnKindFromSignedUrl(raw) === null) return false;
  const expiresRaw = match[2]!;
  const expires = Number(expiresRaw);
  return Number.isSafeInteger(expires) && expires > Math.floor(nowMs / 1000) - 120 &&
    expires <= Math.floor(nowMs / 1000) + 600;
}

export * from "./remote-status";
