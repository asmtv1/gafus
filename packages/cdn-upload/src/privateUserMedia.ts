import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type PrivateMediaKind = "questions" | "documents";
const bucketPattern = /^[a-z0-9][a-z0-9.-]{2,62}$/;
const keyPattern =
  /^(?:questions\/uploads\/questions\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_.-]{1,128}\.(?:jpg|jpeg|png|webp)|documents\/uploads\/users\/[A-Za-z0-9_-]{1,128}\/pets\/[A-Za-z0-9_-]{1,128}\/documents\/[A-Za-z0-9_.-]{1,128}\.(?:pdf|jpg|jpeg|png))$/;
const storePrefix = "cloudru:";

export function privateMediaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CLOUDRU_USER_MEDIA_ENABLED && !["true", "false"].includes(env.CLOUDRU_USER_MEDIA_ENABLED))
    throw new Error("PRIVATE_MEDIA_INVALID_FLAG");
  return env.CLOUDRU_USER_MEDIA_ENABLED === "true";
}
export function privateMediaKindForUpload(path: string): PrivateMediaKind | null {
  if (/^questions\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_.-]{1,128}\.(?:jpg|jpeg|png|webp)$/.test(path))
    return "questions";
  if (
    /^users\/[A-Za-z0-9_-]{1,128}\/pets\/[A-Za-z0-9_-]{1,128}\/documents\/[A-Za-z0-9_.-]{1,128}\.(?:pdf|jpg|jpeg|png)$/.test(
      path,
    )
  )
    return "documents";
  return null;
}
export function privateMediaLocation(kind: PrivateMediaKind, relativePath: string): string {
  if (privateMediaKindForUpload(relativePath) !== kind)
    throw new Error("PRIVATE_MEDIA_INVALID_KEY");
  return `${storePrefix}${kind}:${kind}/uploads/${relativePath}`;
}
export function parsePrivateMediaLocation(
  value: string,
): { kind: PrivateMediaKind; key: string } | null {
  // Public Questions have their own explicitly verified provider marker.
  if (value.startsWith("cloudru:questions-public:")) return null;
  if (value.startsWith("cloudru:questions-pending:")) return null;
  if (!value.startsWith(storePrefix)) return null;
  const match = /^cloudru:(questions|documents):(.+)$/.exec(value);
  if (!match || !keyPattern.test(match[2]!) || !match[2]!.startsWith(`${match[1]}/`))
    throw new Error("PRIVATE_MEDIA_INVALID_LOCATION");
  return { kind: match[1] as PrivateMediaKind, key: match[2]! };
}
function privateMediaStorage(kind: PrivateMediaKind, env: NodeJS.ProcessEnv = process.env) {
  const bucket = env[`CLOUDRU_${kind.toUpperCase()}_BUCKET`] ?? "";
  const accessKeyId = env.CLOUDRU_S3_ACCESS_KEY_ID ?? "";
  const secretAccessKey = env.CLOUDRU_S3_SECRET_ACCESS_KEY ?? "";
  const endpoint = env.CLOUDRU_S3_ENDPOINT ?? "https://s3.cloud.ru";
  if (
    !bucketPattern.test(bucket) ||
    // Only the personally verified, private Cloud.ru bucket is accepted. New
    // buckets must be independently audited for anonymous access and versioning
    // before they are added to this allowlist.
    bucket !== "gafus-documents-private" ||
    !accessKeyId ||
    !secretAccessKey ||
    endpoint !== "https://s3.cloud.ru" ||
    env[`CLOUDRU_${kind.toUpperCase()}_BUCKET_PUBLIC`] === "true"
  )
    throw new Error("PRIVATE_MEDIA_STORAGE_UNCONFIGURED");
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region: "ru-central-1",
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 2,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
}
export async function uploadPrivateUserMedia(
  kind: PrivateMediaKind,
  relativePath: string,
  body: Uint8Array,
  contentType: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const location = privateMediaLocation(kind, relativePath);
  if (!body.byteLength || body.byteLength > 10 * 1024 * 1024)
    throw new Error("PRIVATE_MEDIA_INVALID_SIZE");
  const type =
    kind === "questions"
      ? /^(image\/jpeg|image\/png|image\/webp)$/
      : /^(application\/pdf|image\/jpeg|image\/png)$/;
  if (!type.test(contentType)) throw new Error("PRIVATE_MEDIA_INVALID_MIME");
  // A missing versioning policy would make compensating deletion unverifiable.
  const versioning = env[`CLOUDRU_${kind.toUpperCase()}_BUCKET_VERSIONING`];
  if (versioning !== "enabled" && versioning !== "disabled")
    throw new Error("PRIVATE_MEDIA_VERSIONING_UNVERIFIED");
  const { bucket, client } = privateMediaStorage(kind, env);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: parsePrivateMediaLocation(location)!.key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.byteLength,
        IfNoneMatch: "*", // immutable random-UUID keys: never overwrite a published object
        CacheControl: "private, no-store",
      }),
      { abortSignal: AbortSignal.timeout(60_000) },
    );
    return location;
  } finally {
    client.destroy();
  }
}
export async function signPrivateUserMedia(
  location: string,
  ttlSeconds = 3600,
  downloadName?: string,
) {
  const parsed = parsePrivateMediaLocation(location);
  if (!parsed || !Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600)
    throw new Error("PRIVATE_MEDIA_INVALID_SIGNATURE_REQUEST");
  const { bucket, client } = privateMediaStorage(parsed.kind);
  try {
    const extension = parsed.key.split(".").at(-1) ?? "bin";
    const disposition = downloadName
      ? `attachment; filename="document.${extension}"; filename*=UTF-8''${encodeURIComponent(downloadName).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`
      : "inline";
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: parsed.key,
        ResponseCacheControl: "private, no-store",
        ResponseContentDisposition: disposition,
      }),
      { expiresIn: ttlSeconds },
    );
  } finally {
    client.destroy();
  }
}
export async function deletePrivateUserMedia(location: string) {
  const parsed = parsePrivateMediaLocation(location);
  if (!parsed) throw new Error("PRIVATE_MEDIA_INVALID_LOCATION");
  const versioning = process.env[`CLOUDRU_${parsed.kind.toUpperCase()}_BUCKET_VERSIONING`];
  if (versioning !== "enabled" && versioning !== "disabled")
    throw new Error("PRIVATE_MEDIA_VERSIONING_UNVERIFIED");
  const { bucket, client } = privateMediaStorage(parsed.kind);
  const verifyGone = async () => {
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: parsed.key }), {
        abortSignal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404)
        return;
      throw error;
    }
    throw new Error("PRIVATE_MEDIA_OBJECT_REMAINS");
  };
  try {
    if (versioning === "disabled") {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: parsed.key }), {
        abortSignal: AbortSignal.timeout(30_000),
      });
      await verifyGone();
      return;
    }
    // List exact versions and markers; a plain delete marker does not remove historical data.
    // Restart from the beginning after each batch to avoid skipping newly exposed versions.
    for (;;) {
      const page = await client.send(
        new ListObjectVersionsCommand({ Bucket: bucket, Prefix: parsed.key, MaxKeys: 500 }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      const objects = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
        .filter((row) => row.Key === parsed.key)
        .map((row) => ({ Key: parsed.key, VersionId: row.VersionId }));
      if (!objects.length) break;
      const result = await client.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      if (result.Errors?.length) throw new Error("PRIVATE_MEDIA_PARTIAL_DELETE");
    }
    await verifyGone();
  } finally {
    client.destroy();
  }
}
