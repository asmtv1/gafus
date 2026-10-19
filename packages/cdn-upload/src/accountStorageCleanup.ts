import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { constants, createHash, sign } from "node:crypto";
import { parsePrivateMediaLocation } from "./privateUserMedia";
import { parsePublicQuestionLocation, parsePendingQuestionLocation, questionImageVariantKeys } from "./publicQuestionMedia";
import { cloudruCdnPurgeDone } from "./cloudruCdnPurge";
import { beginBegetCdnPurge, begetCdnPurgeDone, isBegetCacheableObjectKey } from "./begetCdnPurge";

export type AccountStorageScope = "public" | "gallery" | "feed" | "questions" | "questions-public" | "documents";
/** Durable account-deletion intent, not an object prefix. A provider cutover
 * must never lose legacy cleanup obligations after a worker restart. */
export const DUAL_PROVIDER_CLEANUP_MARKER = "migration-dual-provider-required";
const safeId = /^[A-Za-z0-9_-]{1,128}$/;
const safeKey = /^(?:uploads\/)?(?:users|questions|albums|posts|exams)\/[A-Za-z0-9_./-]+$/;

/** Accept only our object URLs/paths. Never turn a foreign URL into an S3 key. */
export function accountPublicKey(value: string): string | null {
  if (parsePrivateMediaLocation(value) || parsePublicQuestionLocation(value) ||
      parsePendingQuestionLocation(value)) return null; // Private Cloud.ru objects have their own cleanup scopes.
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
  if (
    extraPrefixes.some((path) =>
      scope === "public"
        ? !/^uploads\/exams\/[A-Za-z0-9_-]{1,128}\/$/.test(path)
        : scope === "gallery" || scope === "feed"
          ? path !== DUAL_PROVIDER_CLEANUP_MARKER
          : true,
    )
  )
    throw new Error("CLEANUP_UNSAFE_PREFIX");
  if (scope === "public")
    return {
      prefixes: [`uploads/users/${ownerId}/`, `uploads/questions/${ownerId}/`, ...extraPrefixes],
      keys: [...new Set(values.map(accountPublicKey).filter((key): key is string => key !== null))],
    };
  if (scope === "gallery" || scope === "feed") {
    const prefixes =
      scope === "gallery" ? [`albums/${ownerId}/`, `users/${ownerId}/`] : [`posts/${ownerId}/`];
    const keys = [...new Set(values)];
    // Invalid or foreign file keys must not be silently purged or deleted.
    if (
      keys.some(
        (key) =>
          !safeKey.test(key) ||
          key.split("/").some((part) => part === "." || part === "..") ||
          !prefixes.some((prefix) => key.startsWith(prefix)),
      )
    )
      throw new Error("CLEANUP_INVALID_MEDIA_KEY");
    return { prefixes, keys };
  }
  if (scope === "questions-public") {
    const keys = values.flatMap(value => {
      const original = parsePublicQuestionLocation(value);
      const pending = parsePendingQuestionLocation(value);
      if (!original && !pending) throw new Error("CLEANUP_INVALID_PUBLIC_QUESTION_LOCATION");
      if (pending || original?.endsWith("/full.webp") || original?.endsWith("/thumb.webp")) {
        const pair = questionImageVariantKeys(value);
        return [pair.thumb, pair.full];
      }
      return [original!]; // historical direct-to-S3 photos
    });
    return {
      prefixes: [
        `questions/uploads/questions/${ownerId}/`,
        `questions/incoming/questions/${ownerId}/`,
        `questions/processed/questions/${ownerId}/`,
        `questions/jobs/pending/questions/${ownerId}/`,
      ],
      keys: [...new Set(keys)],
    };
  }
  if (scope === "questions" || scope === "documents") {
    const prefix =
      scope === "questions"
        ? `questions/uploads/questions/${ownerId}/`
        : `documents/uploads/users/${ownerId}/pets/`;
    const keys = values.map((value) => {
      const parsed = parsePrivateMediaLocation(value);
      if (!parsed || parsed.kind !== scope) throw new Error("CLEANUP_INVALID_PRIVATE_LOCATION");
      return parsed.key;
    });
    return { prefixes: [prefix], keys: [...new Set(keys)] };
  }
  throw new Error("CLEANUP_INVALID_SCOPE");
}

