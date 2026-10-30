import { createGalleryClient } from "@gafus/types";
import { galleryTransport } from "@/shared/lib/api/gallery";
import { sameGalleryActor, type GalleryActor } from "./privateRead";
/** Existing Gallery API methods, with the native verified owner/epoch guard on every GET/POST. */
export function galleryUploadForActor(actor: GalleryActor, live: () => boolean) {
  const guard = () => live() && sameGalleryActor(actor);
  return createGalleryClient(
    async <T>(
      path: string,
      options?: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown },
    ): Promise<T> => {
      if (!guard())
        throw Object.assign(new Error("GALLERY_UPLOAD_STALE_SESSION"), {
          code: "GALLERY_SESSION_CHANGED",
        });
      const result = await galleryTransport<T>(path, { ...options, requestGuard: guard });
      if (!guard())
        throw Object.assign(new Error("GALLERY_UPLOAD_STALE_SESSION"), {
          code: "GALLERY_SESSION_CHANGED",
        });
      return result;
    },
  );
}
