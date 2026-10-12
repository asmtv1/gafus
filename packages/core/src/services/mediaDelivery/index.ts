/** Shared Web/Mobile outage classification. A 403/404 must never trigger storage fallback. */
export function isCdnOutage(input: { status?: number; timedOut?: boolean; networkFailed?: boolean }) {
  if (input.status !== undefined) return Number.isInteger(input.status) && input.status >= 500 && input.status <= 599;
  return input.timedOut === true || input.networkFailed === true;
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
    return isCdnOutage({ status: response.status });
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
        !first.searchParams.has('md5') || !first.searchParams.has('expires')) return false;
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
      !allowedHosts.includes(url.hostname) ||
      !/^\/(?:albums|posts)\/[a-zA-Z0-9_/-]+\.(?:webp|jpg|jpeg|png|ts)$/.test(url.pathname) ||
      url.pathname.includes('//') || url.pathname.includes('/../') || url.pathname.includes('/./') ||
      [...url.searchParams.keys()].sort().join(',') !== 'expires,md5') return false;
  const signature = url.searchParams.get('md5') ?? '';
  const expiresRaw = url.searchParams.get('expires') ?? '';
  const expires = Number(expiresRaw);
  return /^[A-Za-z0-9_-]{22}$/.test(signature) && /^\d{10}$/.test(expiresRaw) &&
    Number.isSafeInteger(expires) && expires > Math.floor(nowMs / 1000) - 120 &&
    expires <= Math.floor(nowMs / 1000) + 600;
}
