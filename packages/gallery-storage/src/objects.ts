import { createHash } from 'node:crypto';
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import type { GalleryObjectMetadata } from '@gafus/core/services/gallery';
import { assertGalleryKey, finalPattern, vetPreviewPattern } from './keys.js';
import { validateGalleryObjectConfig, type GalleryStorageConfig } from './config.js';
export const MAX_OBJECT_BYTES = 10 * 1024 * 1024;
export interface GalleryObjectStore {
  head(key: string, signal?: AbortSignal): Promise<GalleryObjectMetadata | null>;
  read(key: string, etag?: string, signal?: AbortSignal, maxBytes?: number): Promise<{ bytes: Uint8Array; metadata: GalleryObjectMetadata }>;
  create(key: string, bytes: Uint8Array, type: 'image/webp', signal?: AbortSignal): Promise<GalleryObjectMetadata>;
  delete(key: string, signal?: AbortSignal): Promise<void>;
}
export function objectMd5(bytes: Uint8Array): string { return `"${createHash('md5').update(bytes).digest('hex')}"`; }
export function normalizeETag(etag: string): string {
  const value = etag.replace(/^"|"$/g, '');
  if (!/^[a-fA-F0-9]{32}$/.test(value)) throw new Error('INVALID_OBJECT_ETAG');
  return `"${value.toLowerCase()}"`;
}
function status(error: unknown): number | undefined { return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode; }
function metadata(x: { ETag?: string; ContentLength?: number; ContentType?: string }): GalleryObjectMetadata {
  if (!x.ETag || !Number.isSafeInteger(x.ContentLength) || x.ContentLength! <= 0 || x.ContentLength! > MAX_OBJECT_BYTES || !x.ContentType) throw new Error('INVALID_OBJECT_METADATA');
  return { etag: normalizeETag(x.ETag), bytes: x.ContentLength!, contentType: x.ContentType };
}
export function createGalleryS3Client(config: Pick<GalleryStorageConfig, 'bucket' | 'endpoint' | 'accessKeyId' | 'secretAccessKey'>): S3Client {
  validateGalleryObjectConfig(config);
  return new S3Client({ endpoint: config.endpoint, region: config.endpoint === 'https://s3.cloud.ru' ? 'ru-central-1' : 'ru-central1', forcePathStyle: true, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 2, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
}
export function createGalleryObjectStore(config: Pick<GalleryStorageConfig, 'bucket' | 'endpoint' | 'accessKeyId' | 'secretAccessKey'> & { cacheableFinalEnabled?: boolean }, client = createGalleryS3Client(config)): GalleryObjectStore {
  const bucket = config.bucket;
  const head: GalleryObjectStore['head'] = async (key, signal) => {
    assertGalleryKey(key);
    try { return metadata(await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal })); }
    catch (e) { if (status(e) === 404) return null; throw e; }
  };
  return {
    head,
    async read(key, etag, signal, maxBytes = MAX_OBJECT_BYTES) {
      if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_OBJECT_BYTES) throw new Error('INVALID_READ_LIMIT');
      assertGalleryKey(key);
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, IfMatch: etag ? normalizeETag(etag) : undefined }), { abortSignal: signal });
      let meta: GalleryObjectMetadata;
      try { meta = metadata(out); } catch (error) { (out.Body as { destroy?: () => void })?.destroy?.(); throw error; }
      if (meta.bytes > maxBytes) { (out.Body as { destroy?: () => void })?.destroy?.(); throw new Error('OBJECT_BYTE_LIMIT'); }
      if (etag && meta.etag !== normalizeETag(etag)) { (out.Body as { destroy?: () => void })?.destroy?.(); throw new Error('SOURCE_CHANGED'); }
      if (!out.Body) throw new Error('EMPTY_OBJECT');
      // Bound streamed bytes too; ContentLength alone is insufficient.
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of out.Body as AsyncIterable<Uint8Array>) {
        if (signal?.aborted) throw new Error('LEASE_EXPIRED');
        size += chunk.byteLength;
        if (size > maxBytes) { (out.Body as { destroy?: () => void }).destroy?.(); throw new Error('IMAGE_SIZE'); }
        chunks.push(Buffer.from(chunk));
      }
      if (size !== meta.bytes) throw new Error('OBJECT_SIZE_MISMATCH');
      return { bytes: Buffer.concat(chunks), metadata: meta };
    },
    async create(key, bytes, type, signal) {
      assertGalleryKey(key);
      if (!bytes.byteLength || bytes.byteLength > MAX_OBJECT_BYTES || type !== 'image/webp') throw new Error('IMAGE_SIZE');
      const expected = { etag: objectMd5(bytes), bytes: bytes.byteLength, contentType: type };
      const matches = (actual: GalleryObjectMetadata | null) => actual && actual.etag === expected.etag && actual.bytes === expected.bytes && actual.contentType === type;
      const existing = await head(key, signal);
      if (existing) { if (!matches(existing)) throw new Error('IMMUTABLE_CONFLICT'); return existing; }
      if (signal?.aborted) throw new Error('LEASE_EXPIRED');
      try {
        const result = await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: type, CacheControl: config.cacheableFinalEnabled && (finalPattern.test(key) || vetPreviewPattern.test(key))
          ? 'public, max-age=180, s-maxage=600, must-revalidate' : 'no-store', ContentMD5: createHash('md5').update(bytes).digest('base64'), IfNoneMatch: '*' }), { abortSignal: signal });
        if (!result.ETag || normalizeETag(result.ETag) !== expected.etag) throw new Error('WRITE_ETAG_MISMATCH');
      } catch (e) { if (status(e) !== 412 && status(e) !== 409) throw e; }
      const verified = await head(key, signal);
      if (!matches(verified)) throw new Error('IMMUTABLE_CONFLICT');
      return verified!;
    },
    async delete(key, signal) {
      assertGalleryKey(key);
      if (signal?.aborted) throw new Error('LEASE_EXPIRED');
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
    },
  };
}
