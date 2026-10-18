import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const safeId = /^[A-Za-z0-9_-]{1,128}$/;
const keyPattern =
  /^users\/[A-Za-z0-9_-]{1,128}\/pets\/[A-Za-z0-9_-]{1,128}\/vet-visits\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/(original\.(jpg|png|webp|pdf)|thumb\.webp)$/;

function storage() {
  const bucket = process.env.GALLERY_BUCKET ?? "";
  const accessKeyId = process.env.GALLERY_S3_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.GALLERY_S3_SECRET_ACCESS_KEY ?? "";
  const endpoint = process.env.GALLERY_S3_ENDPOINT ?? "https://s3.cloud.ru";
  if (endpoint === "https://s3.cloud.ru" && process.env.GALLERY_CDN_EDGE_TOKEN_VERIFIED !== "true")
    throw new Error("PRIVATE_VET_CDN_EDGE_UNVERIFIED");
  const base = process.env.GALLERY_CDN_BASE_URL ?? "";
  const secret = (process.env.GALLERY_CDN_REDIRECT_ENABLED === "true"
    ? process.env.GALLERY_CDN_REDIRECT_SIGNING_SECRET : process.env.GALLERY_CDN_SECRET) ?? "";
  // Never fall back to the public uploads bucket, including when the gallery product is disabled.
  if (
    !/^[a-z0-9][a-z0-9.-]{2,62}$/.test(bucket) ||
    /^(gafus-media|gafus-public)$/.test(bucket) ||
    !accessKeyId ||
    !secretAccessKey ||
    process.env.GALLERY_BUCKET_PUBLIC === "true" ||
    endpoint !== "https://s3.cloud.ru" ||
    bucket !== "gafus-gallery-private" ||
    !/^[A-Za-z0-9_-]{24,128}$/.test(secret)
  )
    throw new Error("PRIVATE_VET_STORAGE_UNAVAILABLE");
  const url = new URL(base);
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    url.hostname !== (process.env.GALLERY_CDN_REDIRECT_ENABLED === "true"
      ? "dikinuneceswe.begetcdn.cloud" : "mepsuduyokabib.begetcdn.cloud")
  )
    throw new Error("PRIVATE_VET_STORAGE_UNAVAILABLE");
  return {
    bucket,
    base: url.origin,
    secret,
    endpoint,
    client: new S3Client({
      endpoint,
      region: "ru-central-1",
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 2,
    }),
  };
}

export function vetVisitFileKeys(
  ownerId: string,
  petId: string,
  visitId: string,
  attachmentId: string,
  mime: string,
) {
  if (![ownerId, petId, visitId, attachmentId].every((id) => safeId.test(id)))
    throw new Error("INVALID_VET_KEY");
  const extension = (
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "application/pdf": "pdf",
    } as Record<string, string>
  )[mime];
  if (!extension) throw new Error("INVALID_VET_MIME");
  const prefix = `users/${ownerId}/pets/${petId}/vet-visits/${visitId}/${attachmentId}`;
  return {
    originalKey: `${prefix}/original.${extension}`,
    previewKey: mime === "application/pdf" ? null : `${prefix}/thumb.webp`,
  };
}

export async function uploadVetVisitFile(
  bytes: Uint8Array,
  mime: string,
  keys: { originalKey: string; previewKey: string | null },
  options: { asyncPreview?: boolean } = {},
) {
  if (
    !bytes.byteLength ||
    bytes.byteLength > 10 * 1024 * 1024 ||
    !keyPattern.test(keys.originalKey) ||
    (keys.previewKey && !keyPattern.test(keys.previewKey))
  )
    throw new Error("INVALID_VET_UPLOAD");
  const config = storage();
  let preview: Buffer | null = null;
  if (keys.previewKey && !options.asyncPreview) {
    const { default: sharp } = await import("sharp");
    preview = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate()
      .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  }
  const put = (key: string, body: Uint8Array, contentType: string) =>
    config.client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: key === keys.previewKey && process.env.GALLERY_CDN_CACHEABLE_FINAL_ENABLED === "true"
          && process.env.GALLERY_CDN_EDGE_TOKEN_VERIFIED === "true"
          ? "public, max-age=180, s-maxage=600, must-revalidate" : "private, no-store",
        ContentMD5: createHash("md5").update(body).digest("base64"),
        ...(config.endpoint === "https://s3.cloud.ru" ? { IfNoneMatch: "*" } : {}),
      }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
  const originalETag = `"${createHash("md5").update(bytes).digest("hex")}"`;
  await put(keys.originalKey, bytes, mime);
  if (preview && keys.previewKey) await put(keys.previewKey, preview, "image/webp");
  return { originalETag };
}

export async function vetVisitMediaUrl(key: string, downloadName?: string) {
  if (!keyPattern.test(key)) throw new Error("INVALID_VET_KEY");
  const config = storage();
  if (key.endsWith("/thumb.webp")) {
    // These private veterinary thumbnails share the Gallery CDN. Their originals
    // remain short-lived direct Cloud.ru downloads and never traverse Beget.
    const expires = Math.floor((Date.now() + 300_000) / 30_000) * 30;
    const path = `/${key}`;
    if (process.env.GALLERY_CDN_PROVIDER !== undefined && process.env.GALLERY_CDN_PROVIDER !== "beget")
      throw new Error("PRIVATE_VET_CDN_PROVIDER_INVALID");
    const token = createHash("md5")
      .update(`${config.secret}${path}${expires}`)
      .digest("base64url");
    return `${config.base}/md5(${token},${expires})${path}`;
  }
  // Originals bypass the function response size limit; private Object Storage signs the download.
  const disposition = downloadName
    ? `attachment; filename="medical-record.${key.split(".").pop()}"; filename*=UTF-8''${encodeURIComponent(downloadName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`
    : "inline";
  return getSignedUrl(
    config.client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ResponseCacheControl: "private, no-store",
      ResponseContentDisposition: disposition,
    }),
    { expiresIn: 60 },
  );
}
