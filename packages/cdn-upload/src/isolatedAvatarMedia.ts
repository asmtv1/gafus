/** Strictly local, default-off avatar media; never supplies a production provider. */
import {
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand,
  PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isolatedNonprodS3Config } from "./isolatedNonprodS3";

const marker = "isodev-avatar:";
// The original PET photo path is users/{owner}/pets/{pet}/{uuid}.{ext}.
// The same private isolated bucket serves the existing user avatar path.
// Neither path can contain arbitrary folders, traversal or unsigned names.
const userMediaPath = String.raw`users/[A-Za-z0-9_-]{1,128}/(?:avatar|pets/[A-Za-z0-9_-]{1,128})/[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp|gif)`;
const relativeFormat = new RegExp(`^${userMediaPath}$`);
const keyFormat = new RegExp(`^documents/uploads/${userMediaPath}$`);
const mimetypes = new Map([
  ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["png", "image/png"],
  ["webp", "image/webp"], ["gif", "image/gif"],
]);

export function isIsolatedAvatarPath(path: string): boolean {
  return relativeFormat.test(path);
}
export function isIsolatedAvatarLocation(location: string): boolean {
  return location.startsWith(marker);
}
function keyFromLocation(location: string): string {
  const key = location.startsWith(marker) ? location.slice(marker.length) : "";
  if (!keyFormat.test(key)) throw new Error("ISOLATED_AVATAR_INVALID_LOCATION");
  return key;
}
function storage() {
  // This adapter may only run on the specifically configured project-local
  // development MinIO; production paths must NEVER use this alternative.
  const cfg = isolatedNonprodS3Config("documents");
  if (!cfg) throw new Error("ISOLATED_AVATAR_PROVIDER_DENIED");
  return {
    bucket: cfg.bucket,
    client: new S3Client({
      endpoint: cfg.endpoint, region: "us-east-1", forcePathStyle: true,
      credentials: {accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey},
      maxAttempts: 1, requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
}

export async function uploadIsolatedAvatar(file: File, path: string): Promise<string> {
  if (!relativeFormat.test(path)) throw new Error("ISOLATED_AVATAR_INVALID_KEY");
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("ISOLATED_AVATAR_INVALID_SIZE");
  const ext = path.slice(path.lastIndexOf(".") + 1);
  if (mimetypes.get(ext) !== file.type) throw new Error("ISOLATED_AVATAR_INVALID_MIME");
  const key = "documents/uploads/" + path;
  const {bucket,client} = storage();
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: new Uint8Array(await file.arrayBuffer()),
      ContentType: file.type, ContentLength: file.size, IfNoneMatch: "*",
      CacheControl: "private, no-store",
    }), {abortSignal: AbortSignal.timeout(30000)});
    return marker + key;
  } finally {client.destroy();}
}

/** Public avatars are public *content*, but the dev bucket is private:
 * short-lived signed URLs are only generated at the profile read boundary.
 * The signed URL must never be stored in WORK SQL or logged.
 */
export async function presentIsolatedAvatarUrl(
  stored: string | null, ttlSeconds = 600,
): Promise<string | null> {
  if (!stored || !isIsolatedAvatarLocation(stored)) return stored;
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600)
    throw new Error("ISOLATED_AVATAR_INVALID_SIGN_TTL");
  const key = keyFromLocation(stored);
  const {bucket,client} = storage();
  try {
    return await getSignedUrl(client, new GetObjectCommand({
      Bucket: bucket, Key: key, ResponseCacheControl: "private, no-store",
      ResponseContentDisposition: "inline",
    }), {expiresIn: ttlSeconds});
  } finally {client.destroy();}
}

export async function deleteIsolatedAvatarLocation(location: string): Promise<void> {
  const key = keyFromLocation(location);
  const {bucket,client} = storage();
  try {
    await client.send(new DeleteObjectCommand({Bucket: bucket, Key: key}),
      {abortSignal: AbortSignal.timeout(30000)});
    try {
      await client.send(new HeadObjectCommand({Bucket: bucket, Key: key}),
        {abortSignal: AbortSignal.timeout(10000)});
    } catch (error) {
      const status = (error as {$metadata?:{httpStatusCode?:number}})
        .$metadata?.httpStatusCode;
      if (status === 404) return;
      throw error;
    }
    throw new Error("ISOLATED_AVATAR_DELETE_NOT_CONFIRMED");
  } finally {client.destroy();}
}

/** Compensation deletion for a just-uploaded *own* key before DB commit. */
export function isolatedAvatarLocationFromOwnPath(path: string): string {
  if (!isIsolatedAvatarPath(path)) throw new Error("ISOLATED_AVATAR_INVALID_KEY");
  return marker + "documents/uploads/" + path;
}
