import { cdnIsolatedAcceptance } from "./cdn-isolated-acceptance.js";
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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
  const qa = cdnIsolatedAcceptance(env) && config.isolatedNonprod === true &&
    config.endpoint === 'http://127.0.0.1:58390' && config.bucket === 'gafus-refactor-agent2-gallery-test';
  if (env.GALLERY_MEDIA_FALLBACK_ENABLED !== 'true' ||
      (!qa && (config.endpoint !== 'https://s3.cloud.ru' || config.bucket !== 'gafus-gallery-private')) || !config.enabled)
    throw new Error('GALLERY_FALLBACK_DISABLED');
  const client = createGalleryS3Client(config);
  try {
    return await getSignedUrl(client, new GetObjectCommand({
      Bucket: config.bucket, Key: key, ResponseCacheControl: `private, max-age=${Math.min(60, ttlSeconds - 20)}, must-revalidate`,
    }), { expiresIn: ttlSeconds });
  } finally { client.destroy(); }
}

/** CDN-origin signer, not a viewer endpoint. Only the protected API route calls it. */
export async function signGalleryCloudruCdnOrigin(
  key: string, method: 'GET' | 'HEAD',
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  assertFinalKey(key);
  if (method !== 'GET' && method !== 'HEAD') throw new Error('INVALID_CDN_ORIGIN_METHOD');
  const config = galleryStorageConfigFromEnv(env);
  if (!config.enabled || !config.cdnOriginRouteEnabled ||
      config.endpoint !== 'https://s3.cloud.ru' || config.bucket !== 'gafus-gallery-private' ||
      config.cdnBaseUrl !== 'https://fupiquafifeswu.begetcdn.cloud')
    throw new Error('GALLERY_CDN_ORIGIN_DISABLED');
  const client = createGalleryS3Client(config);
  try {
    return await getSignedUrl(client, method === 'HEAD'
      ? new HeadObjectCommand({ Bucket: config.bucket, Key: key })
      : new GetObjectCommand({ Bucket: config.bucket, Key: key }), { expiresIn: 60 });
  } finally { client.destroy(); }
}
