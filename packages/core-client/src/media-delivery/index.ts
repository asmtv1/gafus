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
    if (url.hostname === 'cdn.gafus.ru') {
      if (!/^\?md5=[A-Za-z0-9_-]{22}&expires=\d{10}$/.test(url.search)) return null;
      const path = url.pathname;
      if (/^\/media\/v2\/[A-Za-z0-9_-]{1,128}\/v[1-9][0-9]*\/(?:image\/[sml]\.webp|poster\.webp|video\/(?:360|720)\.mp4)$/.test(path)) return 'feed';
      if (/^\/albums\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/photos\/[A-Za-z0-9_-]{1,128}\/(?:thumb|full)\.webp$/.test(path) ||
          /^\/gallery\/[A-Za-z0-9_-]{1,128}\/media\/[A-Za-z0-9_-]{1,128}\/v2\/(?:thumb|full)\.webp$/.test(path) ||
          /^\/users\/[A-Za-z0-9_-]{1,128}\/pets\/[A-Za-z0-9_-]{1,128}\/vet-visits\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/thumb\.webp$/.test(path)) return 'gallery';
      return null;
    }
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

/** In-flight status probes only; never cache a storage grant or share across
 * different transports, failure semantics or signed URL identities. */
const pendingProbes = new WeakMap<typeof fetch, Map<string, Promise<boolean>>>();

/** HEAD probes are required because image/native players omit HTTP status. */
export function probeCdnOutage(
  url: string,
  options: { fetcher?: typeof fetch; timeoutMs?: number; nativeNetwork?: boolean } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 3500;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) return Promise.resolve(false);
  let target: URL;
  try { target = new URL(url); } catch { return Promise.resolve(false); }
  if (target.protocol !== 'https:' || target.username || target.password) return Promise.resolve(false);
  const fetcher = options.fetcher ?? fetch;
  const nativeNetwork = options.nativeNetwork === true;
  const key = JSON.stringify([url, timeoutMs, nativeNetwork]);
  let pending = pendingProbes.get(fetcher);
  if (!pending) {
    pending = new Map();
    pendingProbes.set(fetcher, pending);
  }
  const existing = pending.get(key);
  if (existing) return existing;
  const operation = (async () => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      // Some native fetch implementations ignore abort. Race the actual
      // transport against a deadline, and ignore any late HTTP result.
      const response = await Promise.race([
        Promise.resolve().then(() => fetcher(url, {
          method: 'HEAD', signal: controller.signal, cache: 'no-store',
          credentials: 'omit', redirect: 'error',
        })),
        new Promise<null>(resolve => {
          timer = setTimeout(() => {
            timedOut = true;
            resolve(null);
            controller.abort();
          }, timeoutMs);
        }),
      ]);
      if (timedOut || response === null) return nativeNetwork;
      const outage = isCdnOutage({ status: response.status });
      // Only a verified 5xx on an exact signed CDN path may open a circuit.
      if (outage && response.status >= 500) recordSignedCdnOutage(url);
      return outage;
    } catch {
      // Browser proxy failure is ambiguous; native recovery is per object.
      return nativeNetwork;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    }
  })();
  pending.set(key, operation);
  void operation.finally(() => {
    if (pending.get(key) === operation) pending.delete(key);
  });
  return operation;
}

/** The same exact public Questions V2 object must be returned by the API.
 * A CDN 403/404 never authorizes this alternate origin. Web must pass its
 * authenticated status proxy; native may also recover on transport failure.
 */
export function allowQuestionsS3Fallback(
  cdnUrl: string, fallbackUrl?: string, http: typeof fetch = fetch, nativeNetwork = false,
): Promise<boolean> {
  const deny = () => Promise.resolve(false);
  if (!fallbackUrl) return deny();
  let primary: URL, fallback: URL;
  try { primary = new URL(cdnUrl); fallback = new URL(fallbackUrl); }
  catch { return deny(); }
  const variant = /^\/questions\/uploads\/questions\/v2\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\/v1\/image\/[sm]\.webp$/i;
  if (
    primary.protocol !== "https:" || primary.port || primary.username || primary.password ||
    primary.search || primary.hash ||
    !["ebiteskukingusk.begetcdn.cloud", "cdn.gafus.ru"].includes(primary.hostname) ||
    !variant.test(primary.pathname) ||
    fallback.origin !== "https://gafus-questions-public.s3.cloud.ru" ||
    fallback.username || fallback.password || fallback.search || fallback.hash ||
    fallback.pathname !== primary.pathname
  ) return deny();
  return probeCdnOutage(primary.toString(), { fetcher: http, timeoutMs: 4000, nativeNetwork });
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
  if (url.hostname === 'cdn.gafus.ru' && url.search) {
    const kind = mediaCdnKindFromSignedUrl(raw);
    const expires = Number(url.searchParams.get('expires'));
    const now = Math.floor(nowMs / 1000);
    return kind !== null && Number.isSafeInteger(expires) && expires > now - 120 && expires <= now + 600;
  }
  if (url.hostname === 'ebiteskukingusk.begetcdn.cloud' || (url.hostname === 'cdn.gafus.ru' && url.pathname.startsWith('/questions/')))
    return url.search === '' &&
      /^\/questions\/uploads\/questions\/v2\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\/v1\/image\/[sm]\.webp$/i.test(url.pathname);
  if (url.hostname === 'gonomudedoje.begetcdn.cloud' || (url.hostname === 'cdn.gafus.ru' && url.pathname.startsWith('/chat2/')))
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
    expires <= Math.floor(nowMs / 1000) + (feed ? 172800 : 600);
}

export * from "./remote-status";
