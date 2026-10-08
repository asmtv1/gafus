import { useRef } from "react";
import { Image, type ImageProps } from "expo-image";
/** Gallery signed URLs and decoded pixels never enter Expo's persistent disk cache. */
export function GalleryImage({ refresh, ...props }: Omit<ImageProps, "cachePolicy" | "onError"> & { refresh: () => void }) {
  const lastRefresh = useRef(0);
  return <Image {...props} cachePolicy="memory" onError={() => {
    if (Date.now() - lastRefresh.current > 5000) { lastRefresh.current = Date.now(); refresh(); }
  }} />;
}
