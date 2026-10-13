import { useEffect, useRef, useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { isSignedCdnFailoverActive, mediaCdnKindFromSignedUrl, probeCdnOutage } from '@gafus/core/services/mediaDelivery';
import { prefersCloudruMedia } from "@/shared/lib/media/serverHealth";
/** Shared mobile transport; source authorization belongs exclusively to core on API. */
export function CdnImage({ cdnUrl, requestFallback, onError, ...props }:
  Omit<ImageProps, 'source' | 'cachePolicy'> & {
    cdnUrl: string;
    requestFallback: () => Promise<{ url: string }>;
  }) {
  const [url, setUrl] = useState<string | undefined>(undefined);
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
  }, [cdnUrl]);
  return <Image {...props} source={url ? { uri: url } : undefined} cachePolicy="memory" onError={event => {
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
