import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ownerMediaPrefixes,
  requireMediaConfig,
  migrateOwner,
  copyOwnerObject,
  verifyOwnerObject,
  listOwnerObjects,
} from "./migrate-legacy-media.mjs";
const md5 = (bytes) => `"${createHash("md5").update(bytes).digest("hex")}"`;
const env = {
  FEED_BUCKET: "gafus-feed-private",
  FEED_S3_ENDPOINT: "https://s3.cloud.ru",
  FEED_S3_ACCESS_KEY_ID: "test-cloud",
  FEED_S3_SECRET_ACCESS_KEY: "test-cloud-secret",
  FEED_LEGACY_BUCKET: "gafus-feed-old-private",
  FEED_LEGACY_BUCKET_VERIFIED: "true",
  FEED_LEGACY_S3_ENDPOINT: "https://storage.yandexcloud.net",
  FEED_LEGACY_S3_ACCESS_KEY_ID: "test-legacy",
  FEED_LEGACY_S3_SECRET_ACCESS_KEY: "test-legacy-secret",
  MEDIA_MIGRATION_CONFIRM: "copy-only-owner-media",
  FEED_DUAL_PROVIDER_CLEANUP: "true",
  FEED_LEGACY_CDN_UNCACHED_VERIFIED: "true",
};
const owner = "user-test-123";
const config = requireMediaConfig("feed", owner, env, true);
assert.deepEqual(ownerMediaPrefixes("gallery", owner), [`albums/${owner}/`, `users/${owner}/`]);
assert.deepEqual(ownerMediaPrefixes("feed", owner), [`posts/${owner}/`]);
assert.throws(() => ownerMediaPrefixes("feed", "../user"), /MEDIA_MIGRATION_INVALID_SCOPE/);
assert.throws(() => ownerMediaPrefixes("constructor", owner), /MEDIA_MIGRATION_INVALID_SCOPE/);
assert.throws(() => ownerMediaPrefixes("__proto__", owner), /MEDIA_MIGRATION_INVALID_SCOPE/);
assert.throws(
  () => requireMediaConfig("feed", owner, { ...env, FEED_LEGACY_BUCKET: "gafus-media" }, true),
  /MEDIA_MIGRATION_STORAGE_UNVERIFIED/,
);
assert.throws(
  () => requireMediaConfig("feed", owner, { ...env, MEDIA_MIGRATION_CONFIRM: "no" }, true),
  /MEDIA_MIGRATION_APPLY_NOT_AUTHORIZED/,
);

