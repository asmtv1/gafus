import type { GalleryDb, GalleryStoragePort, GalleryTx, GalleryObjectMetadata } from "./ports";
import { GalleryError } from "./errors";
export interface GalleryContext {
  db: GalleryDb;
  storage: GalleryStoragePort;
  now: () => Date;
}
export function requireGalleryEnabled(ctx: GalleryContext) {
  if (!ctx.storage.enabled)
    throw new GalleryError("GALLERY_DISABLED", "Галерея временно недоступна", 503);
}
export function galleryTransaction<T>(ctx: GalleryContext, fn: (tx: GalleryTx) => Promise<T>) {
  return ctx.db.$transaction(fn, { maxWait: 10_000, timeout: 30_000 });
}
export async function outputHeads(
  ctx: GalleryContext,
  keys: string[],
): Promise<GalleryObjectMetadata[]> {
  const heads = await Promise.all(keys.map((key) => ctx.storage.head(key)));
  if (
    heads.some(
      (h) =>
        !h ||
        !h.etag ||
        h.contentType !== "image/webp" ||
        h.bytes <= 0 ||
        h.bytes > 10 * 1024 * 1024,
    )
  )
    throw new GalleryError("OUTPUT_MISSING", "Результаты обработки недоступны", 409);
  return heads as GalleryObjectMetadata[];
}
