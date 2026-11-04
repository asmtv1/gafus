/** Real Feed V2 Core draft/PG lease + real photo Cloud Worker and local MinIO.
 * The S3 port is an isolated, allowlisted injected adapter: production
 * createFeedCloudObjects pins specific ports and is intentionally untouched.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";
import sharp from "sharp";
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createFeedService, createFeedStorageJobs } from "@gafus/core/services/feed";
import { assertFeedObjectKey, assertFeedFinalKey } from "@gafus/feed-storage";
import { createFeedCloudWorker } from "../../feed-cloud/src/worker";
import { sharpFeedEngine } from "../../feed-cloud/src/sharp-engine";
const dbUrl = process.env.DATABASE_URL ?? "";
const endpoint = process.env.GAFUS_ARCHQA_GALLERY_ENDPOINT ?? "";
const bucket = process.env.GAFUS_ARCHQA_GALLERY_BUCKET ?? "";
const safe = (() => {
  try {
    const db = new URL(dbUrl), s3 = new URL(endpoint);
    return process.env.GAFUS_ARCHQA_FEED_REALPG === "1" &&
      db.protocol === "postgresql:" && db.hostname === "127.0.0.1" &&
      /^archqa_schema_[a-f0-9]{12}$/.test(db.pathname.slice(1)) &&
      db.pathname.slice(1) === process.env.GAFUS_ARCHQA_DB_NAME &&
      s3.protocol === "http:" && s3.hostname === "127.0.0.1" && Number(s3.port) > 0 &&
      /^gafus-archqa-gallery-[a-f0-9]{12}$/.test(bucket);
  } catch { return false; }
})();
if (!safe) throw Error("FEED_ARCHQA_REQUIRES_OWN_PG_MINIO");
const requirePrisma = createRequire(new URL("../../../packages/prisma/package.json", import.meta.url));
const { PrismaClient } = requirePrisma("@prisma/client");
const req = createRequire(new URL("../../../packages/gallery-storage/package.json", import.meta.url));
const { createPresignedPost } = req("@aws-sdk/s3-presigned-post");
const { getSignedUrl } = req("@aws-sdk/s3-request-presigner");
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const client = new S3Client({ endpoint, forcePathStyle: true, region: "us-east-1",
  credentials: { accessKeyId: process.env.GAFUS_ARCHQA_GALLERY_KEY!,
    secretAccessKey: process.env.GAFUS_ARCHQA_GALLERY_SECRET! },
  maxAttempts: 1, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
const head = async (key: string) => {
  assertFeedObjectKey(key);
  try {
    const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { etag: response.ETag ?? "", bytes: response.ContentLength ?? 0,
      contentType: response.ContentType ?? "" };
  } catch (e) {
    if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
};
const storage = {
  enabled: true, head,
  async presignPost(input: { key: string; contentType: string; maxBytes: number; expiresAt: Date }) {
    assertFeedObjectKey(input.key);
    return createPresignedPost(client, { Bucket: bucket, Key: input.key,
      Expires: Math.max(1, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000)),
      Fields: { "Content-Type": input.contentType, success_action_status: "204" },
      Conditions: [["content-length-range", 1, input.maxBytes],
        ["eq", "$Content-Type", input.contentType], ["eq", "$key", input.key],
        ["eq", "$success_action_status", "204"]],
    });
  },
  async signCdn(input: { key: string; expiresAt: Date }) {
    assertFeedFinalKey(input.key);
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: input.key }), {
      expiresIn: Math.max(1, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000)),
    });
  },
};
const feed = createFeedService({ db, storage, enabled: () => true });
const jobs = createFeedStorageJobs({ db, storage });
const objects = {
  async download(key: string, destination: string, maxBytes: number, signal: AbortSignal, etag?: string) {
    assertFeedObjectKey(key);
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key,
      IfMatch: etag }), { abortSignal: signal });
    if (!result.Body || !result.ContentLength || result.ContentLength > maxBytes ||
        (etag && result.ETag !== etag)) throw Error("REAL_FEED_SOURCE_MISMATCH");
    await pipeline(result.Body as NodeJS.ReadableStream, createWriteStream(destination, { flags: "wx" }));
  },
  async create(key: string, bytes: Uint8Array, type: string, signal: AbortSignal) {
    assertFeedFinalKey(key);
    if (type !== "image/webp" || !bytes.byteLength) throw Error("REAL_FEED_WEBP_ONLY");
    const digest = createHash("md5").update(bytes).digest();
    try {
      const result = await client.send(new PutObjectCommand({ Bucket: bucket, Key: key,
        Body: bytes, ContentType: type, IfNoneMatch: "*", ContentMD5: digest.toString("base64"),
        CacheControl: "public, max-age=86400, immutable" }), { abortSignal: signal });
      expect(result.ETag?.replaceAll('"', '')).toBe(digest.toString("hex"));
    } catch (err) {
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412)
        throw err;
      const actual = await head(key);
      if (actual?.etag.replaceAll('"', '') !== digest.toString("hex") ||
          actual?.bytes !== bytes.byteLength) throw Error("IMMUTABLE_CONFLICT");
    }
  },
  async createFile() { throw Error("REAL_FEED_PHOTO_ONLY"); },
  async delete(key: string, signal: AbortSignal) {
    assertFeedObjectKey(key);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
  },
};
const worker = createFeedCloudWorker({
  core: { claimJobs: (n, kind) => jobs.claim(n, kind),
    completeJob: (id, token, output) => jobs.complete(id, token, output),
    failJob: (id, token, code) => jobs.fail(id, token, code),
    renewJob: (id, token) => jobs.renew(id, token),
    maintenance: async () => { throw Error("NO_FRESH_LOCAL_MAINTENANCE"); } },
  objects, engine: sharpFeedEngine,
});
const owner = randomUUID();
beforeAll(async () => {
  const actual = await db.$queryRawUnsafe("SELECT current_database() AS db") as Array<{ db: string }>;
  expect(actual[0]?.db).toBe(process.env.GAFUS_ARCHQA_DB_NAME);
  await db.user.create({ data: { id: owner, username: `feed_archqa_${owner}`, password: "synthetic-only" } });
});
afterAll(async () => { client.destroy(); await db.$disconnect(); });
describe("real Feed Photo V2 Core post lifecycle + leased Sharp worker + MinIO", () => {
  it("real signed upload, Core pending→ready, 3 WebP", async () => {
    const png = await sharp({ create: { width: 720, height: 510, channels: 3,
      background: "#c69171" } }).png().toBuffer();
    const post = await feed.create(owner, { clientRequestId: randomUUID() });
    const ticket = await feed.reserveUpload(owner, post.id, {
      clientRequestId: randomUUID(), filename: "qa.png", kind: "photo",
      declaredMime: "image/png", declaredBytes: png.length,
    });
    const form = new FormData();
    for (const [k, v] of Object.entries(ticket.postFields! as Record<string, string>)) form.append(k, v);
    form.append("file", new Blob([png], { type: "image/png" }), "qa.png");
    const response = await fetch(ticket.postUrl!, { method: "POST", body: form });
    expect(response.status).toBe(204);
    await response.body?.cancel();
    expect((await feed.completeUpload(owner, ticket.uploadId)).status).toBe("uploaded");
    await feed.saveRevision(owner, post.id, { clientRequestId: randomUUID(),
      expectedVersion: post.version, text: "Synthetic feed media E2E", attachmentIds: [ticket.mediaId] });
    expect((await feed.publish(owner, post.id, { clientRequestId: randomUUID() })).status)
      .toBe("pending");
    const [claim] = await jobs.claim(1, "photo");
    expect(claim?.kind).toBe("publish_photo");
    expect((await worker.process(claim!)).accepted).toBe(true);
    const ready = await db.feedMediaAsset.findUniqueOrThrow({ where: { id: ticket.mediaId } });
    expect(ready.status).toBe("ready");
    for (const key of [ready.smallKey, ready.thumbKey, ready.fullKey]) {
      expect(key).toBeTruthy();
      expect((await head(key!))?.contentType).toBe("image/webp");
    }
    expect((await db.feedUpload.findUniqueOrThrow({ where: { id: ticket.uploadId } })).status)
      .toBe("ready");
    console.log("PASS REAL_FEED_CORE_PG_MINIO_SHARP_POST_READY");
  }, 45_000);
});
