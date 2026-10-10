import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { constants, createHash, sign } from "node:crypto";

export type AccountStorageScope = "public" | "gallery" | "feed";
const safeId = /^[A-Za-z0-9_-]{1,128}$/;
const safeKey = /^(?:uploads\/)?(?:users|questions|albums|posts|exams)\/[A-Za-z0-9_./-]+$/;

/** Accept only our object URLs/paths. Never turn a foreign URL into an S3 key. */
export function accountPublicKey(value: string): string | null {
  let key = value;
  if (/^https?:/.test(value)) {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("CLEANUP_UNSAFE_URL");
    if (url.hostname === "storage.yandexcloud.net" && url.pathname.startsWith("/gafus-media/"))
      key = url.pathname.slice("/gafus-media/".length);
    else if (url.hostname === "gafus-media.storage.yandexcloud.net") key = url.pathname.slice(1);
    else if (
      ["gafus.ru", "www.gafus.ru", "cdn.gafus.ru"].includes(url.hostname) &&
      url.pathname.startsWith("/uploads/")
    )
      key = url.pathname.slice(1);
    else return null; // External avatars have no object in our storage.
  }
  key = key.replace(/^\//, "");
  if (!safeKey.test(key) || key.split("/").some((part) => part === ".." || part === "."))
    throw new Error("CLEANUP_UNSAFE_KEY");
  return key.startsWith("uploads/") ? key : `uploads/${key}`;
}

export function accountStorageTargets(
  scope: AccountStorageScope,
  ownerId: string,
  values: string[],
  extraPrefixes: string[] = [],
) {
  if (!safeId.test(ownerId)) throw new Error("CLEANUP_UNSAFE_OWNER");
  if (extraPrefixes.some((path) => !/^uploads\/exams\/[A-Za-z0-9_-]{1,128}\/$/.test(path)))
    throw new Error("CLEANUP_UNSAFE_PREFIX");
  if (scope === "public")
    return {
      prefixes: [`uploads/users/${ownerId}/`, `uploads/questions/${ownerId}/`, ...extraPrefixes],
      keys: [...new Set(values.map(accountPublicKey).filter((key): key is string => key !== null))],
    };
  if (scope === "gallery")
    return { prefixes: [`albums/${ownerId}/`, `users/${ownerId}/`], keys: [] as string[] };
  if (scope === "feed") return { prefixes: [`posts/${ownerId}/`], keys: [] as string[] };
  throw new Error("CLEANUP_INVALID_SCOPE");
}

export function createAccountStorageCleaner(scope: AccountStorageScope, env = process.env) {
  const prefix = scope === "gallery" ? "GALLERY" : "FEED";
  const bucket = scope === "public" ? "gafus-media" : env[`${prefix}_BUCKET`];
  const accessKeyId = scope === "public" ? env.YC_ACCESS_KEY_ID : env[`${prefix}_S3_ACCESS_KEY_ID`];
  const secretAccessKey =
    scope === "public" ? env.YC_SECRET_ACCESS_KEY : env[`${prefix}_S3_SECRET_ACCESS_KEY`];
  if (
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    (scope !== "public" && (bucket === "gafus-media" || env[`${prefix}_BUCKET_PUBLIC`] === "true"))
  )
    throw new Error("CLEANUP_STORAGE_UNCONFIGURED");
  const client = new S3Client({
    endpoint: "https://storage.yandexcloud.net",
    region: "ru-central1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    maxAttempts: 2,
  });
  return {
    /** Delete versions and delete markers too. Pagination restarts after deletion, so no skipped keys. */
    async sweep(targets: { prefixes: string[]; keys: string[] }, signal: AbortSignal) {
      let removed = 0;
      const erase = async (objects: { Key: string; VersionId?: string }[]) => {
        if (!objects.length) return;
        const result = await client.send(
          new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
          { abortSignal: signal },
        );
        if (result.Errors?.length) throw new Error("CLEANUP_PARTIAL_DELETE");
        removed += objects.length;
      };
      for (const path of targets.prefixes) {
        for (;;) {
          const page = await client.send(
            new ListObjectVersionsCommand({ Bucket: bucket, Prefix: path, MaxKeys: 500 }),
            { abortSignal: signal },
          );
          const objects = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])].map((row) => ({
            Key: row.Key!,
            VersionId: row.VersionId,
          }));
          if (!objects.length) break;
          await erase(objects);
        }
        // Verify current objects independently of version listing.
        const remaining = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: path, MaxKeys: 1 }),
          { abortSignal: signal },
        );
        if (remaining.Contents?.length) throw new Error("CLEANUP_OBJECTS_REMAIN");
      }
      for (const key of targets.keys) {
        for (;;) {
          const page = await client.send(
            new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key, MaxKeys: 500 }),
            { abortSignal: signal },
          );
          const exact = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
            .filter((row) => row.Key === key)
            .map((row) => ({ Key: key, VersionId: row.VersionId }));
          // A prefix may match other users' files; only delete the exact snapshot key.
          if (!exact.length) break;
          await erase(exact);
        }
      }
      return removed;
    },
  };
}

