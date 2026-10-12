import { GalleryError, createCurrentGalleryService, galleryParse, galleryListSchema, galleryIdSchema,
  galleryAlbumCreateSchema, galleryAlbumUpdateSchema, galleryAlbumPhotosSchema,
  galleryProfileAlbumsSchema,
  galleryPhotoUpdateSchema, galleryUploadSchema, galleryUploadRetrySchema, galleryCoverSchema,
  galleryMoveSchema, galleryClaimUploadSchema, galleryCompleteUploadSchema, galleryFailUploadSchema,
  galleryClaimStorageJobsSchema, galleryCompleteStorageJobSchema, galleryFailStorageJobSchema,
} from "@gafus/core/services/gallery";
import type { GalleryService } from "@gafus/core/services/gallery";
import { connection as redis } from "@gafus/queues";
import { createGalleryStorageFromEnv, signGalleryCloudruFallback } from "@gafus/gallery-storage";
import { INTERNAL_GALLERY_PATHS, createGalleryRequestVerifier } from "@gafus/gallery-storage/hmac";
import type { GalleryInternalPath, NonceStore } from "@gafus/gallery-storage/hmac";

const service = createCurrentGalleryService(createGalleryStorageFromEnv());
const MAX_BODY_BYTES = 16_384;
const allowedMethods = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);

export interface GalleryHttpError {
  status: number;
  body: { success: false; error: string; code: string; details?: Record<string, unknown> };
}

export function galleryHttpError(error: unknown): GalleryHttpError {
  if (error instanceof GalleryError) return {
    status: error.status,
    body: { success: false, error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) },
  };
  return { status: 500, body: { success: false, error: "Не удалось выполнить запрос галереи", code: "INTERNAL_ERROR" } };
}

async function readLimitedBytes(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new GalleryError("BODY_TOO_LARGE", "Запрос слишком большой", 413);
      }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function readPublicJsonBody(request: Request): Promise<unknown> {
  const bytes = await readLimitedBytes(request);
  const contentType = request.headers.get("content-type");
  if (contentType && contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json")
    throw new GalleryError("UNSUPPORTED_MEDIA_TYPE", "Поддерживается только JSON", 415);
  if (bytes.byteLength > 0 && !contentType)
    throw new GalleryError("UNSUPPORTED_MEDIA_TYPE", "Поддерживается только JSON", 415);
  let raw: string;
  try { raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new GalleryError("VALIDATION", "Некорректный текст запроса", 400); }
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw new GalleryError("VALIDATION", "Некорректный JSON", 400); }
}

function assertEmptyCommandBody(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 0)
    throw new GalleryError("VALIDATION", "Тело запроса должно быть пустым объектом", 400);
}

function decodeParts(path: string): string[] {
  if (path.length > 2048 || path.includes("\\")) throw new GalleryError("NOT_FOUND", "Маршрут не найден", 404);
  try { return path.split("/").filter(Boolean).map((part) => decodeURIComponent(part)); }
  catch { throw new GalleryError("NOT_FOUND", "Маршрут не найден", 404); }
}

function listQuery(url: URL) {
  const entries = [...url.searchParams.entries()];
  if (entries.some(([key]) => !["cursor", "pageSize"].includes(key)) || entries.some(([key], i) => entries.findIndex(([candidate]) => candidate === key) !== i))
    throw new GalleryError("VALIDATION", "Некорректные параметры списка", 400);
  const cursor = url.searchParams.get("cursor");
  const rawSize = url.searchParams.get("pageSize");
  if (rawSize !== null && !/^[1-9]\d{0,2}$/.test(rawSize)) throw new GalleryError("VALIDATION", "Некорректный размер страницы", 400);
  return galleryParse(galleryListSchema, { ...(cursor !== null ? { cursor } : {}), ...(rawSize !== null ? { pageSize: Number(rawSize) } : {}) });
}

function isKnownGalleryPath(parts: string[]): boolean {
  return (parts.length === 3 && parts[0] === "profiles" && parts[2] === "albums") ||
    (parts.length === 1 && parts[0] === "albums") ||
    (parts.length === 2 && ["albums", "uploads", "photos"].includes(parts[0])) ||
    (parts.length === 3 && ((parts[0] === "albums" && ["photos", "uploads", "cover"].includes(parts[2])) ||
      (parts[0] === "uploads" && ["complete", "retry"].includes(parts[2])) ||
      (parts[0] === "photos" && parts[2] === "move")));
}

