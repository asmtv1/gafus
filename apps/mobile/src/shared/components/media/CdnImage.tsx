import { useEffect, useRef, useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { probeCdnOutage } from '@gafus/core/services/mediaDelivery';
/** Shared mobile transport; source authorization belongs exclusively to core on API. */
export function CdnImage({ cdnUrl, requestFallback, onError, ...props }:
  Omit<ImageProps, 'source' | 'cachePolicy'> & {
    cdnUrl: string;
    requestFallback: () => Promise<{ url: string }>;
  }) {
  const [url, setUrl] = useState(cdnUrl);
  const tried = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    tried.current = false;
    setUrl(cdnUrl);
  }, [cdnUrl]);
  return <Image {...props} source={{ uri: url }} cachePolicy="memory" onError={event => {
    if (tried.current || url !== cdnUrl || !cdnUrl) { onError?.(event); return; }
    tried.current = true;
    const expected = generation.current;
    void (async () => {
      if (!await probeCdnOutage(cdnUrl, { nativeNetwork: true, timeoutMs: 8500 })) return false;
      const fallback = await requestFallback();
      if (expected !== generation.current || !fallback.url.startsWith('https://s3.cloud.ru/')) return false;
      setUrl(fallback.url);
      return true;
    })().then(recovered => {
      if (!recovered && expected === generation.current) onError?.(event);
    }).catch(() => { if (expected === generation.current) onError?.(event); });
  }} />;
}