type AccountBucketCleaner = {
  sweep(targets: { prefixes: string[]; keys: string[] }, signal: AbortSignal): Promise<number>;
};
export function createAccountStorageCleaner(
  scope: AccountStorageScope,
  env: NodeJS.ProcessEnv = process.env,
): AccountBucketCleaner {
  const privateCloud = scope === "questions" || scope === "documents" || scope === "questions-public";
  const prefix =
    scope === "gallery" ? "GALLERY" : scope === "feed" ? "FEED" :
      scope === "questions-public" ? "QUESTIONS_PUBLIC_S3" : `CLOUDRU_${scope.toUpperCase()}`;
  const bucket = scope === "public" ? "gafus-media" : env[`${prefix}_BUCKET`];
  const accessKeyId =
    scope === "public"
      ? env.YC_ACCESS_KEY_ID
      : privateCloud
        ? env.CLOUDRU_S3_ACCESS_KEY_ID
        : env[`${prefix}_S3_ACCESS_KEY_ID`];
  const secretAccessKey =
    scope === "public"
      ? env.YC_SECRET_ACCESS_KEY
      : privateCloud
        ? env.CLOUDRU_S3_SECRET_ACCESS_KEY
        : env[`${prefix}_S3_SECRET_ACCESS_KEY`];
  if (
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    (scope !== "public" && (bucket === "gafus-media" || env[`${prefix}_BUCKET_PUBLIC`] === "true"))
  )
    throw new Error("CLEANUP_STORAGE_UNCONFIGURED");
  // The public store also contains courses and avatars: never move it implicitly.
  // Gallery/feed are dedicated private stores with an explicit, approved endpoint.
  const endpoint =
    scope === "public"
      ? "https://storage.yandexcloud.net"
      : privateCloud
        ? (env.CLOUDRU_S3_ENDPOINT ?? "https://s3.cloud.ru")
        : (env[`${prefix}_S3_ENDPOINT`] ?? "https://storage.yandexcloud.net");
  if (!["https://storage.yandexcloud.net", "https://s3.cloud.ru"].includes(endpoint))
    throw new Error("CLEANUP_UNSAFE_ENDPOINT");
  // Account erasure can destroy other tenants' data if a bucket is mispointed.
  // Bind Cloud.ru cleanup scopes to the three private buckets verified live.
  if (endpoint === "https://s3.cloud.ru") {
    const expected =
      scope === "gallery"
        ? "gafus-gallery-private"
        : scope === "feed"
          ? "gafus-feed-private"
          : scope === "questions-public" ? "gafus-questions-public" : "gafus-documents-private";
    if (bucket !== expected) throw new Error("CLEANUP_STORAGE_UNCONFIGURED");
  }
  const versioning =
    scope === "public" ? "enabled" : (env[`${prefix}_BUCKET_VERSIONING`] ?? "enabled");
  if (versioning !== "enabled" && versioning !== "disabled")
    throw new Error("CLEANUP_INVALID_VERSIONING");
  const client = new S3Client({
    endpoint,
    region: endpoint === "https://s3.cloud.ru" ? "ru-central-1" : "ru-central1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    maxAttempts: 2,
  });
  const primaryCleaner = {
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
      if (versioning === "disabled") {
        // An explicitly non-versioned bucket may refuse ListObjectVersions.
        // Restart each list at the beginning after deletion; paging while deleting skips keys.
        const sweepUnversioned = async (prefix: string, exact: boolean) => {
          for (;;) {
            const page = await client.send(
              new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix,
                MaxKeys: 500,
              }),
              { abortSignal: signal },
            );
            const objects = (page.Contents ?? [])
              .filter((row) => !exact || row.Key === prefix)
              .map((row) => ({ Key: row.Key! }));
            if (!objects.length) break;
            await erase(objects);
          }
        };
        for (const path of targets.prefixes) await sweepUnversioned(path, false);
        for (const key of targets.keys) await sweepUnversioned(key, true);
        return removed;
      }
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
  const dual =
    (scope === "gallery" || scope === "feed") && env[`${prefix}_DUAL_PROVIDER_CLEANUP`] === "true";
  if (!dual) return primaryCleaner;
  // During cutover the SAME owner's immutable keys may exist in both private
  // buckets. Never report deletion until independent S3 sweeps BOTH pass.
  // Explicit attestation prevents accidentally erasing an arbitrary Yandex
  // bucket supplied by a mistyped environment variable.
  const oldBucket = env[`${prefix}_LEGACY_BUCKET`];
  if (
    endpoint !== "https://s3.cloud.ru" ||
    !oldBucket ||
    !/^[a-z0-9][a-z0-9.-]{2,62}$/.test(oldBucket) ||
    ["gafus-media", "gafus-public", bucket].includes(oldBucket) ||
    env[`${prefix}_LEGACY_BUCKET_VERIFIED`] !== "true" ||
    env[`${prefix}_LEGACY_S3_ENDPOINT`] !== "https://storage.yandexcloud.net" ||
    !env[`${prefix}_LEGACY_S3_ACCESS_KEY_ID`] ||
    !env[`${prefix}_LEGACY_S3_SECRET_ACCESS_KEY`]
  )
    throw new Error("CLEANUP_LEGACY_PROVIDER_UNVERIFIED");
  const oldCleaner = createAccountStorageCleaner(scope, {
    ...env,
    [`${prefix}_DUAL_PROVIDER_CLEANUP`]: "false",
    [`${prefix}_BUCKET`]: oldBucket,
    [`${prefix}_S3_ENDPOINT`]: "https://storage.yandexcloud.net",
    [`${prefix}_S3_ACCESS_KEY_ID`]: env[`${prefix}_LEGACY_S3_ACCESS_KEY_ID`],
    [`${prefix}_S3_SECRET_ACCESS_KEY`]: env[`${prefix}_LEGACY_S3_SECRET_ACCESS_KEY`],
    [`${prefix}_BUCKET_VERSIONING`]: env[`${prefix}_LEGACY_BUCKET_VERSIONING`] ?? "enabled",
  });
  return {
    async sweep(targets: { prefixes: string[]; keys: string[] }, signal: AbortSignal) {
      const current = await primaryCleaner.sweep(targets, signal);
      // Fail-closed: one provider failure leaves the durable job pending.
      const old = await oldCleaner.sweep(targets, signal);
      return current + old;
    },
  };
}

