import { createGalleryObjectStore } from "@gafus/gallery-storage/objects";
import { createGalleryOrigin } from "./origin-handler.js";
import { createOriginHttpServer } from "./origin-http.js";

// An authenticated origin cannot protect CDN cache hits by itself.
if (process.env.GALLERY_CDN_EDGE_TOKEN_VERIFIED !== "true")
  throw new Error("GALLERY_CDN_EDGE_TOKEN_NOT_VERIFIED");
if (!/^[A-Za-z0-9_-]{24,32}$/.test(process.env.GALLERY_CDN_SECRET ?? ""))
  throw new Error("GALLERY_CDN_SECRET_REQUIRED");
const handler = createGalleryOrigin({
  objects: createGalleryObjectStore({
    bucket: process.env.GALLERY_BUCKET ?? "",
    endpoint: process.env.GALLERY_S3_ENDPOINT ?? "https://storage.yandexcloud.net",
    accessKeyId: process.env.GALLERY_S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.GALLERY_S3_SECRET_ACCESS_KEY ?? "",
  }),
  secret: process.env.GALLERY_ORIGIN_SECRET ?? "",
  // Default fail-closed no-store. Only allow cacheable 200/206 when signed
  // Yandex CDN cache-HIT authorization is verified with source removed.
  verifiedSharedCache: process.env.GALLERY_CDN_EDGE_CACHE_HIT_VERIFIED === "true",
  // Yandex CDN may omit viewer query parameters on origin requests when they
  // are excluded from the cache key. The edge (not the origin) MUST reject
  // expired/invalid signed URLs even on cache HIT before this can be enabled.
  // Enable a second origin query check ONLY when CDN forwards the entire query.
  cdnSecret: process.env.GALLERY_ORIGIN_REQUIRE_SIGNED_QUERY === "true"
    ? process.env.GALLERY_CDN_SECRET ?? "" : undefined,
});
const port = Number(process.env.PORT ?? "8080");
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("INVALID_PORT");
const server = createOriginHttpServer(handler);
server.listen(port, "0.0.0.0");
process.on("SIGTERM", () => server.close());
