import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { realpathSync } from "node:fs";
import { mkdtemp, readFile, rm, chmod } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { S3Client, CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand,
  ListObjectsV2Command, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
import { createFeedStorage } from "@gafus/feed-storage";
import { createFeedService } from "./service";
import { createFeedStorageJobs } from "./jobs";
import type { FeedDb } from "./ports";
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const SCRATCH = `${ROOT}/.local-pg-scratch/web4-functional-pg18-20261026`;
const DB_URL = "postgresql://asmtv1@127.0.0.1:55946/feed_test";
const BUCKET = "gafus-refactor-feed-test";
const exec = promisify(execFile);
const require = createRequire(new URL("../../../../prisma/package.json", import.meta.url));
const Client = require("@prisma/client").PrismaClient as new (args: {
  datasources: { db: { url: string } };
}) => FeedDb & { $disconnect(): Promise<void> };

(process.env.WEB4_OWN_VIDEO_PG_MINIO_WORKER === "1" ? describe : describe.skip)(
  "120-second HLS actual Core PG18 + signed MinIO S3 + unmodified video worker", () => {
    it("uploads real MP4, processes HLS, publishes for reader, signs segments, removes private objects", async () => {
      if (realpathSync(process.cwd()) !== ROOT || realpathSync(ROOT) !== ROOT ||
          realpathSync(tmpdir()) !== SCRATCH ||
          process.env.FEED_TEST_DATABASE_URL !== DB_URL ||
          process.env.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
          process.env.GAFUS_ISOLATED_S3_ENDPOINT !== "http://127.0.0.1:9000" ||
          process.env.GAFUS_ISOLATED_S3_FEED_BUCKET !== BUCKET ||
          process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
          process.env.NODE_ENV !== "development") throw Error("OWN_VIDEO_PROVIDER_GUARD_DENIED");
      const local = isolatedNonprodS3Config("feed");
      expect(local).toMatchObject({ bucket: BUCKET, endpoint: "http://127.0.0.1:9000" });
      const db = new Client({ datasources: { db: { url: DB_URL } } });
      const s3 = new S3Client({ endpoint: local!.endpoint, forcePathStyle: true, region: "us-east-1",
        credentials: { accessKeyId: local!.accessKeyId, secretAccessKey: local!.secretAccessKey },
        requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
      const storage = createFeedStorage({ enabled: true, isolatedNonprod: true,
        ...local!, cdnBaseUrl: "", cdnSecret: "" });
      const owner = randomUUID(), reader = randomUUID();
      const prefix = `web4_own_video_${randomUUID().replace(/-/g, "")}`;
      let postId = ""; let sourceKey = "";
      const temp = await mkdtemp(join(SCRATCH, "video-120-source-"));
      try {
        expect(await db.feedStorageJob.count()).toBe(0);
        await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
        await db.user.createMany({ data: [owner, reader].map((id, n) => ({
          id, username: `${prefix}_${n}`, password: "fixture-no-login", registrationPending: false,
        })) });
        const videoFile = join(temp, "own-120.mp4");
        await exec("/opt/homebrew/bin/ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y",
          "-f", "lavfi", "-i", "testsrc2=size=160x96:rate=5", "-t", "120", "-c:v", "libx264",
          "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-movflags", "+faststart", videoFile],
        { timeout: 60000, maxBuffer: 8192 });
        await chmod(videoFile, 0o600);
        const mp4 = await readFile(videoFile);
        expect(mp4.length).toBeGreaterThan(1000);
        const feed = createFeedService({ db, storage, enabled: () => true });
        const draft = await feed.create(owner, { clientRequestId: randomUUID() });
        postId = draft.id;
        const ticket = await feed.reserveUpload(owner, draft.id, {
          clientRequestId: randomUUID(), filename: "own-120.mp4", kind: "video",
          declaredMime: "video/mp4", declaredBytes: mp4.length,
        });
        expect(ticket.status).toBe("reserved");
        const raw = await db.feedUpload.findUniqueOrThrow({ where: { id: ticket.uploadId } });
        sourceKey = raw.sourceKey;
        const form = new FormData();
        for (const [key, value] of Object.entries(ticket.postFields!)) form.append(key, value);
        form.append("file", new Blob([mp4], { type: "video/mp4" }), "own-120.mp4");
        const response = await fetch(ticket.postUrl!, { method: "POST", body: form });
        expect(response.status).toBe(204);
        expect((await storage.head(sourceKey))?.bytes).toBe(mp4.length);
        expect((await feed.completeUpload(owner, ticket.uploadId)).status).toBe("uploaded");
        await feed.saveRevision(owner, draft.id, {
          clientRequestId: randomUUID(), expectedVersion: draft.version,
          text: "Длинный видео-момент", attachmentIds: [ticket.mediaId],
        });
        expect((await feed.publish(owner, draft.id, { clientRequestId: randomUUID() })).status)
          .toBe("pending");
        await expect(feed.get(reader, draft.id)).rejects.toMatchObject({ status: 404 });
        const jobs = createFeedStorageJobs({ db });
        const claimed = await jobs.claim(1, "video");
        expect(claimed).toHaveLength(1);
        expect(claimed[0]).toMatchObject({ ownerId: owner, postId: draft.id,
          uploadId: ticket.uploadId, mediaId: ticket.mediaId, kind: "publish_video" });
        const worker = await import("../../../../../apps/feed-cloud/src/worker.ts");
        const objects = await import("../../../../../apps/feed-cloud/src/objects.ts");
        const sharp = await import("../../../../../apps/feed-cloud/src/sharp-engine.ts");
        const cloud = worker.createFeedCloudWorker({
          core: {
            claimJobs: (count: number, kind?: "photo" | "video") => jobs.claim(count, kind),
            completeJob: (id: string, token: string, output?: Parameters<typeof jobs.complete>[2]) =>
              jobs.complete(id, token, output),
            failJob: (id: string, token: string, code?: string) => jobs.fail(id, token, code),
            renewJob: (id: string, token: string) => jobs.renew(id, token),
            maintenance: async () => { throw Error("UNAUTHORIZED_MAINTENANCE"); },
          }, objects: objects.createFeedCloudObjects(), engine: sharp.sharpFeedEngine,
        });
        expect(await cloud.process(claimed[0]!)).toEqual({ accepted: true });
        const media = await db.feedMediaAsset.findUniqueOrThrow({ where: { id: ticket.mediaId } });
        expect(media.status).toBe("ready");
        expect(media.durationSeconds).toBeGreaterThanOrEqual(119.5);
        expect(media.durationSeconds).toBeLessThanOrEqual(120);
        expect(media.videoSegmentKeys.length).toBe(60);
        expect(media.posterKey).toBeTruthy();
        expect(media.playlistKey).toBeTruthy();
        expect((await db.feedUpload.findUniqueOrThrow({ where: { id: ticket.uploadId } })).status)
          .toBe("ready");
        expect((await db.feedStorageJob.findUniqueOrThrow({ where: { id: claimed[0]!.id } })).status)
          .toBe("completed");
        const playlist = await storage.readPlaylist(media.playlistKey!);
        expect(playlist).toContain("#EXT-X-ENDLIST");
        expect(playlist).toContain("segment-000.ts");
        for (const key of [media.posterKey, media.videoSegmentKeys[0], media.videoSegmentKeys.at(-1)]) {
          const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key! }));
          expect(Number(object.ContentLength)).toBeGreaterThan(0);
          const data = Buffer.from(await object.Body!.transformToByteArray());
          expect(data.length).toBe(object.ContentLength);
          if (key!.endsWith(".ts")) expect(data[0]).toBe(0x47);
          else expect(data.subarray(0, 4).toString("ascii")).toBe("RIFF");
          const signed = await storage.signCdn({ key: key!, expiresAt: new Date(Date.now() + 180000) });
          expect((await fetch(signed)).status).toBe(200);
        }
        const visible = await feed.get(reader, draft.id);
        expect(visible.status).toBe("published");
        expect(visible.attachments).toHaveLength(1);
        expect(visible.attachments[0]?.kind).toBe("video");
        expect(visible.attachments[0]?.durationSeconds).toBeGreaterThanOrEqual(119.5);
        expect((await feed.get(reader, draft.id)).attachments[0]?.id).toBe(ticket.mediaId);
        await feed.remove(owner, draft.id);
        await expect(feed.get(reader, draft.id)).rejects.toMatchObject({ status: 404 });
        // Execute actual scheduled HLS cleanup after the signed POST expiry,
        // including crash-orphan segment keys through the shared 90 max.
        const cleanupClock = createFeedStorageJobs({ db,
          now: () => new Date(Date.now() + 2 * 60 * 60_000) });
        const cleanupClaims = await cleanupClock.claim(20, "photo");
        expect(cleanupClaims.some(job => job.kind === "delete_keys")).toBe(true);
        expect(cleanupClaims.every(job => job.ownerId === owner &&
          ["delete_keys", "cleanup_source"].includes(job.kind))).toBe(true);
        for (const job of cleanupClaims) {
          expect(await cloud.process(job)).toEqual({ accepted: true });
        }
        expect(await storage.head(sourceKey)).toBeNull();
        await expect(s3.send(new HeadObjectCommand({ Bucket: BUCKET,
          Key: media.playlistKey! }))).rejects.toMatchObject({
          $metadata: { httpStatusCode: 404 },
        });
        for (const key of [media.posterKey, ...media.videoSegmentKeys]) {
          await expect(s3.send(new HeadObjectCommand({ Bucket: BUCKET,
            Key: key! }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
        }
        console.warn("WEB4_OWN_120S_VIDEO_S3_HLS_PG_READY_PUBLIC_GET_DURABLE_CLEANUP_PASS");
      } finally {
        if (postId) {
          const prefixKey = `posts/${owner}/${postId}/`;
          const objects = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefixKey }));
          for (const { Key } of objects.Contents ?? []) {
            expect(Key?.startsWith(prefixKey), "UNSCOPED_S3_DELETE_DENIED").toBe(true);
            await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key }));
            await expect(s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key })))
              .rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
          }
          expect((await s3.send(new ListObjectsV2Command({ Bucket: BUCKET,
            Prefix: prefixKey }))).Contents ?? []).toHaveLength(0);
        }
        await s3.send(new DeleteBucketCommand({ Bucket: BUCKET }));
        await db.feedStorageJob.deleteMany({ where: { ownerId: owner } });
        for (const id of [owner, reader]) {
          const user = await db.user.findUnique({ where: { id }, select: { username: true } });
          if (user?.username.startsWith(prefix)) await db.user.delete({ where: { id } });
        }
        await db.$disconnect(); s3.destroy();
        await rm(temp, { recursive: true, force: false });
      }
    }, 180000);
  });