class S3Memory {
  constructor(bucket, seed = []) {
    this.bucket = bucket;
    this.objects = new Map(seed);
    this.requests = [];
    this.multipart = null;
  }
  async send(command) {
    const kind = command.constructor.name;
    const input = command.input;
    this.requests.push({ kind, input });
    assert.equal(input.Bucket, this.bucket);
    if (kind === "ListObjectsV2Command") {
      return {
        Contents: [...this.objects]
          .filter(([key]) => key.startsWith(input.Prefix))
          .map(([Key, row]) => ({ Key, Size: row.bytes.length })),
        IsTruncated: false,
      };
    }
    if (kind === "HeadObjectCommand") {
      const value = this.objects.get(input.Key);
      if (!value) throw { $metadata: { httpStatusCode: 404 } };
      return {
        ETag: value.etag ?? md5(value.bytes),
        ContentLength: value.bytes.length,
        ContentType: value.type,
      };
    }
    if (kind === "GetObjectCommand") {
      const value = this.objects.get(input.Key);
      if (!value) throw { $metadata: { httpStatusCode: 404 } };
      const etag = value.etag ?? md5(value.bytes);
      if (input.IfMatch !== etag) throw new Error("SOURCE_IF_MATCH_FAILED");
      const result = /^bytes=(\d+)-(\d+)$/.exec(input.Range);
      assert(result);
      const begin = Number(result[1]),
        end = Number(result[2]);
      const bytes = value.bytes.subarray(begin, end + 1);
      return {
        ContentLength: bytes.length,
        ContentRange: `bytes ${begin}-${end}/${value.bytes.length}`,
        Body: (async function* () {
          yield bytes;
        })(),
      };
    }
    if (kind === "PutObjectCommand") {
      assert.equal(input.IfNoneMatch, "*");
      if (this.objects.has(input.Key)) throw { $metadata: { httpStatusCode: 412 } };
      const bytes = Buffer.from(input.Body);
      assert.equal(bytes.length, input.ContentLength);
      this.objects.set(input.Key, { bytes, type: input.ContentType });
      return { ETag: md5(bytes) };
    }
    if (kind === "CreateMultipartUploadCommand") {
      this.multipart = { key: input.Key, type: input.ContentType, id: "test-upload", parts: [] };
      return { UploadId: this.multipart.id };
    }
    if (kind === "UploadPartCommand") {
      assert.equal(input.UploadId, this.multipart.id);
      this.multipart.parts[input.PartNumber - 1] = Buffer.from(input.Body);
      return { ETag: md5(input.Body) };
    }
    if (kind === "CompleteMultipartUploadCommand") {
      assert.equal(input.IfNoneMatch, "*");
      assert(!this.objects.has(input.Key));
      const bytes = Buffer.concat(this.multipart.parts);
      this.objects.set(input.Key, { bytes, type: this.multipart.type, etag: '"multipart-etag-2"' });
      return {};
    }
    if (kind === "AbortMultipartUploadCommand") {
      this.multipart = null;
      return {};
    }
    throw new Error(`UNRECOGNIZED_S3_COMMAND:${kind}`);
  }
}
await assert.rejects(
  migrateOwner(
    { ...config, prefixes: ["posts/"] },
    {
      source: new S3Memory(config.sourceBucket),
      target: new S3Memory(config.targetBucket),
    },
    { apply: true },
  ),
  /MEDIA_MIGRATION_UNTRUSTED_CONFIG/,
);
await assert.rejects(
  migrateOwner(
    { ...config, targetBucket: "gafus-public" },
    {
      source: new S3Memory(config.sourceBucket),
      target: new S3Memory(config.targetBucket),
    },
    { apply: true },
  ),
  /MEDIA_MIGRATION_UNTRUSTED_CONFIG/,
);
// Malformed S3 pagination must be rejected before any destination-side write.
const ownerFirstKey = `posts/${owner}/first.webp`;
const ownerSecondKey = `posts/${owner}/second.webp`;
const page = (key, more = false, continuation = undefined) => ({
  Contents: [{ Key: key, Size: 5 }],
  IsTruncated: more,
  NextContinuationToken: continuation,
});
const pages = (list) => ({
  index: 0,
  async send(command) {
    assert.equal(command.constructor.name, "ListObjectsV2Command");
    return list[this.index++] ?? list.at(-1);
  },
});
const validPages = await listOwnerObjects(
  config,
  pages([page(ownerFirstKey, true, "token-next"), page(ownerSecondKey)]),
);
assert.deepEqual(
  validPages.map((x) => x.key),
  [ownerFirstKey, ownerSecondKey],
);
for (const invalid of [
  [page(ownerFirstKey, true, "same-token"), page(ownerSecondKey, true, "same-token")],
  [page(ownerFirstKey, true)],
  [page(ownerFirstKey, false, "unexpected-token")],
  [page(ownerFirstKey, true, "second-page"), page(ownerFirstKey)],
  [page(`posts/another-owner/secret.webp`)],
  [{ Contents: [], IsTruncated: true, NextContinuationToken: "empty-page" }],
]) {
  await assert.rejects(
    listOwnerObjects(config, pages(invalid)),
    /MEDIA_MIGRATION_(PAGINATION_BROKEN|UNTRUSTED_KEY)/,
  );
}
const key = `posts/${owner}/post-id/attachments/image/full.webp`;
const small = Buffer.from("Gafus-media-preview-test-no-users");
const from = new S3Memory(config.sourceBucket, [[key, { bytes: small, type: "image/webp" }]]);
const to = new S3Memory(config.targetBucket);
const dry = await migrateOwner(config, { source: from, target: to });
assert.deepEqual(dry, {
  mode: "dry-run",
  scope: "feed",
  objectCount: 1,
  bytes: small.length,
  copied: 0,
  alreadyVerified: 0,
  failed: false,
});
assert.equal(to.requests.length, 0);
const copied = await migrateOwner(config, { source: from, target: to }, { apply: true });
assert.equal(copied.copied, 1);
assert.deepEqual(to.objects.get(key).bytes, small);
assert.equal(
  (await migrateOwner(config, { source: from, target: to }, { apply: true })).alreadyVerified,
  1,
);
assert.equal(to.requests.filter((x) => x.kind === "PutObjectCommand").length, 1);
const beforeVerify = to.requests.length;
const verified = await migrateOwner(config, { source: from, target: to }, { verify: true });
assert.equal(verified.mode, "verify-only");
assert.equal(verified.alreadyVerified, 1);
assert(to.requests.length > beforeVerify);
assert.equal(to.requests.filter((x) => x.kind === "PutObjectCommand").length, 1);
await assert.rejects(
  migrateOwner(
    config,
    { source: from, target: new S3Memory(config.targetBucket) },
    { verify: true },
  ),
  /MEDIA_MIGRATION_TARGET_UNVERIFIED/,
);
// A destination replaced after checksum verification must not be recorded
// as complete, even though all earlier byte comparisons succeeded.
const replacedAfterRead = new S3Memory(config.targetBucket, [
  [key, { bytes: small, type: "image/webp" }],
]);
const replacedSend = replacedAfterRead.send.bind(replacedAfterRead);
let destinationHeads = 0;
replacedAfterRead.send = async (command) => {
  const value = await replacedSend(command);
  if (command.constructor.name === "HeadObjectCommand" && ++destinationHeads >= 2)
    value.ETag = '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"';
  return value;
};
await assert.rejects(
  verifyOwnerObject(config, from, replacedAfterRead, { key, bytes: small.length }),
  /MEDIA_MIGRATION_TARGET_CHANGED/,
);
assert.equal(
  replacedAfterRead.requests.some((x) => x.kind === "PutObjectCommand"),
  false,
);

