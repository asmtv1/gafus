/* eslint-disable @gafus/require-client-catch-tracer -- expected signed-CDN fallback errors must never leak URL query tokens. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, type ImageProps } from "expo-image";
import {
  mediaCdnKindFromSignedUrl,
  probeCdnOutage,
} from "@gafus/core-client/media-delivery";
import { prefersCloudruMedia } from "@/shared/lib/media/serverHealth";
import { useAuthStore } from "@/shared/stores/authStore";
import { scopedMediaCacheKey, isLongLivedPublicFeedCdnUrl } from "./scopedMediaCache";
/** Check server-authorized fallback shape before passing it to the native
 * image loader. The Hono fallback route owns the actual actor/object ACL. */
export function isSignedCloudruFallback(raw: string): boolean {
  try {
    const value = new URL(raw);
    return value.protocol === "https:" && value.hostname === "s3.cloud.ru" &&
      !value.port && !value.username && !value.password && !value.hash &&
      /^\/gafus-(?:gallery|feed)-private\/[A-Za-z0-9_\/.-]+$/.test(value.pathname) &&
      !value.pathname.includes("..") && !value.pathname.includes("//") &&
      Boolean(value.searchParams.get("X-Amz-Signature"));
  } catch { return false; }
}
/** Shared mobile transport; source authorization belongs exclusively to core on API. */
export function CdnImage({
  cdnUrl,
  requestFallback,
  onError,
  privateMemoryOnly = false,
  ...props
}: Omit<ImageProps, "source" | "cachePolicy"> & {
  cdnUrl: string;
  requestFallback: () => Promise<{ url: string }>;
  /** Never persist a private gallery signed URL/image to Expo's disk cache. */
  privateMemoryOnly?: boolean;
}) {
  const viewer = useAuthStore((state) => (state.isAuthenticated ? (state.user?.id ?? "") : ""));
  const [resolved, setResolved] = useState<{ url: string; viewer: string } | null>(null);
  // Prevent even a single React render of the previous account's image while
  // the new viewer's health check/fallback request is pending.
  const url = resolved?.viewer === viewer ? resolved.url : undefined;
  const setUrl = useCallback(
    (next: string | undefined) => {
      setResolved(next ? { url: next, viewer } : null);
    },
    [viewer],
  );
  const [cacheSlot, setCacheSlot] = useState(() => Math.floor(Date.now() / 180_000));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const current = Date.now();
      // Only server-issued 24–48h public Feed CDN tokens get a 24h disk key.
      // Gallery and signed S3 fallback continue the short account-scoped slot.
      const interval = isLongLivedPublicFeedCdnUrl(cdnUrl, current) ? 86_400_000 : 180_000;
      setCacheSlot(Math.floor(current / interval));
      timer = setTimeout(update, interval - (current % interval) + 10);
    };
    update();
    return () => clearTimeout(timer);
  }, [cdnUrl]);
  const tried = useRef(false);
  const generation = useRef(0);
  const fallbackRef = useRef(requestFallback);
  fallbackRef.current = requestFallback;
  useEffect(() => {
    const current = ++generation.current;
    tried.current = false;
    // Defer the very first CDN request until the short-lived server health
    // snapshot is known; only server-confirmed health can preselect Cloud.ru.
    // A different media object's local 504 must not bypass this one's 403/404.
    setUrl(undefined);
    void (async () => {
      const kind = mediaCdnKindFromSignedUrl(cdnUrl);
      const bypass =
        kind !== null && (await prefersCloudruMedia(kind));
      if (generation.current !== current) return;
      if (!bypass) {
        setUrl(cdnUrl);
        return;
      }
      tried.current = true;
      setUrl(undefined);
      try {
        const fallback = await fallbackRef.current();
        if (generation.current !== current) return;
        if (!isSignedCloudruFallback(fallback.url))
          throw new Error("INVALID_STORAGE_URL");
        setUrl(fallback.url);
      } catch {
        if (generation.current === current) {
          tried.current = false;
          setUrl(cdnUrl);
        }
      }
    })();
    const generationRef = generation;
    return () => {
      generationRef.current++;
    };
  }, [cdnUrl, viewer, setUrl]);
  let cacheKey: string | undefined;
  // A Cloud.ru fallback is an expiring S3 capability URL. Keep it in memory
  // even when the CDN version is safe to retain on disk for 24 hours.
  if (url && viewer && !url.startsWith("https://s3.cloud.ru/")) {
    try {
      // cacheSlot triggers the next disk-window render; use the actual time
      // for signed-token expiry checks rather than the beginning of the slot.
      void cacheSlot;
      cacheKey = scopedMediaCacheKey(url, viewer, Date.now());
    } catch {
      /* Unrecognized URL is never written to the persistent private cache. */
    }
  }
  return (
    <Image
      {...props}
      source={url ? { uri: url, ...(cacheKey ? { cacheKey } : {}) } : undefined}
      cachePolicy={!privateMemoryOnly && cacheKey ? "memory-disk" : "memory"}
      onError={(event) => {
        if (tried.current || url !== cdnUrl || !cdnUrl ||
            mediaCdnKindFromSignedUrl(cdnUrl) === null) {
          onError?.(event);
          return;
        }
        tried.current = true;
        const expected = generation.current;
        void (async () => {
          if (
            !(await probeCdnOutage(cdnUrl, { nativeNetwork: true, timeoutMs: 8500 }))
          )
            return false;
          const fallback = await requestFallback();
          if (expected !== generation.current || !isSignedCloudruFallback(fallback.url))
            return false;
          setUrl(fallback.url);
          return true;
        })()
          .then((recovered) => {
            if (!recovered && expected === generation.current) onError?.(event);
          })
          .catch(() => {
            if (expected === generation.current) onError?.(event);
          });
      }}
    />
  );
}
