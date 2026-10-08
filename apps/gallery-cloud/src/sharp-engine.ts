import sharp from 'sharp';
import type { GalleryImageEngine } from '@gafus/core/services/gallery/imageProcessing';
// Sequential scenario + one libvips thread per invocation bounds native memory.
sharp.concurrency(1);
sharp.cache(false);
export const sharpGalleryEngine: GalleryImageEngine = {
  async inspect(bytes, options) {
    const info = await sharp(bytes, { limitInputPixels: options.limitInputPixels, failOn: 'warning', animated: false }).metadata();
    return { format: info.format ?? '', width: info.width ?? 0, height: info.height ?? 0, orientation: info.orientation, pages: info.pages };
  },
  async autoOrientResizeEncodeWebp(bytes, options) {
    // Sharp strips metadata by default. Do not call withMetadata/keepMetadata.
    const result = await sharp(bytes, { limitInputPixels: options.limitInputPixels, failOn: 'warning', animated: false })
      .rotate().resize({ width: options.maxEdge, height: options.maxEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: options.quality }).toBuffer({ resolveWithObject: true });
    return { bytes: result.data, width: result.info.width, height: result.info.height };
  },
};
