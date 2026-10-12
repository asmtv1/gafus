import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertFeedFinalKey } from './keys.js';
import { feedStorageConfigFromEnv } from './storage.js';
/** Signs a single authorized final object; never accepts untrusted source keys. */
export async function signFeedCloudruFallback(key: string, ttlSeconds = 120,
  env: Record<string, string | undefined> = process.env): Promise<string> {
  assertFeedFinalKey(key);
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 120)
    throw new Error('INVALID_FALLBACK_TTL');
  const config = feedStorageConfigFromEnv(env);
  if (env.FEED_MEDIA_FALLBACK_ENABLED !== 'true' || config.endpoint !== 'https://s3.cloud.ru' ||
      config.bucket !== 'gafus-feed-private' || !config.enabled)
    throw new Error('FEED_FALLBACK_DISABLED');
  const client = new S3Client({
    endpoint: config.endpoint, region: 'ru-central-1', forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 2,
  });
  try {
    return await getSignedUrl(client, new GetObjectCommand({
      Bucket: config.bucket, Key: key, ResponseCacheControl: 'private, no-store',
    }), { expiresIn: ttlSeconds });
  } finally { client.destroy(); }
}
