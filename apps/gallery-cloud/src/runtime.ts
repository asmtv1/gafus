import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { createGalleryObjectStore } from '@gafus/gallery-storage/objects';
import { createGalleryInternalClient } from './internal.js';
import type { GalleryQueue } from './worker.js';
export function cloudObjects(env: NodeJS.ProcessEnv = process.env) {
  return createGalleryObjectStore({ bucket: env.GALLERY_BUCKET ?? '', endpoint: env.GALLERY_S3_ENDPOINT ?? 'https://s3.cloud.ru', accessKeyId: env.GALLERY_S3_ACCESS_KEY_ID ?? '', secretAccessKey: env.GALLERY_S3_SECRET_ACCESS_KEY ?? '' });
}
export function cloudCore(env: NodeJS.ProcessEnv = process.env) { return createGalleryInternalClient({ baseUrl: env.GALLERY_INTERNAL_BASE_URL ?? '', secret: env.GALLERY_INTERNAL_HMAC_SECRET ?? '' }); }
export function cloudQueue(env: NodeJS.ProcessEnv = process.env): GalleryQueue {
  if (!env.GALLERY_QUEUE_URL || !env.GALLERY_QUEUE_URL.startsWith('https://message-queue.api.cloud.yandex.net/')) throw new Error('INVALID_QUEUE_CONFIG');
  const client = new SQSClient({ endpoint: 'https://message-queue.api.cloud.yandex.net', region: 'ru-central1', credentials: { accessKeyId: env.GALLERY_QUEUE_ACCESS_KEY_ID ?? '', secretAccessKey: env.GALLERY_QUEUE_SECRET_ACCESS_KEY ?? '' }, maxAttempts: 2 });
  return { async send(uploadId) { if (!/^[A-Za-z0-9_-]{1,128}$/.test(uploadId)) throw new Error('INVALID_UPLOAD_ID'); await client.send(new SendMessageCommand({ QueueUrl: env.GALLERY_QUEUE_URL, MessageBody: JSON.stringify({ version: 1, uploadId }) }), { abortSignal: AbortSignal.timeout(5000) }); } };
}