let iam: { token: string; expires: number; fingerprint: string } | undefined;
async function cdnIamToken() {
  const raw = process.env.CDN_CLEANUP_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("CLEANUP_CDN_UNCONFIGURED");
  // Key rotation must never re-use an IAM token minted for an old account.
  const fingerprint = createHash("sha256").update(raw).digest("hex");
  if (iam && iam.fingerprint === fingerprint && iam.expires > Date.now()) return iam.token;
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
  iam = { token: result.iamToken, expires: Date.now() + 50 * 60_000, fingerprint };
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
  // Private question/document downloads use direct short-lived S3 presigns, not CDN.
  if (scope === "questions" || scope === "documents") return [...existing];
  if (scope === "questions-public") {
    if (!targets.keys.length) return [...existing];
    if (targets.keys.some(key => !isBegetCacheableObjectKey("questions", key)))
      throw new Error("CLEANUP_INVALID_PUBLIC_QUESTION_KEY");
    return beginBegetCdnPurge("questions", targets.keys.map(key => `/${key}`),
      existing, checkpoint);
  }
  const cloudru =
    (scope === "gallery" || scope === "feed") &&
    process.env[`${name}_S3_ENDPOINT`] === "https://s3.cloud.ru";
  // Beget is the ONLY active Gallery/Feed CDN delivery provider.
  // Legacy edge purge, if separately verified, is a historical erasure
  // obligation, never a fallback route for user media delivery.
  const cdnHost = process.env[`${name}_CDN_BASE_URL`] ?? "";
  const publicFeed = scope === "feed" && process.env.FEED_BUCKET_PUBLIC === "true";
  const publicFeedMatch = publicFeed ? /^https:\/\/([a-z0-9-]+\.begetcdn\.cloud)$/.exec(cdnHost) : null;
  if (publicFeed && (!publicFeedMatch || publicFeedMatch[1] === "garaquachegasourn.begetcdn.cloud"))
    throw new Error("CLEANUP_CDN_PROVIDER_MISMATCH");
  const knownBeget = scope === "gallery" ?
    process.env.GALLERY_CDN_REDIRECT_ENABLED === "true"
      ? "https://dikinuneceswe.begetcdn.cloud" : "https://mepsuduyokabib.begetcdn.cloud" :
    publicFeed ? cdnHost : scope === "feed" ? "https://garaquachegasourn.begetcdn.cloud" : "";
  const provider = process.env[`${name}_CDN_PROVIDER`] ?? "beget";
  if (cloudru && knownBeget && (provider !== "beget" || cdnHost !== knownBeget))
    throw new Error("CLEANUP_CDN_PROVIDER_MISMATCH");
  const dual = cloudru && process.env[`${name}_DUAL_PROVIDER_CLEANUP`] === "true";
  const legacyResources = dual
    ? [...new Set((process.env[`${name}_LEGACY_CDN_RESOURCE_IDS`] ?? "")
        .split(",").map((value) => value.trim()).filter(Boolean))]
    : [];
  // Old-provider erasure only: Gallery/Feed runtime never chooses this CDN.
  const yandexResources = cloudru ? legacyResources : resources;
  // Before submitting ANY purge verify old CDN coverage. Otherwise an
  // incorrectly configured cutover can confirm only Cloud.ru and leave Yandex
  // edge copies readable after the account is deleted.
  if (
    dual &&
    (process.env[`${name}_LEGACY_BUCKET_VERIFIED`] !== "true" ||
      (!legacyResources.length && process.env[`${name}_LEGACY_CDN_UNCACHED_VERIFIED`] !== "true"))
  )
    throw new Error("CLEANUP_LEGACY_CDN_UNVERIFIED");
  // Public media uses uncached Nginx unless additional CDN resources are explicitly configured.
  if (!cloudru && !resources.length && scope !== "public")
    throw new Error("CLEANUP_CDN_UNCONFIGURED");
  if (cloudru && provider === "beget") {
    // Beget path purge cannot safely infer old signed cache keys from a prefix.
    // Keep deletion pending rather than silently leave cached private media.
    const cacheable = targets.keys.filter(key =>
      isBegetCacheableObjectKey(scope as "gallery" | "feed", key));
    // Incoming sources and attempts are never public. Final HLS playlists
    // must be purged as well after public Feed cutover.
    if (targets.prefixes.length && !cacheable.length && !targets.keys.length)
      throw new Error("BEGET_CDN_EXACT_KEYS_REQUIRED");
    const submitted = cacheable.length
      ? await beginBegetCdnPurge(scope as "gallery" | "feed",
          cacheable.map(key => `/${key}`), existing, checkpoint)
      : [...existing];
    if (!dual) return submitted;
    existing = submitted;
  }
  const paths = [
    ...new Set([...targets.prefixes.map((x) => `/${x}*`), ...targets.keys.map((x) => `/${x}*`)]),
  ];
  if (!paths.length) throw new Error("CLEANUP_EMPTY_PURGE");
  const operations: string[] = [...existing];
  for (const resource of yandexResources) {
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
    if (operation.startsWith("beget:")) {
      if (!(await begetCdnPurgeDone(operation))) return false;
      confirmed[index] = `done:${operation}`;
      await checkpoint?.(confirmed);
      continue;
    }
    if (operation.startsWith("cloudru:")) {
      if (!(await cloudruCdnPurgeDone(operation))) return false;
      confirmed[index] = `done:${operation}`;
      await checkpoint?.(confirmed);
      continue;
    }
    const id = operation.includes(":") ? operation.split(":")[1]! : operation;
    if (!safeId.test(id)) throw new Error("CLEANUP_INVALID_OPERATION");
    if (!(await cdnRequest(`operations/${id}`)).done) return false;
    confirmed[index] = `done:${operation}`;
    await checkpoint?.(confirmed);
  }
  return true;
}