const wrong = new S3Memory(config.targetBucket, [
  [key, { bytes: Buffer.from("corruption"), type: "image/webp" }],
]);
await assert.rejects(
  copyOwnerObject(config, from, wrong, { key, bytes: small.length }),
  /MEDIA_MIGRATION_TARGET_CONFLICT/,
);
const equalSizeCorruption = new S3Memory(config.targetBucket, [
  [
    key,
    {
      bytes: Buffer.alloc(small.length, 0x41),
      type: "image/webp",
    },
  ],
]);
await assert.rejects(
  copyOwnerObject(config, from, equalSizeCorruption, { key, bytes: small.length }),
  /MEDIA_MIGRATION_TARGET_CONFLICT/,
);
await assert.rejects(
  copyOwnerObject(config, from, to, { key: `posts/another-user/photo.webp`, bytes: 10 }),
  /MEDIA_MIGRATION_UNTRUSTED_KEY/,
);
const foreignList = new S3Memory(config.sourceBucket, [
  [`posts/another-owner/private.webp`, { bytes: small, type: "image/webp" }],
]);
foreignList.send = async (command) => {
  if (command.constructor.name === "ListObjectsV2Command")
    return {
      Contents: [{ Key: "posts/another-owner/private.webp", Size: small.length }],
      IsTruncated: false,
    };
  throw new Error("NO_FOREIGN_READS");
};
await assert.rejects(
  migrateOwner(
    config,
    {
      source: foreignList,
      target: new S3Memory(config.targetBucket),
    },
    { apply: true },
  ),
  /MEDIA_MIGRATION_UNTRUSTED_KEY/,
);
const maxFilesSource = new S3Memory(config.sourceBucket, [
  [key, { bytes: small, type: "image/webp" }],
  [`posts/${owner}/post3/file.webp`, { bytes: small, type: "image/webp" }],
]);
const untouchedTarget = new S3Memory(config.targetBucket);
await assert.rejects(
  migrateOwner(
    config,
    { source: maxFilesSource, target: untouchedTarget },
    { apply: true, maxFiles: 1 },
  ),
  /MEDIA_MIGRATION_OWNER_TOO_LARGE/,
);
assert.equal(untouchedTarget.requests.length, 0);
// A malformed Range response must be rejected, and its stream closed rather
// than leaving an open HTTP socket during a retryable migration failure.
const badRange = new S3Memory(config.sourceBucket, [[key, { bytes: small, type: "image/webp" }]]);
const badOriginalSend = badRange.send.bind(badRange);
let abortedRangeStream = false;
badRange.send = async (command) => {
  const value = await badOriginalSend(command);
  if (command.constructor.name === "GetObjectCommand") {
    value.ContentRange = "bytes 0-9/99999";
    value.Body.destroy = () => {
      abortedRangeStream = true;
    };
  }
  return value;
};
const noWriteTarget = new S3Memory(config.targetBucket);
await assert.rejects(
  copyOwnerObject(config, badRange, noWriteTarget, { key, bytes: small.length }),
  /MEDIA_MIGRATION_BAD_RANGE/,
);
assert.equal(abortedRangeStream, true);
assert.equal(
  noWriteTarget.requests.some((x) => x.kind === "PutObjectCommand"),
  false,
);

