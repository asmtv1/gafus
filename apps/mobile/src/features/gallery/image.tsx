import { useRef } from "react";
import { Image, type ImageProps } from "expo-image";
import { CdnImage } from "@/shared/components/media/CdnImage";
import { galleryApi } from "@/shared/lib/api/gallery";
/** Gallery signed URLs and decoded pixels never enter Expo's persistent disk cache. */
export function GalleryImage({ refresh, photoId, ...props }: Omit<ImageProps, "cachePolicy" | "onError"> & { refresh: () => void; photoId?: string | null }) {
  const lastRefresh = useRef(0);
  const failed = () => {
    if (Date.now() - lastRefresh.current > 5000) { lastRefresh.current = Date.now(); refresh(); }
  };
  const uri = props.source && !Array.isArray(props.source) && typeof props.source === 'object' && 'uri' in props.source
    ? props.source.uri : undefined;
  if (photoId && uri) return <CdnImage {...props} cdnUrl={uri}
    requestFallback={() => galleryApi.requestMediaFallback(photoId, 'thumb')} onError={failed} />;
  return <Image {...props} cachePolicy="memory" onError={failed} />;
}
