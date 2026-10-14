import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { isSignedCdnFailoverActive, mediaCdnKindFromSignedUrl, probeCdnOutage } from '@gafus/core/services/mediaDelivery';
import { prefersCloudruMedia } from "@/shared/lib/media/serverHealth";
import { useAuthStore } from "@/shared/stores/authStore";
import { scopedMediaCacheKey } from "./scopedMediaCache";
/** Shared mobile transport; source authorization belongs exclusively to core on API. */
export function CdnImage({ cdnUrl, requestFallback, onError, ...props }:
  Omit<ImageProps, 'source' | 'cachePolicy'> & {
    cdnUrl: string;
    requestFallback: () => Promise<{ url: string }>;
  }) {
  const viewer = useAuthStore(state => state.isAuthenticated ? state.user?.id ?? "" : "");
  const [resolved, setResolved] = useState<{ url: string; viewer: string } | null>(null);
  // Prevent even a single React render of the previous account's image while
  // the new viewer's health check/fallback request is pending.
  const url = resolved?.viewer === viewer ? resolved.url : undefined;
  const setUrl = useCallback((next: string | undefined) => {
    setResolved(next ? { url: next, viewer } : null);
  }, [viewer]);
  const [cacheSlot, setCacheSlot] = useState(() => Math.floor(Date.now() / 180_000));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const current = Date.now();
      setCacheSlot(Math.floor(current / 180_000));
      timer = setTimeout(update, 180_000 - (current % 180_000) + 10);
    };
    update();
    return () => clearTimeout(timer);
  }, []);
  const tried = useRef(false);
  const generation = useRef(0);
  const fallbackRef = useRef(requestFallback);
  fallbackRef.current = requestFallback;
  useEffect(() => {
    const current = ++generation.current;
    tried.current = false;
    // Defer the very first CDN request until the short-lived server health
    // snapshot is known; one status fetch is shared across all images.
    setUrl(undefined);
    void (async () => {
      const kind = mediaCdnKindFromSignedUrl(cdnUrl);
      const bypass = isSignedCdnFailoverActive(cdnUrl) ||
        (kind !== null && await prefersCloudruMedia(kind));
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
        if (!fallback.url.startsWith("https://s3.cloud.ru/")) throw new Error("INVALID_STORAGE_URL");
        setUrl(fallback.url);
      } catch {
        if (generation.current === current) { tried.current = false; setUrl(cdnUrl); }
      }
    })();
    return () => { generation.current++; };
  }, [cdnUrl, viewer, setUrl]);
  let cacheKey: string | undefined;
  if (url && viewer) {
    try { cacheKey = scopedMediaCacheKey(url, viewer, cacheSlot * 180_000); }
    catch { /* Unrecognized URL is never written to the persistent private cache. */ }
  }
  return <Image {...props} source={url ? { uri: url, ...(cacheKey ? { cacheKey } : {}) } : undefined}
    cachePolicy={cacheKey ? "memory-disk" : "memory"} onError={event => {
    if (tried.current || url !== cdnUrl || !cdnUrl) { onError?.(event); return; }
    tried.current = true;
    const expected = generation.current;
    void (async () => {
      if (!isSignedCdnFailoverActive(cdnUrl) && !await probeCdnOutage(cdnUrl, { nativeNetwork: true, timeoutMs: 8500 })) return false;
      const fallback = await requestFallback();
      if (expected !== generation.current || !fallback.url.startsWith('https://s3.cloud.ru/')) return false;
      setUrl(fallback.url);
      return true;
    })().then(recovered => {
      if (!recovered && expected === generation.current) onError?.(event);
    }).catch(() => { if (expected === generation.current) onError?.(event); });
  }} />;
}