// If original changes after copying, the run MUST fail instead of recording
// success for a stale source. Existing Cloud bytes are never overwritten.
const mutatedSource = new S3Memory(config.sourceBucket, [
  [key, { bytes: small, type: "image/webp" }],
]);
const mutOriginalSend = mutatedSource.send.bind(mutatedSource);
let headNumber = 0;
mutatedSource.send = async (command) => {
  const value = await mutOriginalSend(command);
  if (command.constructor.name === "HeadObjectCommand" && ++headNumber >= 2)
    value.ETag = '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"';
  return value;
};
await assert.rejects(
  copyOwnerObject(config, mutatedSource, new S3Memory(config.targetBucket), {
    key,
    bytes: small.length,
  }),
  /MEDIA_MIGRATION_SOURCE_CHANGED/,
);
const largeKey = `posts/${owner}/post2/attachments/video/original.mp4`;
const video = Buffer.alloc(8 * 1024 * 1024 + 13, 71);
const videoFrom = new S3Memory(config.sourceBucket, [
  [largeKey, { bytes: video, type: "video/mp4" }],
]);
const videoTo = new S3Memory(config.targetBucket);
const big = await migrateOwner(config, { source: videoFrom, target: videoTo }, { apply: true });
assert.equal(big.copied, 1);
assert.equal(videoTo.requests.filter((x) => x.kind === "UploadPartCommand").length, 2);
assert.deepEqual(videoTo.objects.get(largeKey).bytes, video);
assert.equal(
  (await migrateOwner(config, { source: videoFrom, target: videoTo }, { apply: true }))
    .alreadyVerified,
  1,
);
const failedTo = new S3Memory(config.targetBucket);
const originalSend = failedTo.send.bind(failedTo);
failedTo.send = async (command) => {
  if (command.constructor.name === "UploadPartCommand") throw new Error("S3_WRITE_INTERRUPTED");
  return originalSend(command);
};
await assert.rejects(
  migrateOwner(config, { source: videoFrom, target: failedTo }, { apply: true }),
  /S3_WRITE_INTERRUPTED/,
);
assert.equal(failedTo.objects.size, 0);
assert.equal(
  failedTo.requests.some((x) => x.kind === "AbortMultipartUploadCommand"),
  true,
);
console.log(
  "GAFUS legacy media migration: dry-run, owner isolation, idempotency, SHA256, multipart, rollback PASS",
);