let iam: { token: string; expires: number } | undefined;
async function cdnIamToken() {
  if (iam && iam.expires > Date.now()) return iam.token;
  const raw = process.env.CDN_CLEANUP_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("CLEANUP_CDN_UNCONFIGURED");
  const key = JSON.parse(raw) as { id: string; service_account_id: string; private_key: string };
  if (!key.id || !key.service_account_id || !key.private_key)
    throw new Error("CLEANUP_CDN_UNCONFIGURED");
  const time = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "PS256", kid: key.id, typ: "JWT" })}.${encode({
    iss: key.service_account_id,
    aud: "https://iam.api.cloud.yandex.net/iam/v1/tokens",
    iat: time,
    exp: time + 3600,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: key.private_key,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  }).toString("base64url");
  const response = await fetch("https://iam.api.cloud.yandex.net/iam/v1/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jwt: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("CLEANUP_IAM_FAILED");
  const result = (await response.json()) as { iamToken?: string };
  if (!result.iamToken) throw new Error("CLEANUP_IAM_FAILED");
  iam = { token: result.iamToken, expires: Date.now() + 50 * 60_000 };
  return iam.token;
}

async function cdnRequest(path: string, body?: { paths: string[] }) {
  const token = await cdnIamToken();
  const url = body
    ? `https://cdn.api.cloud.yandex.net/cdn/v1/${path}`
    : `https://operation.api.cloud.yandex.net/${path}`;
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`CLEANUP_CDN_HTTP_${response.status}`);
  const result = (await response.json()) as { id?: string; done?: boolean; error?: unknown };
  if (result.error) throw new Error("CLEANUP_CDN_OPERATION_FAILED");
  return result;
}

export async function startAccountCdnPurge(
  scope: AccountStorageScope,
  targets: { prefixes: string[]; keys: string[] },
  existing: string[] = [],
  checkpoint?: (operations: string[]) => Promise<void>,
) {
  // Multiple resource IDs cover aliases and a shared gallery/feed CDN. No empty/full-cache purge.
  const name = scope === "public" ? "PUBLIC" : scope.toUpperCase();
  const resources = [
    ...new Set(
      (process.env[`${name}_CDN_RESOURCE_IDS`] ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
  // Public media uses uncached Nginx unless additional CDN resources are explicitly configured.
  if (!resources.length && scope !== "public") throw new Error("CLEANUP_CDN_UNCONFIGURED");
  const paths = [
    ...new Set([...targets.prefixes.map((x) => `/${x}*`), ...targets.keys.map((x) => `/${x}*`)]),
  ];
  if (!paths.length) throw new Error("CLEANUP_EMPTY_PURGE");
  const operations: string[] = [...existing];
  for (const resource of resources) {
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(resource)) throw new Error("CLEANUP_INVALID_CDN_RESOURCE");
    for (let offset = 0; offset < paths.length; offset += 10) {
      const batch = paths.slice(offset, offset + 10);
      const hash = createHash("sha256")
        .update(JSON.stringify({ resource, paths: batch }))
        .digest("hex");
      if (operations.some((operation) => operation.replace(/^done:/, "").startsWith(`${hash}:`)))
        continue;
      const result = await cdnRequest(`cache/${resource}:purge`, { paths: batch });
      if (!result.id || !safeId.test(result.id)) throw new Error("CLEANUP_INVALID_OPERATION");
      operations.push(`${hash}:${result.id}`);
      await checkpoint?.(operations);
    }
  }
  return operations;
}

export async function accountCdnPurgeDone(
  operations: string[],
  checkpoint?: (operations: string[]) => Promise<void>,
) {
  const confirmed = [...operations];
  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index]!;
    if (operation.startsWith("done:")) continue;
    const id = operation.includes(":") ? operation.split(":")[1]! : operation;
    if (!safeId.test(id)) throw new Error("CLEANUP_INVALID_OPERATION");
    if (!(await cdnRequest(`operations/${id}`)).done) return false;
    confirmed[index] = `done:${operation}`;
    await checkpoint?.(confirmed);
  }
  return true;
}