/** Shared request-to-core adapter. Only bounded JSON and parsed values cross into core. */
export async function dispatchGalleryRequest(actorId: string, request: Request, path: string, gallery: GalleryService = service): Promise<unknown> {
  const method = request.method.toUpperCase();
  if (!allowedMethods.has(method)) throw new GalleryError("METHOD_NOT_ALLOWED", "Метод не поддерживается", 405);
  const parts = decodeParts(path);
  const url = new URL(request.url);
  const bodyValue = method === "GET" ? undefined : await readPublicJsonBody(request);
  const body = async (): Promise<unknown> => bodyValue;
  if (parts.length === 3 && parts[0] === "profiles" && parts[2] === "albums" && method === "GET") {
    const query = listQuery(url);
    return gallery.listAlbums(actorId, galleryParse(galleryProfileAlbumsSchema, { ...query, username: parts[1] }));
  }
  if (parts.length === 1 && parts[0] === "albums" && method === "POST") return gallery.createAlbum(actorId, galleryParse(galleryAlbumCreateSchema, await body()));
  if (parts.length === 2 && parts[0] === "albums") {
    const albumId = galleryParse(galleryIdSchema, parts[1]);
    if (method === "GET") return gallery.getAlbum(actorId, albumId);
    if (method === "PATCH") return gallery.updateAlbum(actorId, albumId, galleryParse(galleryAlbumUpdateSchema, await body()));
    if (method === "DELETE") { assertEmptyCommandBody(bodyValue); return gallery.deleteAlbum(actorId, albumId); }
  }
  if (parts.length === 3 && parts[0] === "albums" && parts[2] === "photos" && method === "GET") {
    const albumId = galleryParse(galleryIdSchema, parts[1]);
    return gallery.listPhotos(actorId, galleryParse(galleryAlbumPhotosSchema, { ...listQuery(url), albumId }));
  }
  if ((parts.length === 1 && parts[0] === "uploads") || (parts.length === 3 && parts[0] === "albums" && parts[2] === "uploads")) {
    if (method === "POST") {
      const input = galleryParse(galleryUploadSchema, await body());
      if (parts[0] === "albums" && input.albumId && input.albumId !== parts[1]) throw new GalleryError("VALIDATION", "Альбом в пути и запросе не совпадает", 400);
      return gallery.reserveUpload(actorId, parts[0] === "albums" ? { ...input, albumId: parts[1] } : input);
    }
  }
  if (parts.length >= 2 && parts[0] === "uploads") {
    const uploadId = galleryParse(galleryIdSchema, parts[1]);
    if (parts.length === 2 && method === "GET") return gallery.getUpload(actorId, uploadId);
    if (parts.length === 2 && method === "DELETE") { assertEmptyCommandBody(bodyValue); return gallery.cancelUpload(actorId, uploadId); }
    if (parts.length === 3 && parts[2] === "complete" && method === "POST") { assertEmptyCommandBody(bodyValue); return gallery.confirmUpload(actorId, uploadId); }
    if (parts.length === 3 && parts[2] === "retry" && method === "POST") return gallery.retryUpload(actorId, uploadId, galleryParse(galleryUploadRetrySchema, await body()));
  }
  if (parts.length >= 2 && parts[0] === "photos") {
    const photoId = galleryParse(galleryIdSchema, parts[1]);
    if (parts.length === 3 && parts[2] === "fallback" && method === "POST") {
      if (url.search || process.env.GALLERY_MEDIA_FALLBACK_ENABLED !== "true")
        throw new GalleryError("NOT_FOUND", "Маршрут не найден", 404);
      if (!bodyValue || typeof bodyValue !== "object" || Array.isArray(bodyValue) ||
          Object.keys(bodyValue).length !== 1 || !("variant" in bodyValue) ||
          !["thumb", "full"].includes(String(bodyValue.variant)))
        throw new GalleryError("VALIDATION", "Недопустимый вариант файла", 400);
      const { key } = await gallery.fallbackSource(actorId, photoId, bodyValue.variant as "thumb" | "full");
      const fallbackUrl = await signGalleryCloudruFallback(key);
      return { url: fallbackUrl, source: "cloudru", expiresAt: new Date(Date.now() + 120_000).toISOString() };
    }
    if (parts.length === 2 && method === "GET") return gallery.getPhoto(actorId, photoId);
    if (parts.length === 2 && method === "PATCH") return gallery.updatePhoto(actorId, photoId, galleryParse(galleryPhotoUpdateSchema, await body()));
    if (parts.length === 2 && method === "DELETE") { assertEmptyCommandBody(bodyValue); return gallery.deletePhoto(actorId, photoId); }
    if (parts.length === 3 && parts[2] === "move" && method === "POST") return gallery.movePhoto(actorId, photoId, galleryParse(galleryMoveSchema, await body()));
  }
  if (parts.length === 3 && parts[0] === "albums" && parts[2] === "cover" && method === "PUT") {
    return gallery.setCover(actorId, galleryParse(galleryIdSchema, parts[1]), galleryParse(galleryCoverSchema, await body()));
  }
  if (isKnownGalleryPath(parts)) throw new GalleryError("METHOD_NOT_ALLOWED", "Метод не поддерживается для этого маршрута", 405);
  throw new GalleryError("NOT_FOUND", "Маршрут не найден", 404);
}

