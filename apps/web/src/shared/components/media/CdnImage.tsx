"use client";
import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { probeCdnOutage } from '@gafus/core/services/mediaDelivery';
import { sameOriginCdnProbeFetch } from '@/shared/lib/media/cdnProbe';
/** Thin image adapter. HEAD must establish a CDN outage before requesting private S3. */
export function CdnImage({ source, requestFallback, onError, ...props }:
  Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
    source: string;
    requestFallback: () => Promise<{ url: string }>;
  }) {
  const [url, setUrl] = useState(source);
  const generation = useRef(0);
  const tried = useRef(false);
  useEffect(() => {
    generation.current++;
    tried.current = false;
    setUrl(source);
  }, [source]);
  const fail: NonNullable<ImgHTMLAttributes<HTMLImageElement>['onError']> = event => {
    if (tried.current || !source || url !== source) { onError?.(event); return; }
    tried.current = true;
    const expectedGeneration = generation.current;
    void (async () => {
      if (!await probeCdnOutage(source, { fetcher: sameOriginCdnProbeFetch, timeoutMs: 8500 })) return false;
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
