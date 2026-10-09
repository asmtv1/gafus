import sharp from "sharp";
import type { FeedImageEngine } from "@gafus/feed-cloud";
sharp.concurrency(1);
sharp.cache(false);
export const sharpFeedEngine: FeedImageEngine = {
  async inspect(bytes, pixelLimit) {
    const info = await sharp(bytes, { limitInputPixels: pixelLimit, failOn: "warning", animated: false }).metadata();
    return { format: info.format ?? "", width: info.width ?? 0, height: info.height ?? 0, pages: info.pages, orientation: info.orientation };
  },
  async encode(bytes, options) {
    const result = await sharp(bytes, { limitInputPixels: options.pixelLimit, failOn: "warning", animated: false })
      .rotate().resize({ width: options.maxEdge, height: options.maxEdge, fit: "inside", withoutEnlargement: true })
      .webp({ quality: options.quality }).toBuffer({ resolveWithObject: true });
    return { bytes: result.data, width: result.info.width, height: result.info.height };
  },
};
