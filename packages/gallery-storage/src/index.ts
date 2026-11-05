export { signGalleryCloudruFallback, signGalleryCloudruCdnOrigin } from './fallback.js';
import type { GalleryStoragePort } from '@gafus/core/services/gallery';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { galleryStorageConfigFromEnv } from './config.js';
import { createGalleryS3Client, createGalleryObjectStore } from './objects.js';
import { sourcePattern, clientThumbPattern, assertGalleryKey, assertFinalKey } from './keys.js';
import { signGalleryCdnUrl } from './cdn.js';
import { localReadonlyCdnSecret } from '@gafus/cdn-upload/local-readonly-cdn';
import { signClientWebpStaging, verifyClientWebp, copyVerifiedClientWebp,
  clientWebpRenditionsMatchAspect } from '@gafus/cdn-upload';
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
    async signClientThumb(input) {
      if (!config.enabled || !client || !input.sourceKey.endsWith('/source.webp'))
        throw Error('GALLERY_CLIENT_PHOTO_DISABLED');
      const source = sourcePattern.exec(input.sourceKey);
      const thumb = input.sourceKey.replace(/source\.webp$/, 'thumb.webp');
      const expires = Math.floor((input.expiresAt.getTime() - Date.now()) / 1000);
      if (!source || !clientThumbPattern.test(thumb) || expires < 1 || expires > 600)
        throw Error('GALLERY_CLIENT_PHOTO_POLICY_INVALID');
      return signClientWebpStaging(client, config.bucket, thumb, 1_750_000, expires);
    },
    async publishClientPhoto(input) {
      if (!config.enabled || !client || !sourcePattern.test(input.sourceKey) ||
          !input.sourceKey.endsWith('/source.webp'))
        throw Error('GALLERY_CLIENT_PHOTO_DISABLED');
      const stage = input.sourceKey.replace(/source\.webp$/, 'thumb.webp');
      const prefix = input.sourceKey.split('/');
      const ownerId = prefix[1], albumId = prefix[2];
      const finalPrefix = `gallery/${ownerId}/media/`;
      if (!clientThumbPattern.test(stage) || !input.thumbKey.startsWith(finalPrefix) ||
          input.fullKey !== input.thumbKey.replace(/thumb\.webp$/, 'full.webp') ||
          !input.thumbKey.endsWith('/v2/thumb.webp')) throw Error('GALLERY_CLIENT_PHOTO_KEYS_INVALID');
      assertFinalKey(input.thumbKey); assertFinalKey(input.fullKey);
      const [small, full] = await Promise.all([
        verifyClientWebp(client, config.bucket, stage, 480, 1_750_000),
        verifyClientWebp(client, config.bucket, input.sourceKey, 1920, 1_750_000),
      ]);
      if (!clientWebpRenditionsMatchAspect(small, full))
        throw Error('GALLERY_CLIENT_PHOTO_DIMENSIONS_INVALID');
      await Promise.all([
        copyVerifiedClientWebp(client, config.bucket, stage, input.thumbKey, small, 'private, must-revalidate'),
        copyVerifiedClientWebp(client, config.bucket, input.sourceKey, input.fullKey, full, 'private, must-revalidate'),
      ]);
      return { width: full.width, height: full.height };
    },
    async head(key) { assertGalleryKey(key); if (!objects) throw new Error('MISSING_GALLERY_STORAGE'); return objects.head(key, AbortSignal.timeout(5000)); },
    async signCdn(input) {
      if (!config.enabled || !client) throw new Error('GALLERY_DISABLED');
      if (liveCdnSecret) {
        assertFinalKey(input.key);
        return signGalleryCdnUrl("https://fupiquafifeswu.begetcdn.cloud", input.key, input.expiresAt, liveCdnSecret, Date.now(), "beget");
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

// Existing-worker S3 janitor uses the same validated object/key contracts as Gallery.
export { createGalleryObjectStore, normalizeETag, objectMd5 } from "./objects.js";
export type { GalleryObjectStore } from "./objects.js";
export { assertFinalKey, assertGalleryKey } from "./keys.js";
