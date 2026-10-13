"use client";
import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { isSignedCdnFailoverActive, mediaCdnKindFromSignedUrl, probeCdnOutage } from '@gafus/core/services/mediaDelivery';
import { prefersCloudruMedia } from "@/shared/lib/media/serverHealth";
import { sameOriginCdnProbeFetch } from '@/shared/lib/media/cdnProbe';
/** Thin image adapter. HEAD must establish a CDN outage before requesting private S3. */
export function CdnImage({ source, requestFallback, onError, ...props }:
  Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
    source: string;
    requestFallback: () => Promise<{ url: string }>;
  }) {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const generation = useRef(0);
  const tried = useRef(false);
  const fallbackRef = useRef(requestFallback);
  fallbackRef.current = requestFallback;
  useEffect(() => {
    const current = ++generation.current;
    tried.current = false;
    // Defer the very first CDN request until the short-lived server health
    // snapshot is known; one status fetch is shared across all images.
    setUrl(undefined);
    void (async () => {
      const kind = mediaCdnKindFromSignedUrl(source);
      const bypass = isSignedCdnFailoverActive(source) ||
        (kind !== null && await prefersCloudruMedia(kind));
      if (generation.current !== current) return;
      if (!bypass) {
        setUrl(source);
        return;
      }
      // Do not start an image CDN request during the 60-second outage window.
      // Always request a fresh, ACL-authorized S3 URL; never cache signed URLs.
      tried.current = true;
      setUrl(undefined);
      try {
        const fallback = await fallbackRef.current();
        if (generation.current !== current) return;
        if (!fallback.url.startsWith("https://s3.cloud.ru/")) throw new Error("INVALID_STORAGE_URL");
        setUrl(fallback.url);
      } catch {
        if (generation.current === current) { tried.current = false; setUrl(source); }
      }
    })();
    return () => { generation.current++; };
  }, [source]);
  const fail: NonNullable<ImgHTMLAttributes<HTMLImageElement>['onError']> = event => {
    if (tried.current || !source || url !== source) { onError?.(event); return; }
    tried.current = true;
    const expectedGeneration = generation.current;
    void (async () => {
      if (!isSignedCdnFailoverActive(source) && !await probeCdnOutage(source, { fetcher: sameOriginCdnProbeFetch, timeoutMs: 8500 })) return false;
      const fallback = await requestFallback();
      if (expectedGeneration !== generation.current || !fallback.url.startsWith('https://s3.cloud.ru/')) return false;
      setUrl(fallback.url);
      return true;
    })().then(recovered => {
      if (!recovered && expectedGeneration === generation.current) onError?.(event);
    }).catch(() => {
      if (expectedGeneration === generation.current) onError?.(event);
    });
  };
  return <img {...props} src={url} onError={fail} referrerPolicy="no-referrer" />;
}
