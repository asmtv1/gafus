/** Only isolated GAFUS Refactor private test storage is enabled for Chat 2.0.
 * No implicit Cloud.ru fallback or production bucket configuration. */
import { randomUUID } from "node:crypto";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isolatedNonprodS3Config } from "./isolatedNonprodS3";

const keyPattern =
  /^chat2\/[a-zA-Z0-9_-]{1,128}\/[a-zA-Z0-9_-]{1,128}\/[a-f0-9-]{36}\.(?:jpg|png|webp|pdf|mp4)$/;
const safeSegment = /^[a-zA-Z0-9_-]{1,128}$/;
function storage() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
    process.env.CHAT2_PRIVATE_MEDIA_ENABLED !== "isolated-dev-only"
  )
    throw new Error("CHAT2_MEDIA_RESTRICTED_TO_REFRACTOR_DEV");
  const config = isolatedNonprodS3Config("documents");
  if (!config) throw new Error("CHAT2_MEDIA_ISOLATED_BUCKET_REQUIRED");
  return {
    bucket: config.bucket,
    client: new S3Client({
      endpoint: config.endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      maxAttempts: 2,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
}
function strictKey(key: string) {
  if (!keyPattern.test(key)) throw new Error("CHAT2_INVALID_MEDIA_KEY");
  return key;
}
export function chat2SniffMime(
  body: Uint8Array,
): { mime: string; kind: string; ext: string } | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff)
    return { mime: "image/jpeg", kind: "image", ext: "jpg" };
  if (body.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => body[i] === b))
    return { mime: "image/png", kind: "image", ext: "png" };
  if (
    body.length >= 12 &&
    String.fromCharCode(...body.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...body.slice(8, 12)) === "WEBP"
  )
    return { mime: "image/webp", kind: "image", ext: "webp" };
  // Progressive MP4 only: do not silently accept MOV, WebM or arbitrary files.
  if (body.length >= 12 && String.fromCharCode(...body.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...body.slice(8, 12));
    if (/^(isom|iso2|iso6|mp41|mp42|avc1|M4V )$/.test(brand))
      return { mime: "video/mp4", kind: "video", ext: "mp4" };
  }
  if (body.length >= 5 && String.fromCharCode(...body.slice(0, 5)) === "%PDF-")
    return { mime: "application/pdf", kind: "file", ext: "pdf" };
  return null;
}
function validatedPrivateUpload(
  conversationId: string,
  ownerId: string,
  bytes: Uint8Array,
  mime: string,
) {
  if (
    !safeSegment.test(conversationId) ||
    !safeSegment.test(ownerId) ||
    bytes.length < 10
  )
    throw new Error("CHAT2_INVALID_UPLOAD");
  const detected = chat2SniffMime(bytes);
  if (!detected || mime !== detected.mime) throw new Error("CHAT2_INVALID_CONTENT_TYPE");
  const maxBytes = detected.kind === "video" ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
  if (bytes.length > maxBytes) throw new Error("CHAT2_INVALID_UPLOAD");
  return detected;
}
/** Generates an exact, immutable object locator before any network PUT.
 * Caller must durably reserve the key before uploading an object.
 */
export function chat2ReservePrivateObjectKey(
  conversationId: string,
  ownerId: string,
  bytes: Uint8Array,
  mime: string,
) {
  const detected = validatedPrivateUpload(conversationId, ownerId, bytes, mime);
  return strictKey(`chat2/${conversationId}/${ownerId}/${randomUUID()}.${detected.ext}`);
}
export async function chat2UploadPrivateImageOrPdf(
  conversationId: string,
  ownerId: string,
  bytes: Uint8Array,
  mime: string,
  reservedKey?: string,
) {
  const detected = validatedPrivateUpload(conversationId, ownerId, bytes, mime);
  const key = strictKey(
    reservedKey ?? `chat2/${conversationId}/${ownerId}/${randomUUID()}.${detected.ext}`,
  );
  if (!key.startsWith(`chat2/${conversationId}/${ownerId}/`) || !key.endsWith(`.${detected.ext}`))
    throw new Error("CHAT2_INVALID_RESERVED_KEY");
  const { client, bucket } = storage();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.byteLength,
        ContentType: detected.mime,
        CacheControl: "private, no-store",
        IfNoneMatch: "*",
      }),
      { abortSignal: AbortSignal.timeout(detected.kind === "video" ? 180_000 : 60_000) },
    );
  } finally {
    client.destroy();
  }
  return { objectKey: key, kind: detected.kind, mime: detected.mime, bytes: bytes.byteLength };
}
export async function chat2SignedPrivateMedia(key: string, ttlSeconds = 60) {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 15 || ttlSeconds > 900)
    throw new Error("CHAT2_INVALID_TTL");
  const { client, bucket } = storage();
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: strictKey(key),
        ResponseCacheControl: "private, no-store",
        ResponseContentDisposition: "inline",
      }),
      { expiresIn: ttlSeconds },
    );
  } finally {
    client.destroy();
  }
}
export async function chat2DeletePrivateMedia(key: string) {
  const { client, bucket } = storage();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: strictKey(key) }), {
      abortSignal: AbortSignal.timeout(30_000),
    });
  } finally {
    client.destroy();
  }
}
