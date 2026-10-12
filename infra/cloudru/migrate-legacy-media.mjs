/**
 * Owner-scoped, non-destructive Yandex -> Cloud.ru private media migration.
 * --plan is strictly read-only. --apply requires operator confirmation.
 * No overwrites, public buckets, cross-owner keys, object DELETE, or secrets in output.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";

const CHUNK = 8 * 1024 * 1024;
const MAX_FILE = 1024 * 1024 * 1024;
const MAX_FILES = 5000;
const validId = /^[a-zA-Z0-9_-]{1,128}$/;
const names = { gallery: "GALLERY", feed: "FEED" };
const approved = { gallery: "gafus-gallery-private", feed: "gafus-feed-private" };
const safeBucket = /^[a-z0-9][a-z0-9.-]{2,62}$/;

export function ownerMediaPrefixes(scope, owner) {
  if (!Object.hasOwn(names, scope) || !validId.test(owner))
    throw new Error("MEDIA_MIGRATION_INVALID_SCOPE");
  return scope === "gallery" ? [`albums/${owner}/`, `users/${owner}/`] : [`posts/${owner}/`];
}
export function requireMediaConfig(scope, owner, env = process.env, apply = false) {
  const prefixes = ownerMediaPrefixes(scope, owner);
  const name = names[scope];
  const sourceBucket = env[`${name}_LEGACY_BUCKET`];
  const targetBucket = env[`${name}_BUCKET`];
  if (
    targetBucket !== approved[scope] ||
    !safeBucket.test(sourceBucket ?? "") ||
    ["gafus-media", "gafus-public", targetBucket].includes(sourceBucket) ||
    env[`${name}_LEGACY_BUCKET_VERIFIED`] !== "true" ||
    env[`${name}_LEGACY_S3_ENDPOINT`] !== "https://storage.yandexcloud.net" ||
    env[`${name}_S3_ENDPOINT`] !== "https://s3.cloud.ru" ||
    !env[`${name}_LEGACY_S3_ACCESS_KEY_ID`] ||
    !env[`${name}_LEGACY_S3_SECRET_ACCESS_KEY`] ||
    !env[`${name}_S3_ACCESS_KEY_ID`] ||
    !env[`${name}_S3_SECRET_ACCESS_KEY`]
  )
    throw new Error("MEDIA_MIGRATION_STORAGE_UNVERIFIED");
  if (
    apply &&
    (env.MEDIA_MIGRATION_CONFIRM !== "copy-only-owner-media" ||
      env[`${name}_DUAL_PROVIDER_CLEANUP`] !== "true" ||
      (!env[`${name}_LEGACY_CDN_RESOURCE_IDS`]?.trim() &&
        env[`${name}_LEGACY_CDN_UNCACHED_VERIFIED`] !== "true"))
  )
    throw new Error("MEDIA_MIGRATION_APPLY_NOT_AUTHORIZED");
  return {
    scope,
    owner,
    prefixes,
    sourceBucket,
    targetBucket,
    source: {
      endpoint: "https://storage.yandexcloud.net",
      region: "ru-central1",
      key: env[`${name}_LEGACY_S3_ACCESS_KEY_ID`],
      secret: env[`${name}_LEGACY_S3_SECRET_ACCESS_KEY`],
    },
    target: {
      endpoint: "https://s3.cloud.ru",
      region: "ru-central-1",
      key: env[`${name}_S3_ACCESS_KEY_ID`],
      secret: env[`${name}_S3_SECRET_ACCESS_KEY`],
    },
  };
}
const s3 = (cfg) =>
  new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.key, secretAccessKey: cfg.secret },
    maxAttempts: 2,
  });
const status = (error) => error?.$metadata?.httpStatusCode;
function keyAllowed(key, prefixes) {
  return (
    typeof key === "string" &&
    prefixes.some((prefix) => key.startsWith(prefix)) &&
    key.length < 1000 &&
    /^[A-Za-z0-9_./-]+$/.test(key) &&
    !key.split("/").some((part) => !part || part === "." || part === "..")
  );
}
function assertOwnerConfig(config) {
  const expected = ownerMediaPrefixes(config.scope, config.owner);
  if (
    config.targetBucket !== approved[config.scope] ||
    !safeBucket.test(config.sourceBucket ?? "") ||
    ["gafus-media", "gafus-public", config.targetBucket].includes(config.sourceBucket) ||
    !Array.isArray(config.prefixes) ||
    config.prefixes.length !== expected.length ||
    expected.some((prefix, index) => config.prefixes[index] !== prefix)
  )
    throw new Error("MEDIA_MIGRATION_UNTRUSTED_CONFIG");
}
const plausibleMetadata = (row) =>
  Number.isSafeInteger(row.ContentLength) &&
  row.ContentLength > 0 &&
  row.ContentLength <= MAX_FILE &&
  typeof row.ETag === "string" &&
  /^"[A-Za-z0-9-]{16,100}"$/.test(row.ETag);

export async function listOwnerObjects(config, source, options = {}) {
  assertOwnerConfig(config);
  const keys = new Map();
  const maxFiles = options.maxFiles ?? MAX_FILES;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > MAX_FILES)
    throw new Error("MEDIA_MIGRATION_INVALID_LIMIT");
  for (const prefix of config.prefixes) {
    let token;
    const seenTokens = new Set();
    let pages = 0;
    do {
      // Do not trust a remote pagination token blindly: cyclical/replayed
      // pages could prevent a finite audit from ever reaching a verdict.
      if (++pages > maxFiles + 1) throw new Error("MEDIA_MIGRATION_PAGINATION_BROKEN");
      const page = await source.send(
        new ListObjectsV2Command({
          Bucket: config.sourceBucket,
          Prefix: prefix,
          MaxKeys: 200,
          ContinuationToken: token,
        }),
      );
      if (
        !Array.isArray(page.Contents ?? []) ||
        (page.IsTruncated !== undefined && typeof page.IsTruncated !== "boolean")
      )
        throw new Error("MEDIA_MIGRATION_PAGINATION_BROKEN");
      if (page.IsTruncated && !(page.Contents ?? []).length)
        throw new Error("MEDIA_MIGRATION_PAGINATION_BROKEN");
      for (const entry of page.Contents ?? []) {
        if (!keyAllowed(entry.Key, [prefix])) throw new Error("MEDIA_MIGRATION_UNTRUSTED_KEY");
        if (!Number.isSafeInteger(entry.Size) || entry.Size <= 0 || entry.Size > MAX_FILE)
          throw new Error("MEDIA_MIGRATION_UNSAFE_SIZE");
        if (keys.has(entry.Key)) {
          if (keys.get(entry.Key).bytes !== entry.Size)
            throw new Error("MEDIA_MIGRATION_PAGINATION_BROKEN");
          // A repeated page with the same key is never a trustworthy scan.
          throw new Error("MEDIA_MIGRATION_PAGINATION_BROKEN");
        }
        keys.set(entry.Key, { key: entry.Key, bytes: entry.Size });
        if (keys.size > maxFiles) throw new Error("MEDIA_MIGRATION_OWNER_TOO_LARGE");
      }
      if (!page.IsTruncated) {
        // Unexpected continuation on a final page is not an authoritative
        // inventory: a truncated response may have been misrepresented.
        if (page.NextContinuationToken) throw new Error("MEDIA_MIGRATION_PAGINATION_BROKEN");
        break;
      }
      token = page.NextContinuationToken;
      if (typeof token !== "string" || !token || token.length > 4096 || seenTokens.has(token))
        throw new Error("MEDIA_MIGRATION_PAGINATION_BROKEN");
      seenTokens.add(token);
    } while (true);
  }
  return [...keys.values()];
}
async function head(client, bucket, key) {
  try {
    return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    if (status(error) === 404) return null;
    throw error;
  }
}
async function getRange(client, bucket, key, etag, offset, length, total) {
  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      IfMatch: etag,
      Range: `bytes=${offset}-${offset + length - 1}`,
    }),
  );
  const body = result.Body;
  if (
    !body ||
    result.ContentLength !== length ||
    result.ContentRange !== `bytes ${offset}-${offset + length - 1}/${total}`
  ) {
    body?.destroy?.();
    throw new Error("MEDIA_MIGRATION_BAD_RANGE");
  }
  const chunks = [];
  let count = 0;
  try {
    for await (const chunk of body) {
      count += chunk.byteLength;
      if (count > length) throw new Error("MEDIA_MIGRATION_RANGE_OVERFLOW");
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    body.destroy?.();
    throw error;
  }
  if (count !== length) throw new Error("MEDIA_MIGRATION_RANGE_TRUNCATED");
  return Buffer.concat(chunks);
}
async function digest(client, bucket, key, metadata) {
  const hash = createHash("sha256");
  for (let offset = 0; offset < metadata.ContentLength; offset += CHUNK) {
    const length = Math.min(CHUNK, metadata.ContentLength - offset);
    hash.update(
      await getRange(client, bucket, key, metadata.ETag, offset, length, metadata.ContentLength),
    );
  }
  return hash.digest("hex");
}
export async function verifyOwnerObject(config, source, target, item) {
  assertOwnerConfig(config);
  if (!keyAllowed(item.key, config.prefixes)) throw new Error("MEDIA_MIGRATION_UNTRUSTED_KEY");
  const first = await head(source, config.sourceBucket, item.key);
  if (!first || !plausibleMetadata(first) || first.ContentLength !== item.bytes)
    throw new Error("MEDIA_MIGRATION_SOURCE_CHANGED");
  const existing = await head(target, config.targetBucket, item.key);
  const type =
    typeof first.ContentType === "string" && first.ContentType.length <= 100
      ? first.ContentType
      : "application/octet-stream";
  if (
    !existing ||
    !plausibleMetadata(existing) ||
    existing.ContentLength !== first.ContentLength ||
    existing.ContentType !== type
  )
    throw new Error("MEDIA_MIGRATION_TARGET_UNVERIFIED");
  if (
    (await digest(source, config.sourceBucket, item.key, first)) !==
    (await digest(target, config.targetBucket, item.key, existing))
  )
    throw new Error("MEDIA_MIGRATION_TARGET_UNVERIFIED");
  const fresh = await head(source, config.sourceBucket, item.key);
  if (!fresh || fresh.ETag !== first.ETag || fresh.ContentLength !== first.ContentLength)
    throw new Error("MEDIA_MIGRATION_SOURCE_CHANGED");
  const finalTarget = await head(target, config.targetBucket, item.key);
  if (
    !finalTarget ||
    finalTarget.ETag !== existing.ETag ||
    finalTarget.ContentLength !== existing.ContentLength ||
    finalTarget.ContentType !== existing.ContentType
  )
    throw new Error("MEDIA_MIGRATION_TARGET_CHANGED");
  return { status: "already-verified", bytes: item.bytes };
}
export async function copyOwnerObject(config, source, target, item) {
  assertOwnerConfig(config);
  if (!keyAllowed(item.key, config.prefixes)) throw new Error("MEDIA_MIGRATION_UNTRUSTED_KEY");
  const first = await head(source, config.sourceBucket, item.key);
  if (!first || !plausibleMetadata(first) || first.ContentLength !== item.bytes)
    throw new Error("MEDIA_MIGRATION_SOURCE_CHANGED");
  const type =
    typeof first.ContentType === "string" && first.ContentType.length <= 100
      ? first.ContentType
      : "application/octet-stream";
  const preexisting = await head(target, config.targetBucket, item.key);
  if (preexisting) {
    try {
      await verifyOwnerObject(config, source, target, item);
    } catch (error) {
      if (error instanceof Error && error.message === "MEDIA_MIGRATION_TARGET_UNVERIFIED")
        throw new Error("MEDIA_MIGRATION_TARGET_CONFLICT");
      throw error;
    }
    return { status: "already-verified", bytes: item.bytes };
  }
  const hash = createHash("sha256");
  if (first.ContentLength <= CHUNK) {
    const bytes = await getRange(
      source,
      config.sourceBucket,
      item.key,
      first.ETag,
      0,
      first.ContentLength,
      first.ContentLength,
    );
    hash.update(bytes);
    await target.send(
      new PutObjectCommand({
        Bucket: config.targetBucket,
        Key: item.key,
        Body: bytes,
        ContentType: type,
        ContentLength: bytes.length,
        CacheControl: "private, no-store",
        ContentMD5: createHash("md5").update(bytes).digest("base64"),
        IfNoneMatch: "*",
      }),
    );
  } else {
    // Sequential multipart, bounded to 8 MiB memory. Complete only if the
    // destination is still absent. Never overwrite an unrelated cloud object.
    const created = await target.send(
      new CreateMultipartUploadCommand({
        Bucket: config.targetBucket,
        Key: item.key,
        ContentType: type,
        CacheControl: "private, no-store",
      }),
    );
    if (!created.UploadId) throw new Error("MEDIA_MIGRATION_MULTIPART_NO_ID");
    let completed = false;
    try {
      const parts = [];
      for (let offset = 0, number = 1; offset < first.ContentLength; offset += CHUNK, number++) {
        const bytes = await getRange(
          source,
          config.sourceBucket,
          item.key,
          first.ETag,
          offset,
          Math.min(CHUNK, first.ContentLength - offset),
          first.ContentLength,
        );
        hash.update(bytes);
        const uploaded = await target.send(
          new UploadPartCommand({
            Bucket: config.targetBucket,
            Key: item.key,
            UploadId: created.UploadId,
            PartNumber: number,
            Body: bytes,
            ContentLength: bytes.length,
            ContentMD5: createHash("md5").update(bytes).digest("base64"),
          }),
        );
        if (!uploaded.ETag) throw new Error("MEDIA_MIGRATION_MISSING_PART_ETAG");
        parts.push({ PartNumber: number, ETag: uploaded.ETag });
      }
      await target.send(
        new CompleteMultipartUploadCommand({
          Bucket: config.targetBucket,
          Key: item.key,
          UploadId: created.UploadId,
          MultipartUpload: { Parts: parts },
          IfNoneMatch: "*",
        }),
      );
      completed = true;
    } finally {
      if (!completed)
        await target
          .send(
            new AbortMultipartUploadCommand({
              Bucket: config.targetBucket,
              Key: item.key,
              UploadId: created.UploadId,
            }),
          )
          .catch(() => {});
    }
  }
  const targetMeta = await head(target, config.targetBucket, item.key);
  if (
    !targetMeta ||
    !plausibleMetadata(targetMeta) ||
    targetMeta.ContentLength !== first.ContentLength ||
    targetMeta.ContentType !== type ||
    hash.digest("hex") !== (await digest(target, config.targetBucket, item.key, targetMeta))
  )
    throw new Error("MEDIA_MIGRATION_TRANSFER_MISMATCH");
  const last = await head(source, config.sourceBucket, item.key);
  if (!last || last.ETag !== first.ETag || last.ContentLength !== first.ContentLength)
    throw new Error("MEDIA_MIGRATION_SOURCE_CHANGED");
  const finalTarget = await head(target, config.targetBucket, item.key);
  if (
    !finalTarget ||
    finalTarget.ETag !== targetMeta.ETag ||
    finalTarget.ContentLength !== targetMeta.ContentLength ||
    finalTarget.ContentType !== targetMeta.ContentType
  )
    throw new Error("MEDIA_MIGRATION_TARGET_CHANGED");
  return { status: "copied-and-verified", bytes: item.bytes };
}
export async function migrateOwner(
  config,
  clients,
  { apply = false, verify = false, maxFiles = MAX_FILES } = {},
) {
  if (apply && verify) throw new Error("MEDIA_MIGRATION_INVALID_MODE");
  const files = await listOwnerObjects(config, clients.source, { maxFiles });
  const result = {
    mode: apply ? "copy-only" : verify ? "verify-only" : "dry-run",
    scope: config.scope,
    objectCount: files.length,
    bytes: files.reduce((sum, f) => sum + f.bytes, 0),
    copied: 0,
    alreadyVerified: 0,
    failed: false,
  };
  if (!apply && !verify) return result;
  for (const file of files) {
    const out = verify
      ? await verifyOwnerObject(config, clients.source, clients.target, file)
      : await copyOwnerObject(config, clients.source, clients.target, file);
    if (out.status === "already-verified") result.alreadyVerified++;
    else result.copied++;
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [scope, owner, mode] = process.argv.slice(2);
  const apply = mode === "--apply";
  const verify = mode === "--verify";
  if (!["--plan", "--verify", "--apply"].includes(mode))
    throw new Error("MEDIA_MIGRATION_INVALID_MODE");
  const config = requireMediaConfig(scope, owner, process.env, apply);
  const clients = { source: s3(config.source), target: s3(config.target) };
  try {
    const result = await migrateOwner(config, clients, {
      apply,
      verify,
      maxFiles: Number(process.env.MEDIA_MIGRATION_MAX_FILES ?? 5000),
    });
    console.log(JSON.stringify(result)); // no paths, tokens or bucket names
  } catch (error) {
    console.error(
      error instanceof Error && /^MEDIA_MIGRATION_[A-Z_]+$/.test(error.message)
        ? error.message
        : "MEDIA_MIGRATION_FAILED",
    );
    process.exitCode = 1;
  } finally {
    clients.source.destroy();
    clients.target.destroy();
  }
}
