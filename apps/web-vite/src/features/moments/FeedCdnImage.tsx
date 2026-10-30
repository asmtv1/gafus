import { useEffect, useRef, useState } from "react";
import { mediaCdnKindFromSignedUrl, probeCdnOutage } from
  "@gafus/core-client/media-delivery";
import { apiRequest } from "../../shared/api/client";
import { sameOriginCdnProbeFetch } from "../../shared/api/cdnProbe";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
type Variant = "thumb" | "full" | "poster" | "video360" | "video720" | "video1080";

/** The server rechecks media visibility and signs this particular object.
 * Unknown or stale fallback responses are not accepted as image sources. */
export async function requestFeedImageFallback(mediaId: string, variant: Variant): Promise<string> {
  if (!ID.test(mediaId) || !["thumb", "full", "poster", "video360", "video720", "video1080"].includes(variant))
    throw Error("INVALID_MEDIA");
  const data = await apiRequest<unknown>(`/api/v1/feed/media/${mediaId}/fallback`, {
    method: "POST", browserAuth: true, json: { variant },
  });
  if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("INVALID_FALLBACK");
  const result = data as Record<string, unknown>;
  if (result.source !== "cloudru" || typeof result.url !== "string" ||
      typeof result.expiresAt !== "string" || result.url.length > 4096 ||
      !Number.isFinite(Date.parse(result.expiresAt)) ||
      Date.parse(result.expiresAt) <= Date.now() + 15_000) throw Error("INVALID_FALLBACK");
  const url = new URL(result.url);
  if (url.protocol !== "https:" || url.hostname !== "s3.cloud.ru" || url.port ||
      url.username || url.password || url.hash || !url.pathname.startsWith("/") ||
      !url.searchParams.has("X-Amz-Signature")) throw Error("INVALID_FALLBACK");
  return url.toString();
}

/** Feed thumbnails and video posters use the same CDN 410/5xx recovery as albums.
 * 403/404, unknown URLs and ambiguous browser CORS failures fail closed. */
export function FeedCdnImage({ url, mediaId, variant, alt, className, onUnavailable }: {
  url: string; mediaId: string; variant: Variant; alt: string;
  className?: string; onUnavailable?: () => void;
}) {
  const [recovered, setRecovered] = useState<{ source: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const attempted = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    attempted.current = false;
    setRecovered(null); setFailed(false);
    // Invalidate only the pending URL request; no media link survives unmount.
    const pendingGeneration = generation;
    return () => { pendingGeneration.current++; };
  }, [url, mediaId, variant]);
  const src = recovered?.source === url ? recovered.url : url;
  const onError = () => {
    if (attempted.current || src !== url || mediaCdnKindFromSignedUrl(url) !== "feed") {
      setFailed(true); onUnavailable?.(); return;
    }
    attempted.current = true;
    const current = generation.current;
    void (async () => {
      if (!await probeCdnOutage(url, { fetcher: sameOriginCdnProbeFetch, timeoutMs: 8500 }))
        throw Error("CDN_NOT_DOWN");
      const fallback = await requestFeedImageFallback(mediaId, variant);
      if (generation.current === current) setRecovered({ source: url, url: fallback });
    })().catch(() => {
      if (generation.current === current) { setFailed(true); onUnavailable?.(); }
    });
  };
  return failed ? <div className="moment-media-missing" role="img" aria-label={alt}>
    Изображение недоступно
  </div> : <img src={src} referrerPolicy="no-referrer" loading="lazy"
    className={className} alt={alt} onError={onError}/>;
}
