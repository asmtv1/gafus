import { createHash, timingSafeEqual } from "node:crypto";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { feedOriginKey } from "@gafus/feed-storage";
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
    // Unsigned playlists and incoming sources can never be served by the origin.
    if (!key.endsWith(".ts") && !key.endsWith(".webp")) return failure(404);
    const bucket = process.env.FEED_BUCKET ?? "";
    if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(bucket) || /^(gafus-media|gafus-public)$/.test(bucket)) return failure(503);
    client ??= new S3Client({ endpoint: "https://storage.yandexcloud.net", region: "ru-central1", forcePathStyle: true,
      credentials: { accessKeyId: process.env.FEED_S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.FEED_S3_SECRET_ACCESS_KEY ?? "" },
      maxAttempts: 1, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
    const signal = AbortSignal.timeout(3500);
    const result = await client.send(method === "HEAD" ? new HeadObjectCommand({ Bucket: bucket, Key: key }) : new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
    const expectedType = key.endsWith(".ts") ? "video/mp2t" : "image/webp";
    const stream = "Body" in result ? result.Body as AsyncIterable<Uint8Array> & { destroy?: () => void } : undefined;
    if (!result.ContentLength || result.ContentLength > 1_750_000 || result.ContentType !== expectedType) {
      stream?.destroy?.(); return failure(404);
    }
    const outHeaders = { ...headers, "Content-Type": expectedType, "Content-Length": String(result.ContentLength), "Accept-Ranges": "bytes" };
    if (method === "HEAD") return { statusCode: 200, headers: outHeaders, body: "" };
    if (!stream) return failure(404);
    const chunks: Buffer[] = []; let size = 0;
    try {
      for await (const packet of stream) {
        signal.throwIfAborted(); size += packet.byteLength;
        if (size > 1_750_000) return failure(404);
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
  } catch { return failure(404); }
}