// Queue connections intentionally wait indefinitely; HTTP authentication must not.
// Absolute expiry also prevents a delayed Redis command from extending nonce lifetime.
const redisNonceStore: NonceStore = {
  async consume(nonce, expiresAt) {
    if (expiresAt <= Date.now()) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          if (redis.status !== "ready") throw new Error("NONCE_STORE_UNAVAILABLE");
          const result = await redis.set(`gafus-gallery-nonce:${nonce}`, "1", "PXAT", expiresAt, "NX");
          return result === "OK";
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("NONCE_STORE_UNAVAILABLE")), 1000);
        }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  },
};

function internalVerifier(secret = process.env.GALLERY_INTERNAL_HMAC_SECRET ?? "") {
  return createGalleryRequestVerifier({ secret, nonces: redisNonceStore });
}

export async function dispatchGalleryInternalRequest(request: Request, path: string, gallery: GalleryService = service): Promise<unknown> {
  const method = request.method.toUpperCase();
  if (method !== "POST" || !(INTERNAL_GALLERY_PATHS as readonly string[]).includes(path))
    throw new GalleryError(method !== "POST" ? "METHOD_NOT_ALLOWED" : "NOT_FOUND", method !== "POST" ? "Метод не поддерживается" : "Маршрут не найден", method !== "POST" ? 405 : 404);
  const url = new URL(request.url);
  if (url.pathname !== path || url.search)
    throw new GalleryError("NOT_FOUND", "Маршрут не найден", 404);
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES)
    throw new GalleryError("BODY_TOO_LARGE", "Запрос слишком большой", 413);
  const rawBytes = await readLimitedBytes(request);
  let raw: string;
  try { raw = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes); }
  catch { throw new GalleryError("VALIDATION", "Некорректный текст запроса", 400); }
  if (!process.env.GALLERY_INTERNAL_HMAC_SECRET) throw new GalleryError("INTERNAL_UNAVAILABLE", "Запрос не принят", 503);
  let valid: boolean;
  try {
    valid = await internalVerifier()({
      method,
      path,
      body: rawBytes,
      headers: {
        "x-gallery-timestamp": request.headers.get("x-gallery-timestamp") ?? undefined,
        "x-gallery-nonce": request.headers.get("x-gallery-nonce") ?? undefined,
        "x-gallery-signature": request.headers.get("x-gallery-signature") ?? undefined,
      },
    });
  } catch {
    // Missing Redis or invalid server configuration must fail closed without exposing details.
    throw new GalleryError("INTERNAL_UNAVAILABLE", "Запрос не принят", 503);
  }
  if (!valid) throw new GalleryError("UNAUTHORIZED", "Запрос не авторизован", 401);
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json")
    throw new GalleryError("UNSUPPORTED_MEDIA_TYPE", "Поддерживается только JSON", 415);
  let json: unknown;
  try { json = raw ? JSON.parse(raw) : {}; }
  catch { throw new GalleryError("VALIDATION", "Некорректный JSON", 400); }
  switch (path as GalleryInternalPath) {
    case "/internal/gallery/uploads/claim": return gallery.claimUpload(galleryParse(galleryClaimUploadSchema, json));
    case "/internal/gallery/uploads/complete": return gallery.completeUpload(galleryParse(galleryCompleteUploadSchema, json));
    case "/internal/gallery/uploads/fail": return gallery.failUpload(galleryParse(galleryFailUploadSchema, json));
    case "/internal/gallery/jobs/claim": return gallery.claimStorageJobs(galleryParse(galleryClaimStorageJobsSchema.extend({ uploadId: galleryIdSchema.optional() }), json));
    case "/internal/gallery/jobs/complete": return gallery.completeStorageJob(galleryParse(galleryCompleteStorageJobSchema, json));
    case "/internal/gallery/jobs/fail": return gallery.failStorageJob(galleryParse(galleryFailStorageJobSchema, json));
    case "/internal/gallery/maintenance": return gallery.maintenance(galleryParse(galleryClaimStorageJobsSchema, json));
  }
}

export { MAX_BODY_BYTES as GALLERY_MAX_BODY_BYTES };
