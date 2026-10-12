import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertFinalKey } from './keys.js';
import { createGalleryS3Client } from './objects.js';
import { galleryStorageConfigFromEnv } from './config.js';
/** Infrastructure-only signer: callers MUST obtain the key from core authorization. */
export async function signGalleryCloudruFallback(key: string, ttlSeconds = 120,
  env: Record<string, string | undefined> = process.env): Promise<string> {
  assertFinalKey(key);
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 120)
    throw new Error('INVALID_FALLBACK_TTL');
  const config = galleryStorageConfigFromEnv(env);
  if (env.GALLERY_MEDIA_FALLBACK_ENABLED !== 'true' || config.endpoint !== 'https://s3.cloud.ru' ||
      config.bucket !== 'gafus-gallery-private' || !config.enabled)
    throw new Error('GALLERY_FALLBACK_DISABLED');
  const client = createGalleryS3Client(config);
  try {
    return await getSignedUrl(client, new GetObjectCommand({
      Bucket: config.bucket, Key: key, ResponseCacheControl: 'private, no-store',
    }), { expiresIn: ttlSeconds });
  } finally { client.destroy(); }
}
