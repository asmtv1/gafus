import { createGalleryObjectStore } from '@gafus/gallery-storage/objects';
import { createGalleryInternalClient } from './internal.js';
export function cloudObjects(env: NodeJS.ProcessEnv = process.env) {
  return createGalleryObjectStore({ bucket: env.GALLERY_BUCKET ?? '', endpoint: env.GALLERY_S3_ENDPOINT ?? 'https://s3.cloud.ru', accessKeyId: env.GALLERY_S3_ACCESS_KEY_ID ?? '', secretAccessKey: env.GALLERY_S3_SECRET_ACCESS_KEY ?? '', cacheableFinalEnabled: env.GALLERY_CDN_CACHEABLE_FINAL_ENABLED === 'true' });
}
export function cloudCore(env: NodeJS.ProcessEnv = process.env) { return createGalleryInternalClient({ baseUrl: env.GALLERY_INTERNAL_BASE_URL ?? '', secret: env.GALLERY_INTERNAL_HMAC_SECRET ?? '' }); }
