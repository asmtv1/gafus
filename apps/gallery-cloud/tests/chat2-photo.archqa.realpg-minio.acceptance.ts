/** Real Chat2 photo one-shot Cloud Job + SQL leased Core + private local MinIO. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import sharp from "sharp";
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { chat2V2SourceKey, chat2V2FinalKeys } from "@gafus/feed-cloud";
import { createChat2V2Queue } from "../../api/src/modules/chat2/media-v2-jobs";
import { createChat2JobRunner } from "../../feed-cloud/src/chat2-job-runner";
import { createChat2S3Objects, CHAT2_CLOUD_BUCKET } from "../../feed-cloud/src/chat2-s3-objects";
import { sharpFeedEngine } from "../../feed-cloud/src/sharp-engine";
const dbUrl = process.env.DATABASE_URL ?? "";
const endpoint = process.env.GAFUS_ARCHQA_GALLERY_ENDPOINT ?? "";
const runRoot = process.env.GAFUS_ARCHQA_WORK_ROOT ?? "";
const safe = (() => {
  try {
    const d = new URL(dbUrl), s = new URL(endpoint);
    return process.env.GAFUS_ARCHQA_CHAT2_REALPG === "1" &&
      d.protocol === "postgresql:" && d.hostname === "127.0.0.1" &&
      /^archqa_schema_[a-f0-9]{12}$/.test(d.pathname.slice(1)) &&
      d.pathname.slice(1) === process.env.GAFUS_ARCHQA_DB_NAME &&
      s.protocol === "http:" && s.hostname === "127.0.0.1" && Number(s.port) > 0 &&
      runRoot.includes("/.gafus-refactoring/architecture-qa-20261103-local/gallery-worker-");
  } catch { return false; }
})();
if (!safe) throw Error("CHAT2_ARCHQA_REQUIRES_OWN_PG_S3_WORKDIR");
const req = createRequire(new URL("../../../packages/prisma/package.json", import.meta.url));
const { PrismaClient } = req("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true,
  credentials: { accessKeyId: process.env.GAFUS_ARCHQA_GALLERY_KEY!,
    secretAccessKey: process.env.GAFUS_ARCHQA_GALLERY_SECRET! },
  maxAttempts: 1, requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED" });
const queue = createChat2V2Queue({ database: db,
  head: async url => {
    const parsed = new URL(url);
    if (parsed.hostname !== `${CHAT2_CLOUD_BUCKET}.s3.cloud.ru` || parsed.search || parsed.hash)
      throw Error("CHAT2_UNTRUSTED_HEAD_URL");
    try {
      const result = await s3.send(new HeadObjectCommand({ Bucket: CHAT2_CLOUD_BUCKET,
        Key: parsed.pathname.slice(1) }));
      return { status: 200, bytes: result.ContentLength ?? -1, mime: result.ContentType ?? "" };
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
        return { status: 404, bytes: 0, mime: "" };
      throw error;
    }
  },
  deleteObjects: async keys => {
    for (const key of keys) await s3.send(new DeleteObjectCommand({ Bucket: CHAT2_CLOUD_BUCKET, Key: key }));
  },
});
const core = {
  claimOne: async (kind: "image" | "video") => (await queue.claimOne(kind)).jobs[0] ?? null,
  renew: queue.renew,
  complete: (job: { mediaId: string; attemptToken: string }, manifest: Parameters<typeof queue.complete>[2]) =>
    queue.complete(job.mediaId, job.attemptToken, manifest),
  fail: async (job: { mediaId: string; attemptToken: string }, code: string) => {
    await queue.fail(job.mediaId, job.attemptToken, code);
  },
};
const conversationId = "archqa_room1";
const owner = "archqa_owner1";
beforeAll(async () => {
  const actual = await db.$queryRawUnsafe("SELECT current_database() AS db") as Array<{ db: string }>;
  expect(actual[0]?.db).toBe(process.env.GAFUS_ARCHQA_DB_NAME);
});
afterAll(async () => { s3.destroy(); await db.$disconnect(); });
async function seed() {
  const mediaId = randomUUID();
  const jpeg = await sharp({ create: { width: 820, height: 560, channels: 3,
    background: "#6e8eab" } }).jpeg().toBuffer();
  const sourceKey = chat2V2SourceKey(conversationId, owner, mediaId, "image/jpeg");
  await s3.send(new PutObjectCommand({ Bucket: CHAT2_CLOUD_BUCKET,
    Key: sourceKey, Body: jpeg, ContentType: "image/jpeg" }));
  await db.chat2V2MediaTask.create({ data: { mediaId, conversationId,
    ownerId: owner, name: "synthetic-only.jpg", sourceKey,
    sourceMime: "image/jpeg", sourceBytes: jpeg.byteLength,
    status: "QUEUED", nextAttemptAt: new Date(Date.now() - 1000) } });
  return mediaId;
}
function run() {
  return createChat2JobRunner({ core, kind: "image", objectsFor: job => createChat2S3Objects(job, s3),
    engine: sharpFeedEngine, workRoot: runRoot });
}
describe("real Chat2 PHOTO V2 one-shot Cloud worker + PostgreSQL + MinIO", () => {
  it("one of two workers claims photo, writes real image renditions, commits READY", async () => {
    const mediaId = await seed();
    const results = await Promise.all([run()(), run()()]);
    expect(results.sort()).toEqual([0, 1]);
    const task = await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId } });
    expect(task.status).toBe("READY");
    expect(task.attempts).toBe(1);
    const keys = chat2V2FinalKeys(conversationId, owner, mediaId);
    for (const key of [keys.image.small, keys.image.medium]) {
      const meta = await s3.send(new HeadObjectCommand({ Bucket: CHAT2_CLOUD_BUCKET, Key: key }));
      expect(meta.ContentType).toBe("image/webp");
    }
    expect(await run()()).toBe(0);
    console.log("PASS CHAT2_REAL_PG_MINIO_SHARP_IMAGE_READY");
  }, 50_000);
  it("lost ACK after persistent completion leaves READY and does not invoke fail", async () => {
    const mediaId = await seed();
    const lost = { ...core, async complete(job: { mediaId: string; attemptToken: string },
      manifest: Parameters<typeof queue.complete>[2]) {
      expect((await core.complete(job, manifest)).accepted).toBe(true);
      throw Error("QA_ACK_LOST_AFTER_CORE_COMMIT");
    } };
    await expect(createChat2JobRunner({ core: lost, kind: "image",
      objectsFor: job => createChat2S3Objects(job, s3),
      engine: sharpFeedEngine, workRoot: runRoot })())
      .rejects.toThrow("QA_ACK_LOST_AFTER_CORE_COMMIT");
    const state = await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId } });
    expect(state.status).toBe("READY");
    expect(state.errorCode).toBeNull();
    expect(await run()()).toBe(0);
    console.log("PASS CHAT2_REAL_PG_LOST_ACK_FAIL_CLOSED");
  }, 50_000);
});
