import { useRef, useState } from "react";
import { mediaCdnKindFromSignedUrl, probeCdnOutage } from "@gafus/core-client/media-delivery";
import original from "../../brand/LegacyGallery.module.css";
import { requestGalleryMediaFallback, signedGalleryImage } from "./galleryApi";
/** Verify a CDN 410/5xx for this exact signed media object before requesting
 * a short-lived, authorization-scoped S3 alternative from Hono. Do not use
 * another object's outage circuit to override this object's 403/404. */
async function recoverGalleryImage(
  source: string,
  photoId: string,
  variant: "thumb" | "full",
): Promise<string | null> {
  if (mediaCdnKindFromSignedUrl(source) !== "gallery") return null;
  const outage = await probeCdnOutage(source, {
    // Hono's upstream HEAD may take 6.5 seconds to prove a DNS outage.
    // Never treat a shorter browser-side proxy timeout as CDN authorization.
    timeoutMs: 8500,
    fetcher: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return fetch(`/api/v1/media-cdn-probe?url=${encodeURIComponent(url)}`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        signal: init?.signal,
      });
    },
  });
  if (!outage) return null;
  try {
    return await requestGalleryMediaFallback(photoId, variant);
  } catch {
    return null;
  }
}

export function GalleryImage({
  url,
  expires,
  alt,
  className,
  emptyLabel = "Нет миниатюры",
  onLoadError,
  photoId,
  variant = "thumb",
}: {
  url: string | null;
  expires: string | null;
  alt: string;
  className?: string;
  emptyLabel?: string;
  onLoadError?: () => void;
  photoId?: string;
  variant?: "thumb" | "full";
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<{ source: string; url: string } | null>(null);
  // Deduplicate only a request for THIS source. An older image's pending
  // probe must not suppress recovery for a newly selected album/photo.
  const trying = useRef<string | null>(null);
  const current = signedGalleryImage(url, expires);
  const currentSource = useRef(current);
  currentSource.current = current;
  const displayedUrl = current && recovered?.source === current ? recovered.url : current;
  if (!current || broken === current)
    return (
      <span
        className={`${original.placeholder} ${className ?? ""} gallery-image-placeholder`}
        aria-label="Изображение недоступно"
      >
        <svg
          className={original.placeholderIcon}
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="32"
          height="32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="m4 17 5-5 4 4 3-3 4 4M8.5 9h.01" />
        </svg>
        <span>{emptyLabel}</span>
      </span>
    );
  return (
    <img
      src={displayedUrl ?? undefined}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (trying.current === current) return;
        if (!photoId || displayedUrl !== current) {
          setBroken(current);
          onLoadError?.();
          return;
        }
        trying.current = current;
        void recoverGalleryImage(current, photoId, variant)
          .then((next) => {
            if (currentSource.current !== current) return;
            if (next) setRecovered({ source: current, url: next });
            else {
              setBroken(current);
              onLoadError?.();
            }
          })
          .catch(() => {
            if (currentSource.current === current) {
              setBroken(current);
              onLoadError?.();
            }
          })
          .finally(() => {
            if (trying.current === current) trying.current = null;
          });
      }}
    />
  );
}
