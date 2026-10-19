import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { assertFeedFinalKey, assertFeedObjectKey } from "@gafus/feed-storage";
import { classifyFeedFailure } from "./failure-diagnostics.js";
import type { FeedWorkerTrace } from "@gafus/feed-cloud";
/** One metric per S3 request. Never log bucket names, keys, endpoints or response bodies. */
async function measuredS3<T>(operation: string, kind: string, action: () => Promise<T>,
  trace?: FeedWorkerTrace): Promise<T> {
  const started = performance.now();
  console.log(JSON.stringify({ event: "feed_s3_start", operation, kind, trace }));
  try {
    const result = await action();
    console.log(JSON.stringify({ event: "feed_s3_success", operation, kind, trace,
      durationMs: Math.round(performance.now() - started) }));
    return result;
  } catch (error) {
    console.error(JSON.stringify({ event: "feed_s3_failure", operation, kind, trace,
      durationMs: Math.round(performance.now() - started),
      ...classifyFeedFailure("S3_" + operation.toUpperCase(), error) }));
    throw error;
  }
}
export interface FeedCloudObjects {
  download(key: string, file: string, maxBytes: number, signal: AbortSignal, etag?: string): Promise<void>;
  read(key: string, maxBytes: number, signal: AbortSignal, etag?: string): Promise<Uint8Array>;
  create(key: string, bytes: Uint8Array, contentType: string, signal: AbortSignal): Promise<void>;
  delete(key: string, signal: AbortSignal): Promise<void>;
}
const albumFinal = /^albums\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/photos\/[A-Za-z0-9_-]{1,128}\/(thumb|full)\.webp$/;
export function createFeedCloudObjects(env: NodeJS.ProcessEnv = process.env,
  trace?: FeedWorkerTrace): FeedCloudObjects {
  const bucket = env.FEED_BUCKET ?? "";
  const endpoint = env.FEED_S3_ENDPOINT ?? "https://s3.cloud.ru";
  if (env.FEED_BUCKET_PUBLIC !== undefined && !["true", "false"].includes(env.FEED_BUCKET_PUBLIC))
    throw new Error("INVALID_FEED_FLAG");
  const publicRead = env.FEED_BUCKET_PUBLIC === "true";
  if (publicRead && bucket !== "gafus-feed-private") throw new Error("INVALID_PUBLIC_FEED_BUCKET");
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
      const getStarted = performance.now();
      const result = await measuredS3("get", fromAlbum ? "album_photo" : "feed_source",
        () => (fromAlbum ? albumClient! : client).send(new GetObjectCommand({
          Bucket: fromAlbum ? albumBucket : bucket, Key: key, IfMatch: etag,
        }), { abortSignal: signal }), trace);
      console.log(JSON.stringify({ event: "feed_s3_get_headers", kind: fromAlbum ? "album_photo" : "feed_source",
        bytes: result.ContentLength ?? null,
        contentType: ["video/mp4", "video/quicktime", "video/webm", "image/png",
          "image/jpeg", "image/webp"].includes(result.ContentType ?? "")
          ? result.ContentType : "OTHER",
        etagMatched: !etag || result.ETag === etag,
        headerMs: Math.round(performance.now() - getStarted), trace }));
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
        console.log(JSON.stringify({ event: "feed_s3_download_complete",
          kind: fromAlbum ? "album_photo" : "feed_source", bytes: size,
          durationMs: Math.round(performance.now() - getStarted), trace }));
      } catch (error) {
        console.error(JSON.stringify({ event: "feed_s3_download_failure",
          kind: fromAlbum ? "album_photo" : "feed_source", bytesRead: size,
          durationMs: Math.round(performance.now() - getStarted), trace,
          ...classifyFeedFailure("S3_DOWNLOAD_STREAM", error) }));
        throw error;
      } finally { destroy(); await handle.close(); }
    },
    async read(key, maxBytes, signal, etag) {
      const fromAlbum = albumFinal.test(key);
      if (!fromAlbum) assertFeedObjectKey(key);
      if (fromAlbum && (!albumClient || !albumBucket || !/^[a-z0-9][a-z0-9.-]{2,62}$/.test(albumBucket)))
        throw new Error("ALBUM_STORAGE_UNAVAILABLE");
      if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 10 * 1024 * 1024)
        throw new Error("INVALID_SOURCE_LIMIT");
      signal.throwIfAborted();
      const result = await measuredS3("get", fromAlbum ? "album_photo" : "feed_source",
        () => (fromAlbum ? albumClient! : client).send(new GetObjectCommand({
          Bucket: fromAlbum ? albumBucket : bucket, Key: key, IfMatch: etag,
        }), { abortSignal: signal }), trace);
      const body = result.Body;
      const destroy = () => (body as { destroy?: () => void } | undefined)?.destroy?.();
      if (!body || !result.ContentLength || result.ContentLength > maxBytes || (etag && result.ETag !== etag)) {
        destroy();
        throw new Error("SOURCE_CHANGED");
      }
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const packet of body as AsyncIterable<Uint8Array>) {
          signal.throwIfAborted();
          size += packet.byteLength;
          if (size > maxBytes) throw new Error("SOURCE_SIZE");
          chunks.push(Buffer.from(packet));
        }
        if (size !== result.ContentLength) throw new Error("SOURCE_SIZE");
        return Buffer.concat(chunks, size);
      } finally {
        destroy();
      }
    },
    async create(key, bytes, contentType, signal) {
      assertFeedFinalKey(key); signal.throwIfAborted();
      const expectedType = key.endsWith(".webp") ? "image/webp" : key.endsWith(".ts") ? "video/mp2t" : "application/vnd.apple.mpegurl";
      if (contentType !== expectedType || !bytes.byteLength || bytes.byteLength > (key.endsWith(".m3u8") ? 65536 : 1_750_000)) throw new Error("OUTPUT_SIZE");
      const digest = createHash("md5").update(bytes).digest();
      const expectedEtag = `"${digest.toString("hex")}"`;
      let uploadedETag: string | undefined;
      try {
        const uploaded = await measuredS3("put", key.endsWith(".ts") ? "video_segment" :
          key.endsWith(".m3u8") ? "video_playlist" : "image_variant", () =>
          client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes,
            ContentType: contentType, ContentMD5: digest.toString("base64"), IfNoneMatch: "*",
            CacheControl: publicRead
              ? "public, max-age=180, s-maxage=86400, must-revalidate"
              : "no-store" }), { abortSignal: signal }), trace);
        uploadedETag = uploaded.ETag;
      } catch (error) {
        if (![409, 412].includes((error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode ?? 0)) throw error;
      }
      // For HLS segments only, a successful immutable single-part PUT with
      // Content-MD5 and a matching ETag proves the stored bytes. Avoid the
      // extra HEAD per segment; preserve HEAD for posters, playlists, photos,
      // collisions and responses missing the expected ETag.
      if (key.endsWith(".ts") && uploadedETag === expectedEtag) return;
      const verified = await measuredS3("head", key.endsWith(".ts") ? "video_segment" :
        key.endsWith(".m3u8") ? "video_playlist" : "image_variant", () =>
        client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal }), trace);
      if (verified.ETag !== expectedEtag || verified.ContentLength !== bytes.byteLength || verified.ContentType !== contentType) throw new Error("IMMUTABLE_CONFLICT");
    },
    async delete(key, signal) {
      // Feed cleanup can never delete the original album photograph.
      assertFeedObjectKey(key); signal.throwIfAborted();
      await measuredS3("delete", "feed", () =>
        client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal }), trace);
    },
  };
}
