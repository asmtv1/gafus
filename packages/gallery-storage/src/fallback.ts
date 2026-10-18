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

/** Test-only signer for one fixed Gallery fixture (the API guards the exact key). */
export async function signGalleryCloudruRedirectProbe(
  key: string, method: 'GET' | 'HEAD', env: Record<string, string | undefined> = process.env,
): Promise<string> {
  assertFinalKey(key);
  if (!/^albums\/beget-smoke-([a-f0-9]{32})\/beget-smoke-\1\/photos\/\1\/full\.webp$/.test(key) ||
      (method !== 'GET' && method !== 'HEAD')) throw new Error('INVALID_GALLERY_REDIRECT_PROBE');
  const config = galleryStorageConfigFromEnv(env);
  if (!config.enabled || config.bucket !== 'gafus-gallery-private' ||
      config.endpoint !== 'https://s3.cloud.ru') throw new Error('GALLERY_REDIRECT_PROBE_STORAGE_DISABLED');
  const client = createGalleryS3Client(config);
  try {
    const command = method === 'HEAD'
      ? new HeadObjectCommand({ Bucket: config.bucket, Key: key })
      : new GetObjectCommand({ Bucket: config.bucket, Key: key,
          ResponseCacheControl: 'public, max-age=600' });
    return await getSignedUrl(client, command, { expiresIn: 60 });
  } finally { client.destroy(); }
}

/** Only the CDN origin route may call this signer, after static origin-secret validation.
 * Do not accept user-supplied keys without validating final-only media paths.
 */
export async function signGalleryCloudruCdnOrigin(
  key: string, method: 'GET' | 'HEAD', env: Record<string, string | undefined> = process.env,
): Promise<string> {
  assertFinalKey(key);
  if (method !== 'GET' && method !== 'HEAD') throw new Error('INVALID_CDN_ORIGIN_METHOD');
  const config = galleryStorageConfigFromEnv(env);
  if (!config.cdnOriginRouteEnabled || !config.enabled ||
      config.endpoint !== 'https://s3.cloud.ru' || config.bucket !== 'gafus-gallery-private' ||
      !['https://dikinuneceswe.begetcdn.cloud', 'https://mepsuduyokabib.begetcdn.cloud']
        .includes(config.cdnBaseUrl) ||
      !/^[A-Za-z0-9]{32,128}$/.test(env.GALLERY_CDN_REDIRECT_ORIGIN_SECRET ?? '') ||
      !/^[A-Za-z0-9]{24,128}$/.test(env.GALLERY_CDN_REDIRECT_SIGNING_SECRET ?? ''))
    throw new Error('GALLERY_CDN_ORIGIN_DISABLED');
  const client = createGalleryS3Client(config);
  try {
    const command = method === 'HEAD'
      ? new HeadObjectCommand({ Bucket: config.bucket, Key: key })
      : new GetObjectCommand({ Bucket: config.bucket, Key: key });
    return await getSignedUrl(client, command, { expiresIn: 60 });
  } finally { client.destroy(); }
}
