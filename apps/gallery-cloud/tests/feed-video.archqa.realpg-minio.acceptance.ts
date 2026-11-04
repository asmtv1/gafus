/** Real Feed V2 Core draft/PG lease + real VIDEO Cloud Worker and local MinIO.
 * The S3 port is an isolated, allowlisted injected adapter: production
 * createFeedCloudObjects pins specific ports and is intentionally untouched.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";
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
  async createFile(key: string, path: string, signal: AbortSignal) {
    assertFeedFinalKey(key);
    if (!key.endsWith(".mp4")) throw Error("REAL_FEED_VIDEO_MP4_ONLY");
    const input = await readFile(path);
    const digest = createHash("md5").update(input).digest();
    try {
      const response = await client.send(new PutObjectCommand({ Bucket: bucket, Key: key,
        Body: input, ContentType: "video/mp4", IfNoneMatch: "*",
        ContentMD5: digest.toString("base64"), CacheControl: "public, max-age=86400, immutable" }),
      { abortSignal: signal });
      expect(response.ETag?.replaceAll('"', '')).toBe(digest.toString("hex"));
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412)
        throw error;
      const actual = await head(key);
      if (actual?.etag.replaceAll('"', '') !== digest.toString("hex") ||
          actual?.bytes !== input.byteLength || actual?.contentType !== "video/mp4")
        throw Error("REAL_FEED_VIDEO_IMMUTABLE_CONFLICT");
    }
  },
  async delete(key: string, signal: AbortSignal) {
    assertFeedObjectKey(key);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
  },
};
const createTestWorker = (objectPort: typeof objects) => createFeedCloudWorker({
  core: { claimJobs: (n, kind) => jobs.claim(n, kind),
    completeJob: (id, token, output) => jobs.complete(id, token, output),
    failJob: (id, token, code) => jobs.fail(id, token, code),
    renewJob: (id, token) => jobs.renew(id, token),
    maintenance: async () => { throw Error("NO_FRESH_LOCAL_MAINTENANCE"); } },
  engine: sharpFeedEngine, objects: objectPort,
});
const worker = createTestWorker(objects);
const owner = randomUUID();
beforeAll(async () => {
  const actual = await db.$queryRawUnsafe("SELECT current_database() AS db") as { db: string }[];
  expect(actual[0]?.db).toBe(process.env.GAFUS_ARCHQA_DB_NAME);
  await db.user.create({ data: { id: owner, username: `feed_archqa_${owner}`, password: "synthetic-only" } });
});
afterAll(async () => { client.destroy(); await db.$disconnect(); });

async function seed() {
  const working = await mkdtemp(join(process.env.GAFUS_ARCHQA_VIDEO_OWN_DIR!, "feed-video-source-"));
  let input: Uint8Array;
  try {
    const target = join(working, "synthetic.mp4");
    execFileSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=12", "-t", "1.1",
      "-threads", "1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", target], { timeout: 20_000, cwd: working });
    input = await readFile(target);
  } finally { await rm(working, { recursive: true, force: true }); }
  const post = await feed.create(owner, { clientRequestId: randomUUID() });
  const ticket = await feed.reserveUpload(owner, post.id, {
    clientRequestId: randomUUID(), filename: "synthetic.mp4", kind: "video",
    declaredMime: "video/mp4", declaredBytes: input.byteLength,
  });
  const form = new FormData();
  for (const [key, val] of Object.entries(ticket.postFields! as Record<string, string>))
    form.append(key, val);
  form.append("file", new Blob([input], { type: "video/mp4" }), "synthetic.mp4");
  const uploaded = await fetch(ticket.postUrl!, { method: "POST", body: form });
  expect(uploaded.status).toBe(204);
  await uploaded.body?.cancel();
  expect((await feed.completeUpload(owner, ticket.uploadId)).status).toBe("uploaded");
  await feed.saveRevision(owner, post.id, { clientRequestId: randomUUID(),
    expectedVersion: post.version, text: "Synthetic Feed Video integration", attachmentIds: [ticket.mediaId] });
  expect((await feed.publish(owner, post.id, { clientRequestId: randomUUID() })).status)
    .toBe("pending");
  return ticket;
}

describe("REAL Feed Video PG + signed POST MinIO + FFmpeg + durable READY", () => {
  it("complete real video upload/queue/worker, verify 360+720 MP4, poster and post READY", async () => {
    const ticket = await seed();
    const [claim] = await jobs.claim(1, "video");
    expect(claim?.kind).toBe("publish_video");
    expect((await worker.process(claim!)).accepted).toBe(true);
    const media = await db.feedMediaAsset.findUniqueOrThrow({ where: { id: ticket.mediaId } });
    expect(media.status).toBe("ready");
    expect(media.durationSeconds).toBeGreaterThan(0);
    expect(media.posterKey).toBeTruthy();
    expect(media.mp4Keys).toHaveLength(2);
    for (const key of [media.posterKey!, ...media.mp4Keys]) {
      const result = await head(key);
      expect(result?.bytes).toBeGreaterThan(32);
      expect(result?.contentType).toBe(key.endsWith(".webp") ? "image/webp" : "video/mp4");
    }
    expect((await db.feedUpload.findUniqueOrThrow({ where: { id: ticket.uploadId } })).status)
      .toBe("ready");
    expect((await db.feedStorageJob.findUniqueOrThrow({ where: { id: claim!.id } })).status)
      .toBe("completed");
    console.log("PASS REAL_FEED_VIDEO_PG_MINIO_FFMPEG_READY");
  }, 100_000);

  it("partial real S3 object write followed by PG backoff reclaims and immutable retry", async () => {
    const ticket = await seed();
    const [claim] = await jobs.claim(1, "video");
    expect(claim?.kind).toBe("publish_video");
    const failedWorker = createTestWorker({
      ...objects,
      async createFile(key: string, path: string, signal: AbortSignal) {
        if (key.endsWith("/video/720.mp4")) throw Error("QA_FEED_VIDEO_S3_720_WRITE_FAILED");
        await objects.createFile(key, path, signal);
      },
    });
    await expect(failedWorker.process(claim!)).rejects.toThrow("QA_FEED_VIDEO_S3_720_WRITE_FAILED");
    const attempt = await db.feedStorageJob.findUniqueOrThrow({ where: { id: claim!.id } });
    expect(attempt.status).toBe("pending");
    expect(attempt.attempts).toBe(1);
    expect(attempt.errorCode).toBe("MEDIA_PROCESSING_FAILED");
    await db.feedStorageJob.update({ where: { id: claim!.id },
      data: { availableAt: new Date(Date.now() - 1000) } });
    const [retry] = await jobs.claim(1, "video");
    expect(retry?.id).toBe(claim!.id);
    expect(retry!.attemptToken).not.toBe(claim!.attemptToken);
    expect((await worker.process(retry!)).accepted).toBe(true);
    const final = await db.feedMediaAsset.findUniqueOrThrow({ where: { id: ticket.mediaId } });
    expect(final.status).toBe("ready");
    expect(final.mp4Keys).toHaveLength(2);
    expect((await jobs.renew(claim!.id, claim!.attemptToken)).accepted).toBe(false);
    console.log("PASS REAL_FEED_VIDEO_PARTIAL_S3_FAIL_RETRY_LEASE_FENCED");
  }, 100_000);
});
