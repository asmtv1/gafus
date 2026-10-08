/** Isolated cloud scenario. No Prisma, application runtime, logger, sharp or core barrel. */
import { GalleryError } from "./errors";

export const GALLERY_IMAGE_MAX_OUTPUT_BYTES = 1_750_000;
export interface GalleryImageInfo {
  format: "jpeg" | "png" | "webp" | string;
  width: number;
  height: number;
  orientation?: number;
  pages?: number;
}
export interface GalleryImageEngine {
  /** Must inspect/decode actual bytes, enforce decoder pixel limit, and reject corrupt files. */
  inspect(bytes: Uint8Array, options: { limitInputPixels: number }): Promise<GalleryImageInfo>;
  /** Decode fully; autoOrient BEFORE resize; fit inside maxEdge, never enlarge; encode WebP
   * with EXIF/ICC/XMP stripped. Metadata retention and animation are forbidden. */
  autoOrientResizeEncodeWebp(
    bytes: Uint8Array,
    options: {
      autoOrient: true;
      maxEdge: number;
      withoutEnlargement: true;
      quality: 82;
      stripMetadata: true;
      limitInputPixels: number;
    },
  ): Promise<{ bytes: Uint8Array; width: number; height: number }>;
}
export interface GalleryProcessedImages {
  thumb: { bytes: Uint8Array; width: number; height: number };
  full: { bytes: Uint8Array; width: number; height: number };
}
export function createGalleryImageProcessor(engine: GalleryImageEngine) {
  return async function processGalleryImage(bytes: Uint8Array): Promise<GalleryProcessedImages> {
    const pixels = 50_000_000;
    if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024)
      throw new GalleryError("IMAGE_SIZE", "Файл должен быть не больше 10 МиБ");
    let info: GalleryImageInfo;
    try {
      info = await engine.inspect(bytes, { limitInputPixels: pixels });
    } catch {
      throw new GalleryError("INVALID_IMAGE", "Изображение повреждено");
    }
    if (!["jpeg", "png", "webp"].includes(info.format))
      throw new GalleryError("IMAGE_FORMAT", "Допустимы JPG, PNG и WebP");
    if (
      !Number.isSafeInteger(info.width) ||
      !Number.isSafeInteger(info.height) ||
      info.width <= 0 ||
      info.height <= 0 ||
      info.width * info.height > pixels
    )
      throw new GalleryError("IMAGE_PIXELS", "Изображение должно быть не больше 50 мегапикселей");
    if ((info.pages ?? 1) !== 1)
      throw new GalleryError("IMAGE_ANIMATED", "Загрузите неподвижное изображение");
    const rotated = [5, 6, 7, 8].includes(info.orientation ?? 1);
    const w = rotated ? info.height : info.width,
      h = rotated ? info.width : info.height;
    async function variant(maxEdge: number) {
      // Fixed quality; reduce dimensions only. The 256px floor bounds re-encoding work.
      for (;;) {
        let result: GalleryProcessedImages["full"];
        try {
          result = await engine.autoOrientResizeEncodeWebp(bytes, {
            autoOrient: true,
            maxEdge,
            withoutEnlargement: true,
            quality: 82,
            stripMetadata: true,
            limitInputPixels: pixels,
          });
        } catch {
          throw new GalleryError("INVALID_IMAGE", "Не удалось обработать изображение");
        }
        const scale = Math.min(1, maxEdge / Math.max(w, h));
        if (
          !result.bytes.byteLength ||
          !Number.isSafeInteger(result.width) ||
          !Number.isSafeInteger(result.height) ||
          result.width <= 0 ||
          result.height <= 0 ||
          Math.abs(result.width - Math.max(1, Math.round(w * scale))) > 1 ||
          Math.abs(result.height - Math.max(1, Math.round(h * scale))) > 1 ||
          result.width > Math.min(w, maxEdge) ||
          result.height > Math.min(h, maxEdge)
        )
          throw new GalleryError("INVALID_IMAGE", "Не удалось обработать изображение");
        if (result.bytes.byteLength <= GALLERY_IMAGE_MAX_OUTPUT_BYTES) return result;
        if (maxEdge === 256)
          throw new GalleryError(
            "OUTPUT_TOO_LARGE",
            "Изображение слишком большое после обработки. Попробуйте другое фото",
          );
        maxEdge = Math.max(256, Math.round(maxEdge * 0.75));
      }
    }
    // Sequential encodes bound peak memory for inputs near 50 MP.
    return { thumb: await variant(480), full: await variant(1920) };
  };
}
export { GalleryError } from "./errors";
