/** Explicit opt-in REAL GAFUS Chat2 VIDEO: PostgreSQL lease/READY + FFmpeg + MinIO.
 * Only new random localhost PostgreSQL, private test MinIO and synthetic MP4.
 * No production bucket, CDN, messaging side effects, registry or user data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { chat2V2FinalKeys, chat2V2SourceKey } from "@gafus/feed-cloud";
import { createChat2V2Queue } from "../../api/src/modules/chat2/media-v2-jobs";
import { createChat2JobRunner } from "../../feed-cloud/src/chat2-job-runner";
import { createChat2S3Objects, CHAT2_CLOUD_BUCKET } from "../../feed-cloud/src/chat2-s3-objects";
import { sharpFeedEngine } from "../../feed-cloud/src/sharp-engine";

const dbUrl = process.env.DATABASE_URL ?? "";
const endpoint = process.env.GAFUS_ARCHQA_VIDEO_S3_ENDPOINT ?? "";
const workRoot = process.env.GAFUS_ARCHQA_VIDEO_OWN_DIR ?? "";
const dbName = process.env.GAFUS_ARCHQA_VIDEO_DB ?? "";
const guarded = (() => {
  try {
    const db = new URL(dbUrl), objectStore = new URL(endpoint);
    return process.env.GAFUS_ARCHQA_VIDEO_MINIO_PG === "1" &&
      db.protocol === "postgresql:" && db.hostname === "127.0.0.1" &&
      /^archqa_queue_[a-f0-9]{12}$/.test(dbName) && db.pathname === `/${dbName}` &&
      objectStore.protocol === "http:" && objectStore.hostname === "127.0.0.1" &&
      Number(objectStore.port) > 0 &&
      workRoot.startsWith("/Users/asmtv1/Desktop/gafus-refactor/.gafus-refactoring/architecture-qa-20261103-local/queue/own-pg18-");
  } catch { return false; }
})();
if (!guarded) throw Error("CHAT2_VIDEO_REAL_S3_PG_OWN_TEST_ENV_REQUIRED");
const req = createRequire(new URL("../../../packages/prisma/package.json", import.meta.url));
const { PrismaClient } = req("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true,
  credentials: { accessKeyId: process.env.GAFUS_ARCHQA_VIDEO_S3_KEY!,
    secretAccessKey: process.env.GAFUS_ARCHQA_VIDEO_S3_SECRET! },
  maxAttempts: 1, requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED" });
const queue = createChat2V2Queue({ database: db,
  head: async url => {
    const parsed = new URL(url);
    if (parsed.hostname !== `${CHAT2_CLOUD_BUCKET}.s3.cloud.ru` || parsed.search || parsed.hash)
      throw Error("LOCAL_VIDEO_UNTRUSTED_HEAD_URL");
    try {
      const output = await client.send(new HeadObjectCommand({ Bucket: CHAT2_CLOUD_BUCKET,
        Key: parsed.pathname.slice(1) }));
      return { status: 200, bytes: output.ContentLength ?? -1, mime: output.ContentType ?? "" };
    } catch (err) {
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
        return { status: 404, bytes: 0, mime: "" };
      throw err;
    }
  },
  deleteObjects: async keys => {
    for (const key of keys)
      await client.send(new DeleteObjectCommand({ Bucket: CHAT2_CLOUD_BUCKET, Key: key }));
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
const room = "archqa_video_room", owner = "archqa_video_owner";
beforeAll(async () => {
  const actual = await db.$queryRawUnsafe("SELECT current_database() AS db") as { db: string }[];
  expect(actual[0]?.db).toBe(dbName);
  expect(await db.chat2V2MediaTask.count()).toBe(0);
});
afterAll(async () => { client.destroy(); await db.$disconnect(); });
async function seedVideo() {
  const mediaId = randomUUID();
  const tmp = await mkdtemp(join(workRoot, "video-input-"));
  try {
    const sourceFile = join(tmp, "fixture.mp4");
    execFileSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=12", "-t", "1.1",
      "-threads", "1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", sourceFile], { timeout: 20_000, cwd: tmp });
    const input = await readFile(sourceFile);
    const sourceKey = chat2V2SourceKey(room, owner, mediaId, "video/mp4");
    await client.send(new PutObjectCommand({ Bucket: CHAT2_CLOUD_BUCKET,
      Key: sourceKey, Body: input, ContentType: "video/mp4" }));
    await db.chat2V2MediaTask.create({ data: {
      mediaId, conversationId: room, ownerId: owner,
      name: "synthetic-one-second.mp4", sourceKey,
      sourceMime: "video/mp4", sourceBytes: input.byteLength,
      status: "QUEUED", nextAttemptAt: new Date(Date.now() - 1000),
    } });
    return { mediaId, sourceKey };
  } finally { await rm(tmp, { recursive: true, force: true }); }
}
function runner(injectS3Failure = false) {
  const keysToFail = new Set<string>();
  return createChat2JobRunner({ core, kind: "video", engine: sharpFeedEngine,
    workRoot,
    objectsFor: job => {
      const actual = createChat2S3Objects(job, client);
      const keys = chat2V2FinalKeys(job.conversationId, job.ownerId, job.mediaId);
      keysToFail.add(keys.video.variants[720]);
      if (!injectS3Failure) return actual;
      return { ...actual,
        async createFile(key: string, file: string, signal: AbortSignal) {
          if (keysToFail.has(key)) throw Error("QA_SYNTHETIC_S3_720_UPLOAD_503");
          await actual.createFile(key, file, signal);
        },
      };
    },
  });
}

describe("real GAFUS Chat2 VIDEO V2 with disposable PG18 + MinIO + FFmpeg", () => {
  it("only one concurrent claim, 2 real MP4 immutable S3 renditions + WebP + atomic READY", async () => {
    const { mediaId, sourceKey } = await seedVideo();
    const results = await Promise.all([runner()(), runner()()]);
    expect(results.sort()).toEqual([0, 1]);
    const saved = await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId } });
    expect(saved.status).toBe("READY");
    expect(saved.attempts).toBe(1);
    expect(saved.errorCode).toBeNull();
    const keys = chat2V2FinalKeys(room, owner, mediaId);
    for (const [key, type] of [[keys.video.poster, "image/webp"],
      [keys.video.variants[360], "video/mp4"], [keys.video.variants[720], "video/mp4"]] as const) {
      const head = await client.send(new HeadObjectCommand({ Bucket: CHAT2_CLOUD_BUCKET, Key: key }));
      expect(head.ContentType).toBe(type);
      expect(head.ContentLength).toBeGreaterThan(24);
    }
    const poster = await client.send(new GetObjectCommand({ Bucket: CHAT2_CLOUD_BUCKET,
      Key: keys.video.poster }));
    const header = await poster.Body!.transformToByteArray();
    expect(Buffer.from(header).subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(Buffer.from(header).subarray(8, 12).toString("ascii")).toBe("WEBP");
    const after = await client.send(new HeadObjectCommand({ Bucket: CHAT2_CLOUD_BUCKET, Key: sourceKey }))
      .catch(err => (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode);
    expect(after).toBe(404);
    expect(await runner()()).toBe(0);
    console.log("PASS REAL_CHAT2_VIDEO_PG_MINIO_FFMPEG_ALL_RENDITIONS_READY");
  }, 100_000);

  it("real MinIO partial upload then PG QUEUED and idempotent immutable retry to READY", async () => {
    const { mediaId } = await seedVideo();
    await expect(runner(true)()).rejects.toThrow("QA_SYNTHETIC_S3_720_UPLOAD_503");
    const failed = await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId } });
    expect(failed.status).toBe("QUEUED");
    expect(failed.attempts).toBe(1);
    expect(failed.errorCode).toBe("CHAT2_MEDIA_PROCESSING_FAILED");
    // Advance only this test's own row, preserving real lease and retry logic.
    await db.chat2V2MediaTask.update({ where: { mediaId },
      data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    expect(await runner()()).toBe(1);
    const final = await db.chat2V2MediaTask.findUniqueOrThrow({ where: { mediaId } });
    expect(final.status).toBe("READY");
    expect(final.attempts).toBe(2);
    expect(final.errorCode).toBeNull();
    console.log("PASS REAL_CHAT2_VIDEO_PARTIAL_S3_FAILURE_RETRY_READY");
  }, 100_000);
});
