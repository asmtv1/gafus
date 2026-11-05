/**
 * S3 data plane for one authorized Chat2 V2 Job. Never touches existing media
 * buckets. Every allowed key is derived from the already validated claim.
 * Retries are immutable and accept only matching bytes/ETag/ContentType.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { chat2V2FinalKeys, validateChat2V2Job, type Chat2V2Job } from "@gafus/feed-cloud";
import type { Chat2V2Objects } from "./chat2-v2-processor.js";

export const CHAT2_CLOUD_BUCKET = "gafus-chat2-media-2026";
const outputMaxBytes = 200 * 1024 * 1024;
const webpMaxBytes = 10 * 1024 * 1024;

export function createChat2S3Objects(job: Chat2V2Job, client: S3Client): Chat2V2Objects {
  const info = validateChat2V2Job(job);
  const keys = chat2V2FinalKeys(job.conversationId, job.ownerId, job.mediaId);
  const webpKeys = new Set([keys.image.small, keys.image.medium, keys.video.poster]);
  const videoKeys = new Set([keys.video.variants[360], keys.video.variants[720]]);
  async function verified(key: string, bytes: number, mime: string, digest: Buffer, signal: AbortSignal) {
    const head = await client.send(new HeadObjectCommand({Bucket: CHAT2_CLOUD_BUCKET, Key: key}), {abortSignal: signal});
    if (head.ContentLength !== bytes || head.ContentType !== mime ||
        head.ETag?.replaceAll('"', '').toLowerCase() !== digest.toString('hex'))
      throw new Error("CHAT2_S3_IMMUTABLE_CONFLICT");
  }
  async function store(key: string, body: Uint8Array | Readable, length: number, mime: string, digest: Buffer, signal: AbortSignal) {
    const req = new PutObjectCommand({Bucket: CHAT2_CLOUD_BUCKET, Key: key,
      Body: body, ContentLength: length, ContentType: mime, ContentMD5: digest.toString('base64'),
      IfNoneMatch: "*", CacheControl: "public, max-age=86400, immutable"});
    try {
      const response = await client.send(req, {abortSignal: signal});
      // A successful Content-MD5-protected single-object PUT is authoritative.
      // Verify its returned ETag and let Core independently HEAD all outputs
      // before READY. Save the worker's redundant HEAD on the happy path.
      const etag = response.ETag?.replaceAll('"', '').toLowerCase();
      if (etag === digest.toString('hex')) return;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status !== 409 && status !== 412) throw error;
    }
    // Missing/non-MD5 ETag or immutable retry conflict: HEAD remains mandatory.
    await verified(key, length, mime, digest, signal);
  }
  return {
    async download(key, destination, maxBytes, signal) {
      const background = job.phase === "background_360";
      if (key !== (background ? keys.video.variants[720] : job.sourceKey) ||
          (background && info.kind !== "video") || maxBytes !== info.maxBytes)
        throw new Error("CHAT2_S3_SOURCE_KEY_DENIED");
      // The API has already verified HEAD before enqueueing. Here use one
      // bounded GET instead of another HEAD+GET pair; check exact length/MIME
      // on the GET response before touching the filesystem.
      const response = await client.send(new GetObjectCommand({Bucket: CHAT2_CLOUD_BUCKET, Key: key}), {abortSignal: signal});
      const stream = response.Body;
      if ((background
            ? !Number.isSafeInteger(response.ContentLength) || !response.ContentLength || response.ContentLength > maxBytes
            : response.ContentLength !== job.sourceBytes || job.sourceBytes > maxBytes) ||
          response.ContentType !== (background ? "video/mp4" : job.sourceMime)) {
        if (stream && "destroy" in stream) (stream as Readable).destroy();
        throw new Error("CHAT2_S3_SOURCE_SIZE_OR_MIME_MISMATCH");
      }
      if (!stream || !("pipe" in stream)) throw new Error("CHAT2_S3_SOURCE_NOT_STREAM");
      let received = 0;
      const limiter = new Transform({transform(chunk: Buffer, _enc, next) {
        received += chunk.length;
        next(received <= maxBytes ? null : new Error("CHAT2_S3_SOURCE_TOO_LARGE"), received <= maxBytes ? chunk : undefined);
      }});
      await pipeline(stream as Readable, limiter, createWriteStream(destination, {flags: "wx"}), {signal});
      if (received !== response.ContentLength) throw new Error("CHAT2_S3_SOURCE_MISMATCH");
    },
    async create(key, bytes, mime, signal) {
      if (!webpKeys.has(key) || mime !== "image/webp" ||
          bytes.byteLength < 12 || bytes.byteLength > webpMaxBytes)
        throw new Error("CHAT2_S3_WEBP_KEY_DENIED");
      const digest = createHash("md5").update(bytes).digest();
      await store(key, bytes, bytes.byteLength, mime, digest, signal);
    },
    async createFile(key, file, signal) {
      if (!videoKeys.has(key)) throw new Error("CHAT2_S3_MP4_KEY_DENIED");
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 24 || stat.size > outputMaxBytes)
        throw new Error("CHAT2_S3_MP4_SIZE");
      signal.throwIfAborted();
      const hash = createHash("md5");
      for await (const part of createReadStream(file)) {signal.throwIfAborted(); hash.update(part);}
      await store(key, createReadStream(file), stat.size, "video/mp4", hash.digest(), signal);
    },
  };
}
