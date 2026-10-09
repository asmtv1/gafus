/** Pure, independently testable feed image preflight and conversion policy.
 * Image bytes are decoded by an injected engine in the isolated worker.
 */
export const FEED_IMAGE_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const FEED_IMAGE_OUTPUT_MAX_BYTES = 1_750_000;
export const FEED_IMAGE_MAX_PIXELS = 50_000_000;
export class FeedImageError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "FeedImageError"; }
}
export interface FeedImageInfo {
  format: string;
  width: number;
  height: number;
  pages?: number;
  orientation?: number;
}
export interface FeedImageVariant { bytes: Uint8Array; width: number; height: number }
export interface FeedImageEngine {
  inspect(source: Uint8Array, pixelLimit: number): Promise<FeedImageInfo>;
  encode(source: Uint8Array, options: {
    autoOrient: true; maxEdge: number; withoutEnlargement: true;
    quality: 82; stripMetadata: true; pixelLimit: number;
  }): Promise<FeedImageVariant>;
}
export function validateFeedImageInfo(info: FeedImageInfo, sourceBytes: number) {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes <= 0 ||
      sourceBytes > FEED_IMAGE_SOURCE_MAX_BYTES) throw new FeedImageError("IMAGE_SIZE");
  if (!["jpeg", "png", "webp"].includes(info.format)) throw new FeedImageError("IMAGE_FORMAT");
  if (!Number.isSafeInteger(info.width) || !Number.isSafeInteger(info.height) ||
      info.width <= 0 || info.height <= 0 ||
      info.width * info.height > FEED_IMAGE_MAX_PIXELS) throw new FeedImageError("IMAGE_PIXELS");
  if ((info.pages ?? 1) !== 1) throw new FeedImageError("IMAGE_ANIMATED");
  const rotated = [5, 6, 7, 8].includes(info.orientation ?? 1);
  return {
    orientedWidth: rotated ? info.height : info.width,
    orientedHeight: rotated ? info.width : info.height,
  };
}
export async function processFeedImage(source: Uint8Array, engine: FeedImageEngine) {
  if (source.byteLength <= 0 || source.byteLength > FEED_IMAGE_SOURCE_MAX_BYTES)
    throw new FeedImageError("IMAGE_SIZE");
  let info: FeedImageInfo;
  try { info = await engine.inspect(source, FEED_IMAGE_MAX_PIXELS); }
  catch { throw new FeedImageError("INVALID_IMAGE"); }
  const { orientedWidth, orientedHeight } = validateFeedImageInfo(info, source.byteLength);
  async function variant(initialEdge: 480 | 1920) {
    let edge: number = initialEdge;
    for (;;) {
      let item: FeedImageVariant;
      try {
        item = await engine.encode(source, {
          autoOrient: true, maxEdge: edge, withoutEnlargement: true,
          quality: 82, stripMetadata: true, pixelLimit: FEED_IMAGE_MAX_PIXELS,
        });
      } catch { throw new FeedImageError("INVALID_IMAGE"); }
      const ratio = Math.min(1, edge / Math.max(orientedWidth, orientedHeight));
      const targetWidth = Math.max(1, Math.round(orientedWidth * ratio));
      const targetHeight = Math.max(1, Math.round(orientedHeight * ratio));
      if (!item.bytes.byteLength || !Number.isSafeInteger(item.width) || !Number.isSafeInteger(item.height) ||
          item.width <= 0 || item.height <= 0 ||
          Math.abs(targetWidth - item.width) > 1 || Math.abs(targetHeight - item.height) > 1)
        throw new FeedImageError("INVALID_IMAGE");
      if (item.bytes.byteLength <= FEED_IMAGE_OUTPUT_MAX_BYTES) return item;
      if (edge === 256) throw new FeedImageError("OUTPUT_TOO_LARGE");
      edge = Math.max(256, Math.round(edge * 0.75));
    }
  }
  return { thumb: await variant(480), full: await variant(1920) };
}
