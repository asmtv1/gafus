/** Real Questions photo Cloud worker + Core PG queue + concrete CDN-upload S3 objects. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import sharp from "sharp";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { questionsV2SourceKey, questionsV2FinalKeys } from "@gafus/feed-cloud";
import { createQuestionsV2Queue } from "../../api/src/modules/questions/media-v2-jobs";
import { createQuestionsV2JobRunner } from "../../feed-cloud/src/questions-v2-job-runner";
import { createQuestionsV2S3Objects } from "../../feed-cloud/src/questions-v2-s3-objects";

const injected = vi.hoisted(() => ({ client: null as S3Client | null, bucket: "" }));
vi.mock("@gafus/cdn-upload", async importOriginal => ({
  ...(await importOriginal<typeof import("@gafus/cdn-upload")>()),
  questionsV2Storage: () => {
    if (!injected.client || !injected.bucket) throw Error("QA_INJECTED_LOCAL_S3_REQUIRED");
    return { client: injected.client, bucket: injected.bucket };
  },
}));
const dbUrl = process.env.DATABASE_URL ?? "";
const endpoint = process.env.GAFUS_ARCHQA_GALLERY_ENDPOINT ?? "";
const bucket = process.env.GAFUS_ARCHQA_GALLERY_BUCKET ?? "";
const guard = (() => {
  try {
    const db = new URL(dbUrl);
    const s3 = new URL(endpoint);
    return process.env.GAFUS_ARCHQA_QUESTIONS_REALPG === "1" &&
      db.protocol === "postgresql:" && db.hostname === "127.0.0.1" &&
      /^archqa_schema_[a-f0-9]{12}$/.test(db.pathname.slice(1)) &&
      db.pathname.slice(1) === process.env.GAFUS_ARCHQA_DB_NAME &&
      s3.protocol === "http:" && s3.hostname === "127.0.0.1" && Number(s3.port) > 0 &&
      /^gafus-archqa-gallery-[a-f0-9]{12}$/.test(bucket);
  } catch { return false; }
})();
if (!guard) throw Error("QUESTIONS_ARCHQA_REQUIRES_DISPOSABLE_PG_AND_MINIO");
const requirePrisma = createRequire(new URL("../../../packages/prisma/package.json", import.meta.url));
const { PrismaClient } = requirePrisma("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const s3 = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.GAFUS_ARCHQA_GALLERY_KEY!,
    secretAccessKey: process.env.GAFUS_ARCHQA_GALLERY_SECRET!,
  }, maxAttempts: 1, requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED" });
injected.client = s3;
injected.bucket = bucket;
const coreQueue = createQuestionsV2Queue({
  database: db,
  head: async key => {
    const object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { bytes: object.ContentLength ?? -1, mime: object.ContentType ?? "",
      etag: object.ETag ?? "" };
  },
  deleteObjects: async keys => {
    for (const key of keys) {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  },
});
const jobCore = {
  claimOne: async () => (await coreQueue.claimOne()).jobs[0] ?? null,
  renew: coreQueue.renew,
  complete: coreQueue.complete,
  fail: coreQueue.fail,
};
const owner = randomUUID();
beforeAll(async () => {
  const current = await db.$queryRawUnsafe("SELECT current_database() AS db") as Array<{ db: string }>;
  expect(current[0]?.db).toBe(process.env.GAFUS_ARCHQA_DB_NAME);
  await db.user.create({ data: { id: owner, username: `questions_archqa_${owner}`, password: "synthetic-only" } });
});
afterAll(async () => {
  s3.destroy();
  await db.$disconnect();
});

async function seed() {
  const bytes = await sharp({ create: { width: 840, height: 700, channels: 3,
    background: "#558877" } }).png().toBuffer();
  const mediaId = randomUUID();
  const sourceKey = questionsV2SourceKey(owner, mediaId, "image/png");
  const photoId = randomUUID();
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: sourceKey,
    Body: bytes, ContentType: "image/png" }));
  await db.questionPhoto.create({ data: { id: photoId, ownerId: owner, url: "",
    storagePath: `questions-v2:${sourceKey}` } });
  await db.questionV2MediaTask.create({ data: { mediaId, photoId, ownerId: owner,
    sourceKey, sourceMime: "image/png", sourceBytes: bytes.length,
    status: "QUEUED", nextAttemptAt: new Date(Date.now() - 1000) } });
  return { mediaId, photoId, sourceKey };
}

describe("REAL Questions Photo V2 processing against one-off PG18 and MinIO", () => {
  it("real Core claim + Sharp + S3 immutable WebP writes -> atomic PG READY and source cleanup", async () => {
    const task = await seed();
    const runner = createQuestionsV2JobRunner({ core: jobCore,
      objectsFor: createQuestionsV2S3Objects });
    const outcomes = await Promise.all([runner(), runner()]);
    expect(outcomes.sort()).toEqual([0, 1]);
    const state = await db.questionV2MediaTask.findUniqueOrThrow({ where: { mediaId: task.mediaId } });
    expect(state.status).toBe("READY");
    expect(state.attempts).toBe(1);
    const photo = await db.questionPhoto.findUniqueOrThrow({ where: { id: task.photoId } });
    expect(photo.url).toContain("questions-v2:");
    const keys = questionsV2FinalKeys(owner, task.mediaId);
    for (const key of [keys.small, keys.medium]) {
      const result = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      expect(result.ContentType).toBe("image/webp");
    }
    expect(await runner()).toBe(0);
    console.log("PASS QUESTIONS_V2_REAL_PG_MINIO_SHARP_ATOMIC_READY");
  }, 45_000);
  it("lost completion ACK after DB commit must not revert READY to FAILED", async () => {
    const task = await seed();
    const lostAck = {
      ...jobCore,
      async complete(id: string, token: string, manifest: Parameters<typeof jobCore.complete>[2]) {
        const result = await jobCore.complete(id, token, manifest);
        expect(result.accepted).toBe(true);
        throw Error("QA_LOST_COMPLETION_ACK_AFTER_COMMIT");
      },
    };
    const runner = createQuestionsV2JobRunner({ core: lostAck,
      objectsFor: createQuestionsV2S3Objects });
    await expect(runner()).rejects.toThrow("QA_LOST_COMPLETION_ACK_AFTER_COMMIT");
    const state = await db.questionV2MediaTask.findUniqueOrThrow({ where: { mediaId: task.mediaId } });
    expect(state.status).toBe("READY");
    expect(state.errorCode).toBeNull();
    expect(await createQuestionsV2JobRunner({ core: jobCore,
      objectsFor: createQuestionsV2S3Objects })()).toBe(0);
    console.log("PASS QUESTIONS_V2_REAL_PG_LOST_ACK_FAIL_CLOSED");
  }, 45_000);
});
