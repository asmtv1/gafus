import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { assertFeedFinalKey, assertFeedObjectKey } from "@gafus/feed-storage";
export interface FeedCloudObjects {
  download(key: string, file: string, maxBytes: number, signal: AbortSignal, etag?: string): Promise<void>;
  create(key: string, bytes: Uint8Array, contentType: string, signal: AbortSignal): Promise<void>;
  delete(key: string, signal: AbortSignal): Promise<void>;
}
const albumFinal = /^albums\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/photos\/[A-Za-z0-9_-]{1,128}\/(thumb|full)\.webp$/;
export function createFeedCloudObjects(env: NodeJS.ProcessEnv = process.env): FeedCloudObjects {
  const bucket = env.FEED_BUCKET ?? "";
  const endpoint = env.FEED_S3_ENDPOINT ?? "https://s3.cloud.ru";
  const albumEndpoint = env.GALLERY_S3_ENDPOINT ?? "https://s3.cloud.ru";
  const region = (value: string) => {
    if (value === "https://s3.cloud.ru") return "ru-central-1";

    throw new Error("INVALID_FEED_STORAGE_ENDPOINT");
  };
  region(endpoint);
  region(albumEndpoint);
  if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(bucket) || /^(gafus-public|gafus-media)$/.test(bucket) ||
      !env.FEED_S3_ACCESS_KEY_ID || !env.FEED_S3_SECRET_ACCESS_KEY) throw new Error("INVALID_FEED_STORAGE_CONFIG");
  const client = new S3Client({ endpoint, region: region(endpoint), forcePathStyle: true,
    credentials: { accessKeyId: env.FEED_S3_ACCESS_KEY_ID, secretAccessKey: env.FEED_S3_SECRET_ACCESS_KEY },
    maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  // Album originals stay in the gallery bucket. This client is used only for reads.
  const albumBucket = env.FEED_ALBUM_BUCKET;
  const albumClient = albumBucket && env.GALLERY_S3_ACCESS_KEY_ID && env.GALLERY_S3_SECRET_ACCESS_KEY
    ? new S3Client({ endpoint: albumEndpoint, region: region(albumEndpoint), forcePathStyle: true,
        credentials: { accessKeyId: env.GALLERY_S3_ACCESS_KEY_ID, secretAccessKey: env.GALLERY_S3_SECRET_ACCESS_KEY }, maxAttempts: 2 }) : undefined;
  return {
    async download(key, file, maxBytes, signal, etag) {
      const fromAlbum = albumFinal.test(key);
      if (!fromAlbum) assertFeedObjectKey(key);
      if (fromAlbum && (!albumClient || !albumBucket || !/^[a-z0-9][a-z0-9.-]{2,62}$/.test(albumBucket))) throw new Error("ALBUM_STORAGE_UNAVAILABLE");
      if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 200 * 1024 * 1024) throw new Error("INVALID_SOURCE_LIMIT");
      signal.throwIfAborted();
      const result = await (fromAlbum ? albumClient! : client).send(new GetObjectCommand({ Bucket: fromAlbum ? albumBucket : bucket, Key: key, IfMatch: etag }), { abortSignal: signal });
      const body = result.Body;
      const destroy = () => (body as { destroy?: () => void } | undefined)?.destroy?.();
      if (!body || !result.ContentLength || result.ContentLength > maxBytes || (etag && result.ETag !== etag)) {
        destroy(); throw new Error("SOURCE_CHANGED");
      }
      const handle = await open(file, "wx", 0o600);
      let size = 0;
      try {
        for await (const packet of body as AsyncIterable<Uint8Array>) {
          signal.throwIfAborted(); size += packet.byteLength;
          if (size > maxBytes) throw new Error("SOURCE_SIZE");
          let offset = 0;
          while (offset < packet.byteLength) {
            const result = await handle.write(packet, offset, packet.byteLength - offset);
            if (!result.bytesWritten) throw new Error("SOURCE_WRITE_FAILED");
            offset += result.bytesWritten;
          }
        }
        if (size !== result.ContentLength) throw new Error("SOURCE_SIZE");
      } finally { destroy(); await handle.close(); }
    },
    async create(key, bytes, contentType, signal) {
      assertFeedFinalKey(key); signal.throwIfAborted();
      const expectedType = key.endsWith(".webp") ? "image/webp" : key.endsWith(".ts") ? "video/mp2t" : "application/vnd.apple.mpegurl";
      if (contentType !== expectedType || !bytes.byteLength || bytes.byteLength > (key.endsWith(".m3u8") ? 65536 : 1_750_000)) throw new Error("OUTPUT_SIZE");
      const digest = createHash("md5").update(bytes).digest();
      const expectedEtag = `"${digest.toString("hex")}"`;
      try {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes,
          ContentType: contentType, ContentMD5: digest.toString("base64"), IfNoneMatch: "*", CacheControl: "no-store" }), { abortSignal: signal });
      } catch (error) {
        if (![409, 412].includes((error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode ?? 0)) throw error;
      }
      const verified = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
      if (verified.ETag !== expectedEtag || verified.ContentLength !== bytes.byteLength || verified.ContentType !== contentType) throw new Error("IMMUTABLE_CONFLICT");
    },
    async delete(key, signal) {
      // Feed cleanup can never delete the original album photograph.
      assertFeedObjectKey(key); signal.throwIfAborted();
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
    },
  };
}
