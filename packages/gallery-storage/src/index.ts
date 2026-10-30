export { signGalleryCloudruFallback } from './fallback.js';
import type { GalleryStoragePort } from '@gafus/core/services/gallery';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { galleryStorageConfigFromEnv } from './config.js';
import { createGalleryS3Client, createGalleryObjectStore } from './objects.js';
import { sourcePattern, assertGalleryKey, assertFinalKey } from './keys.js';
import { signGalleryCdnUrl } from './cdn.js';
import { localReadonlyCdnSecret } from '@gafus/cdn-upload/local-readonly-cdn';
export { galleryStorageConfigFromEnv } from './config.js';
export type { GalleryStorageConfig } from './config.js';
/** Composition root can inject this port directly; no runtime core import. */
export function createGalleryStorageFromEnv(env: Record<string, string | undefined> = process.env): GalleryStoragePort {
  const config = galleryStorageConfigFromEnv(env);
  const liveCdnSecret = localReadonlyCdnSecret("gallery", env);
  const hasStorage = !!(config.bucket && config.accessKeyId && config.secretAccessKey);
  const client = hasStorage ? createGalleryS3Client(config) : null;
  const objects = client ? createGalleryObjectStore(config, client) : null;
  return {
    enabled: config.enabled,
    async presignPost(input) {
      if (!config.enabled || !client) throw new Error('GALLERY_DISABLED');
      assertGalleryKey(input.key);
      const source = sourcePattern.exec(input.key);
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[input.contentType];
      const expires = Math.floor((input.expiresAt.getTime() - Date.now()) / 1000);
      if (!source || source[4] !== ext || input.maxBytes !== 10 * 1024 * 1024 || expires <= 0 || expires > 600) throw new Error('INVALID_UPLOAD_POLICY');
      return createPresignedPost(client, { Bucket: config.bucket, Key: input.key, Expires: expires, Fields: { 'Content-Type': input.contentType, 'success_action_status': '204' }, Conditions: [['content-length-range', 1, input.maxBytes], ['eq', '$Content-Type', input.contentType], ['eq', '$key', input.key], ['eq', '$success_action_status', '204']] });
    },
    async head(key) { assertGalleryKey(key); if (!objects) throw new Error('MISSING_GALLERY_STORAGE'); return objects.head(key, AbortSignal.timeout(5000)); },
    async signCdn(input) {
      if (!config.enabled || !client) throw new Error('GALLERY_DISABLED');
      if (liveCdnSecret) {
        assertFinalKey(input.key);
        return signGalleryCdnUrl("https://mepsuduyokabib.begetcdn.cloud", input.key, input.expiresAt, liveCdnSecret, Date.now(), "beget");
      }
      if (config.isolatedNonprod) {
        assertFinalKey(input.key); // Never expose source uploads or veterinary originals.
        const now = Math.floor(Date.now() / 1000);
        const expires = Math.floor(input.expiresAt.getTime() / 1000);
        if (!Number.isSafeInteger(expires) || expires <= now || expires > now + 360)
          throw new Error('INVALID_LOCAL_S3_EXPIRY');
        return getSignedUrl(client, new GetObjectCommand({
          Bucket: config.bucket, Key: input.key, ResponseCacheControl: 'private, no-store',
        }), { expiresIn: expires - now });
      }
      return signGalleryCdnUrl(config.cdnBaseUrl, input.key, input.expiresAt, config.cdnSecret, Date.now(), config.cdnProvider);
    },
  };
}
