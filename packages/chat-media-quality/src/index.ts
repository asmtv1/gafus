/** Isomorphic, dependency-free Chat 2.0 media rendition selection for Web + Mobile. */
export type Chat2ImageQuality = 360 | 720;
export type Chat2VideoQuality = 360 | 720;
export type Chat2QualityMode = 'auto' | 360 | 720;
export type Chat2QualityVariants = Partial<Record<360 | 720, string>>;
export interface Chat2MediaRenditions {
  image?: Chat2QualityVariants;
  imageWidths?: Partial<Record<360 | 720, number>>;
  video?: Chat2QualityVariants;
  poster?: string;
}
export interface Chat2VideoHints {
  /** Width of displayed player in CSS/layout pixels. */
  width: number;
  /** The device/browser's user-requested save-data mode. */
  saveData?: boolean;
  /** Estimated downstream throughput, when genuinely available. */
  downlinkMbps?: number;
  /** Browser or native connection hint; undefined means unknown. */
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g' | 'wifi' | 'unknown';
}
/** Only explicitly delivered HTTPS renditions are candidates; never synthesize a URL. */
function available(variants: Chat2QualityVariants | undefined): Chat2QualityVariants {
  if (!variants) return {};
  const result: Chat2QualityVariants = {};
  for (const quality of [360, 720] as const) {
    const url = variants[quality];
    if (typeof url === 'string' && url.startsWith('https://') && url.length < 2048) result[quality] = url;
  }
  return result;
}
export function chat2ImageQuality(width: number, dpr: number): Chat2ImageQuality {
  const physical = (Number.isFinite(width) && width > 0 ? width : 360)
    * (Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 4) : 1);
  return physical <= 360 ? 360 : 720;
}
export function chat2ImageSource(variants: Chat2QualityVariants | undefined, width: number, dpr: number,
  actualWidths?: Partial<Record<360 | 720,number>>): string | null {
  const urls=available(variants);
  const target=Math.max(1,width)*(Number.isFinite(dpr)&&dpr>0?Math.min(4,dpr):1);
  const entries=([360,720] as const).filter(q=>Boolean(urls[q]))
    .map(q=>({url:urls[q]!,width:actualWidths?.[q]??q})).filter(e=>Number.isSafeInteger(e.width)&&e.width>0)
    .sort((a,b)=>a.width-b.width);
  return (entries.find(e=>e.width>=target)??entries[entries.length-1])?.url??null;
}
export function chat2VideoQuality(mode: Chat2QualityMode, hints: Chat2VideoHints): Chat2VideoQuality {
  if (mode === 360 || mode === 720) return mode;
  if (hints.saveData || hints.effectiveType === 'slow-2g' || hints.effectiveType === '2g'
    || hints.effectiveType === '3g') return 360;
  if (!Number.isFinite(hints.width) || hints.width < 300) return 360;
  // Unknown network starts at 360p for fast first frame. MP4 is not HLS:
  // do not switch a stream after playback starts without a manual user action.
  if (!Number.isFinite(hints.downlinkMbps) || (hints.downlinkMbps ?? 0) < 2) return 360;
  return 720;
}
export function chat2VideoSource(variants: Chat2QualityVariants | undefined, mode: Chat2QualityMode, hints: Chat2VideoHints): string | null {
  const urls = available(variants);
  const selected = chat2VideoQuality(mode, hints);
  return urls[selected] ?? urls[selected === 360 ? 720 : 360] ?? null;
}
export function chat2HasVideoQuality(variants: Chat2QualityVariants | undefined, quality: Chat2VideoQuality): boolean {
  return Boolean(available(variants)[quality]);
}

/** Chat2 finals are public, but only the authorized API may hand out their
 * exact CDN/S3 URL pairs. Never synthesize keys from arbitrary client URLs.
 */
export interface Chat2MediaDeliveryUrls {
  url: string;
  fallbackUrl?: string;
  renditions?: Chat2MediaRenditions;
  fallbackRenditions?: Chat2MediaRenditions;
}
export function chat2MatchedS3Variant(source: string, media: Chat2MediaDeliveryUrls): string | null {
  const pairs: [string | undefined, string | undefined][] = [
    [media.url, media.fallbackUrl],
    [media.renditions?.poster, media.fallbackRenditions?.poster],
    ...([360, 720] as const).flatMap(q => [
      [media.renditions?.image?.[q], media.fallbackRenditions?.image?.[q]] as [string | undefined, string | undefined],
      [media.renditions?.video?.[q], media.fallbackRenditions?.video?.[q]] as [string | undefined, string | undefined],
    ]),
  ];
  return pairs.find(([primary]) => primary === source)?.[1] ?? null;
}

/** Image/video element onError hides HTTP status. Probe CDN with HEAD before
 * trying S3, so 403/404 (including permission/revocation errors) never fall
 * back to origin. Web uses an authenticated same-origin Hono HEAD probe,
 * native may recover from transport errors (no browser CORS ambiguity).
 */
export async function chat2CdnS3FailoverAllowed(
  primaryUrl: string,
  fallbackUrl: string | null | undefined,
  fetchHead: (url: string, init: {method: 'HEAD'; credentials: 'omit'; redirect: 'error'; cache: 'no-store'; signal: AbortSignal}) => Promise<{status: number}>,
  nativeNetwork = false,
): Promise<boolean> {
  if (!fallbackUrl) return false;
  let primary: URL, fallback: URL;
  try { primary = new URL(primaryUrl); fallback = new URL(fallbackUrl); }
  catch { return false; }
  if (primary.protocol !== 'https:' || primary.port || fallback.port ||
      primary.hostname !== 'gonomudedoje.begetcdn.cloud' ||
      fallback.origin !== 'https://gafus-chat2-media-2026.s3.cloud.ru' ||
      !/^\/chat2\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\/v1\/(?:image\/[sm]\.webp|poster\.webp|video\/(?:360|720|1080)\.mp4)$/i.test(primary.pathname) ||
      primary.pathname !== fallback.pathname ||
      primary.search || fallback.search || primary.hash || fallback.hash ||
      primary.username || fallback.username || primary.password || fallback.password)
    return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const result = await fetchHead(primary.href, {
      method: 'HEAD', credentials: 'omit', redirect: 'error', cache: 'no-store',
      signal: controller.signal,
    });
    return result.status === 410 || result.status >= 500 && result.status <= 599;
  } catch {
    // Native fetch has no browser CORS ambiguity. Web must use the
    // authenticated same-origin Hono HEAD proxy, not a direct CDN fetch.
    return nativeNetwork;
  } finally {
    clearTimeout(timeout);
  }
}
