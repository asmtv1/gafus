import { createHash, timingSafeEqual } from "node:crypto";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { feedOriginKey } from "@gafus/feed-storage/keys";
import { feedV2Range } from "@gafus/feed-cloud";
interface OriginEvent {
  httpMethod?: string; requestContext?: { http?: { method?: string } };
  path?: string; rawPath?: string; headers?: Record<string, string | undefined>;
}
let client: S3Client | undefined;
export async function handler(event: OriginEvent) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" };
  const failure = (statusCode: number) => ({ statusCode, headers, body: "" });
  try {
    const expected = process.env.FEED_ORIGIN_SECRET ?? "";
    const supplied = Object.entries(event.headers ?? {}).find(([name]) => name.toLowerCase() === (process.env.FEED_ORIGIN_HEADER ?? "x-feed-origin-secret"))?.[1] ?? "";
    const hash = (value: string) => createHash("sha256").update(value).digest();
    if (expected.length < 32 || !timingSafeEqual(hash(expected), hash(supplied))) return failure(403);
    const method = event.httpMethod ?? event.requestContext?.http?.method;
    if (method !== "GET" && method !== "HEAD") return failure(405);
    const key = feedOriginKey(event.rawPath ?? event.path ?? "");
    // Only final WebP and progressive MP4, never originals, HLS or attempts.
    const isMp4 = key.endsWith(".mp4");
    if (!isMp4 && !key.endsWith(".webp")) return failure(404);
    const bucket = process.env.FEED_BUCKET ?? "";
    if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(bucket) || /^(gafus-media|gafus-public)$/.test(bucket)) return failure(503);
    const endpoint = process.env.FEED_S3_ENDPOINT ?? "https://s3.cloud.ru";
    if (endpoint !== "https://s3.cloud.ru") throw new Error("INVALID_FEED_STORAGE_ENDPOINT");
    client ??= new S3Client({ endpoint, region: "ru-central-1", forcePathStyle: true,
      credentials: { accessKeyId: process.env.FEED_S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.FEED_S3_SECRET_ACCESS_KEY ?? "" },
      maxAttempts: 1, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
    const signal = AbortSignal.timeout(3500);
    if (isMp4) {
      const metadata = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
      const total = metadata.ContentLength ?? 0;
      if (!Number.isSafeInteger(total) || total < 24 || total > 200 * 1024 * 1024 ||
          metadata.ContentType !== "video/mp4") return failure(404);
      const baseHeaders = { ...headers, "Content-Type": "video/mp4", "Accept-Ranges": "bytes" };
      if (method === "HEAD") return { statusCode: 200,
        headers: { ...baseHeaders, "Content-Length": String(total) }, body: "" };
      const incomingRange = Object.entries(event.headers ?? {}).find(([name]) => name.toLowerCase() === "range")?.[1];
      // The origin function never materializes a full 200MB movie in memory.
      // Browsers request Range: bytes=0- and continue from Content-Range.
      const plan = feedV2Range(total, incomingRange ?? "bytes=0-", "video/mp4");
      if (plan.status === 416) return { statusCode: 416,
        headers: { ...baseHeaders, ...plan.headers }, body: "" };
      const end = Math.min(plan.end, plan.start + 1_750_000 - 1);
      const chunk = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key,
        Range: `bytes=${plan.start}-${end}` }), { abortSignal: signal });
      const body = chunk.Body as (AsyncIterable<Uint8Array> & { destroy?: () => void }) | undefined;
      if (!body || chunk.ContentLength !== end - plan.start + 1 ||
          chunk.ContentType !== "video/mp4") { body?.destroy?.(); return failure(503); }
      const buffers: Buffer[] = []; let count = 0;
      try {
        for await (const packet of body) {
          signal.throwIfAborted(); count += packet.byteLength;
          if (count > 1_750_000) return failure(503);
          buffers.push(Buffer.from(packet));
        }
      } finally { body.destroy?.(); }
      if (count !== end - plan.start + 1) return failure(503);
      const complete = !incomingRange && end === total - 1;
      return { statusCode: complete ? 200 : 206,
        headers: { ...baseHeaders, "Content-Length": String(count),
          ...(!complete ? { "Content-Range": `bytes ${plan.start}-${end}/${total}` } : {}) },
        body: Buffer.concat(buffers).toString("base64"), isBase64Encoded: true };
    }
    const result = await client.send(method === "HEAD" ? new HeadObjectCommand({ Bucket: bucket, Key: key }) : new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
    const expectedType = "image/webp";
    const maxBytes = 1_750_000;
    const stream = "Body" in result ? result.Body as AsyncIterable<Uint8Array> & { destroy?: () => void } : undefined;
    if (!result.ContentLength || result.ContentLength > maxBytes || result.ContentType !== expectedType) {
      stream?.destroy?.(); return failure(404);
    }
    // No shared-cache response until a real hot-cache signature/expiry test
    // has passed. The CDN itself must check tokens even on a cache HIT.
    const verifiedSharedCache = process.env.FEED_CDN_EDGE_CACHE_HIT_VERIFIED === "true" &&
      process.env.FEED_CDN_EDGE_TOKEN_VERIFIED === "true";
    const outHeaders = { ...headers,
      ...(verifiedSharedCache ? { "Cache-Control": "public, max-age=600" } : {}),
      "Content-Type": expectedType, "Content-Length": String(result.ContentLength), "Accept-Ranges": "bytes" };
    if (method === "HEAD") return { statusCode: 200, headers: outHeaders, body: "" };
    if (!stream) return failure(404);
    const chunks: Buffer[] = []; let size = 0;
    try {
      for await (const packet of stream) {
        signal.throwIfAborted(); size += packet.byteLength;
        if (size > maxBytes) return failure(404);
        chunks.push(Buffer.from(packet));
      }
      if (size !== result.ContentLength) return failure(404);
      const bytes = Buffer.concat(chunks);
      const range = Object.entries(event.headers ?? {}).find(([name]) => name.toLowerCase() === "range")?.[1];
      if (range !== undefined) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const invalid = () => ({ statusCode: 416, headers: { ...headers, "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" }, body: "" });
        if (!match || (!match[1] && !match[2])) return invalid();
        const first = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
        const last = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
        if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) ||
            (!match[1] && (!Number.isSafeInteger(Number(match[2])) || Number(match[2]) <= 0)) || first >= size || last < first) return invalid();
        return { statusCode: 206, headers: { ...outHeaders, "Content-Range": `bytes ${first}-${last}/${size}`, "Content-Length": String(last - first + 1) },
          body: bytes.subarray(first, last + 1).toString("base64"), isBase64Encoded: true };
      }
      return { statusCode: 200, headers: outHeaders, body: bytes.toString("base64"), isBase64Encoded: true };
    } finally { stream.destroy?.(); }
  } catch (error) {
    // Do not disguise S3 timeouts/5xx as missing media: CDN can cache 404s.
    // Path validation errors and genuinely absent private objects remain 404.
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if ((error instanceof Error && error.message.startsWith("UNTRUSTED_FEED_")) ||
        status === 404 || (error as Error)?.name === "NoSuchKey" ||
        (error as Error)?.name === "NotFound") return failure(404);
    // Never log private object keys, secrets, signed URLs or raw SDK errors.
    console.error("FEED_ORIGIN_READ_FAILED", { status: status ?? "transport" });
    return failure(503);
  }
}
