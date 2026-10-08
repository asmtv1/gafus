import { createGalleryOrigin, type OriginEvent } from './origin-handler.js';
import { cloudObjects } from './runtime.js';
let origin: ReturnType<typeof createGalleryOrigin>;
export async function handler(event: OriginEvent) {
  origin ??= createGalleryOrigin({ objects: cloudObjects(), secret: process.env.GALLERY_ORIGIN_SECRET ?? '', cdnSecret: process.env.GALLERY_ORIGIN_VERIFY_TOKEN === 'true' ? process.env.GALLERY_CDN_SECRET : undefined });
  return origin(event);
}
