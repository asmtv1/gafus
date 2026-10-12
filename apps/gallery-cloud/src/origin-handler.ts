import { GALLERY_IMAGE_MAX_OUTPUT_BYTES } from "@gafus/core/services/gallery/imageProcessing";
import { constantTimeEqual, verifyGalleryCdnToken } from "@gafus/gallery-storage/cdn";
import { originKey } from "@gafus/gallery-storage/keys";
import type { GalleryObjectStore } from "@gafus/gallery-storage/objects";
export interface OriginEvent {
  httpMethod?: string;
  path?: string;
  url?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
}
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};
export function createGalleryOrigin(input: {
  objects: GalleryObjectStore;
  secret: string;
  cdnSecret?: string;
  // Enabled only after CDN enforces signatures on a proved hot cache.
  verifiedSharedCache?: boolean;
  now?: () => number;
}) {
  if (Buffer.byteLength(input.secret) < 32) throw new Error("INVALID_ORIGIN_SECRET");
  const successHeaders = input.verifiedSharedCache
    ? { ...headers, "Cache-Control": "public, max-age=600" }
    : headers;
  return async (event: OriginEvent) => {
    const reject = (statusCode: number) => ({
      statusCode,
      headers,
      body: "",
      isBase64Encoded: false,
    });
    const requestHeaders = Object.fromEntries(
      Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    if (!constantTimeEqual(requestHeaders["x-gallery-origin-secret"] ?? "", input.secret))
      return reject(403);
    if (event.httpMethod !== "GET" && event.httpMethod !== "HEAD") return reject(405);
    let key: string;
    try {
      // API Gateway preserves raw path in url; forbid encoded characters before normalisation.
      const raw = event.url?.split("?")[0] ?? event.path ?? "";
      key = originKey(raw);
      if (event.path && event.path !== `/${key}`) return reject(400);
    } catch {
      return reject(400);
    }
    if (
      input.cdnSecret &&
      !verifyGalleryCdnToken(
        `/${key}`,
        event.queryStringParameters ?? {},
        input.cdnSecret,
        (input.now ?? Date.now)(),
      )
    )
      return reject(403);
    try {
      const signal = AbortSignal.timeout(3500);
      // Single GET on miss avoids a HEAD + GET round trip and bounds CDN's 5s gate.
      if (event.httpMethod === "HEAD") {
        const meta = await input.objects.head(key, signal);
        if (!meta || meta.contentType !== "image/webp") return reject(404);
        if (meta.bytes > GALLERY_IMAGE_MAX_OUTPUT_BYTES) return reject(502);
        return {
          statusCode: 200,
          headers: {
            ...successHeaders,
            "Content-Type": "image/webp",
            "Content-Length": String(meta.bytes),
            "Accept-Ranges": "bytes",
            ETag: meta.etag,
          },
          body: "",
          isBase64Encoded: false,
        };
      }
      const out = await input.objects.read(key, undefined, signal, GALLERY_IMAGE_MAX_OUTPUT_BYTES);
      if (out.metadata.contentType !== "image/webp") return reject(404);
      if (
        out.metadata.bytes > GALLERY_IMAGE_MAX_OUTPUT_BYTES ||
        out.bytes.byteLength > GALLERY_IMAGE_MAX_OUTPUT_BYTES ||
        out.bytes.byteLength !== out.metadata.bytes
      )
        return reject(502);
      const baseHeaders = {
        ...successHeaders,
        "Content-Type": "image/webp",
        "Accept-Ranges": "bytes",
        ETag: out.metadata.etag,
      };
      const range = requestHeaders.range;
      if (range !== undefined) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const invalid = () => ({
          statusCode: 416,
          headers: { ...headers, "Content-Range": `bytes */${out.bytes.byteLength}` },
          body: "",
          isBase64Encoded: false,
        });
        if (!match || (!match[1] && !match[2])) return invalid();
        const size = out.bytes.byteLength;
        const first = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
        const last = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
        if (
          !Number.isSafeInteger(first) ||
          !Number.isSafeInteger(last) ||
          (!match[1] && (!Number.isSafeInteger(Number(match[2])) || Number(match[2]) <= 0)) ||
          first >= size ||
          last < first
        )
          return invalid();
        return {
          statusCode: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${first}-${last}/${size}`,
            "Content-Length": String(last - first + 1),
          },
          body: Buffer.from(out.bytes.subarray(first, last + 1)).toString("base64"),
          isBase64Encoded: true,
        };
      }
      return {
        statusCode: 200,
        headers: { ...baseHeaders, "Content-Length": String(out.bytes.byteLength) },
        body: Buffer.from(out.bytes).toString("base64"),
        isBase64Encoded: true,
      };
    } catch (error) {
      return reject(
        (error as Error)?.message === "OBJECT_BYTE_LIMIT" ||
          (error as Error)?.message === "IMAGE_SIZE"
          ? 502
          : (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode ===
              404
            ? 404
            : 503,
      );
    }
  };
}
