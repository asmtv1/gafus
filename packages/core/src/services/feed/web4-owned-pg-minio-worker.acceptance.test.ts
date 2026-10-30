import { describe, it, expect, vi } from "vitest";
// The real HTTP dispatcher is injected with own PG services; never connect
// to shared Redis as a side effect of importing @gafus/feed-server.
vi.mock("@gafus/queues", () => ({ connection: { status: "end" } }));
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import {
  S3Client, CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand,
  GetObjectCommand, HeadObjectCommand, ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
import { createFeedStorage } from "@gafus/feed-storage";
import { createFeedService } from "./service";
import { createFeedStorageJobs } from "./jobs";
import { createFeedPolls } from "./polls";
import { createFeedSocial } from "./social";
import { createFeedPreferences } from "./preferences";
import type { FeedDb } from "./ports";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const SCRATCH = `${ROOT}/.local-pg-scratch/web4-functional-pg18-20261026`;
const DB_URL = "postgresql://asmtv1@127.0.0.1:55946/feed_test";
const BUCKET = "gafus-refactor-feed-test";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGM4ECBHEmIY1RAwquHAcNUAADAxLhDqcDqfAAAAAElFTkSuQmCC", "base64");
const enabled = process.env.WEB4_OWN_PG_MINIO_WORKER === "1";
const require = createRequire(new URL("../../../../prisma/package.json", import.meta.url));
const Client = require("@prisma/client").PrismaClient as new (args: {
  datasources: { db: { url: string } };
}) => FeedDb & { $disconnect(): Promise<void> };

type Provider = ReturnType<typeof createFeedStorage>;
(enabled ? describe : describe.skip)("private own PG18 + MinIO + unmodified Sharp worker READY", () => {
  it("completes private signed photo publication, two identities, reload and physical cleanup", async () => {
    if (realpathSync(process.cwd()) !== ROOT || realpathSync(ROOT) !== ROOT ||
        realpathSync(tmpdir()) !== SCRATCH ||
        process.env.FEED_TEST_DATABASE_URL !== DB_URL ||
        process.env.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
        process.env.GAFUS_ISOLATED_S3_ENDPOINT !== "http://127.0.0.1:9000" ||
        process.env.GAFUS_ISOLATED_S3_FEED_BUCKET !== BUCKET ||
        process.env.GAFUS_LOCAL_ISOLATED_API !== "1" ||
        process.env.NODE_ENV !== "development") throw Error("OWN_PROVIDER_GUARD_DENIED");
    const local = isolatedNonprodS3Config("feed");
    expect(local).toMatchObject({ bucket: BUCKET, endpoint: "http://127.0.0.1:9000" });
    const db = new Client({ datasources: { db: { url: DB_URL } } });
    const s3 = new S3Client({ endpoint: local!.endpoint, forcePathStyle: true, region: "us-east-1",
      credentials: { accessKeyId: local!.accessKeyId, secretAccessKey: local!.secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
    const storage: Provider = createFeedStorage({ enabled: true, isolatedNonprod: true,
      ...local!, cdnBaseUrl: "", cdnSecret: "" });
    const owner = randomUUID(), reader = randomUUID();
    const prefix = `web4_own_e2e_${randomUUID().replace(/-/g, "")}`;
    let postId = "", source = "", mediaId = "";
    const ownKeys = new Set<string>();
    try {
      const existing = await db.feedStorageJob.count();
      expect(existing).toBe(0); // Exclusive fresh DB; never process unknown cleanup jobs.
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
      await db.user.createMany({ data: [owner, reader].map((id, n) => ({
        id, username: prefix + "_" + n, password: "fixture-no-login", registrationPending: false,
      })) });
      const feed = createFeedService({ db, storage, enabled: () => true });
      const polls = createFeedPolls({ db, storage, enabled: () => true });
      const social = createFeedSocial({ db, enabled: () => true });
      const preferences = createFeedPreferences({ db, enabled: () => true });
      // Original Hono feed route dispatcher; inject ONLY this fresh local DB,
      // never boot global API (its security preflight pins shared WORK PG).
      const { dispatchFeedRequest } = await import("../../../../../packages/feed-server/src/index.ts");
      const route = (actor: string, path: string, method = "GET", body?: object) =>
        dispatchFeedRequest(actor, new Request(`https://isolated.example/api/v1/feed${path}`, {
          method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" },
            body: JSON.stringify(body) }),
        }), new URL(`https://isolated.example/api/v1/feed${path}`).pathname
          .slice("/api/v1/feed".length), feed, social, preferences, polls,
        async () => { /* committed job is claimed directly by the owned worker */ });
      const draft = await feed.create(owner, { clientRequestId: randomUUID() });
      postId = draft.id;
      const ticket = await feed.reserveUpload(owner, postId, {
        clientRequestId: randomUUID(), filename: "photo.png", kind: "photo",
        declaredMime: "image/png", declaredBytes: PNG.length,
      });
      mediaId = ticket.mediaId;
      expect(ticket.status).toBe("reserved");
      expect(new URL(ticket.postUrl!).origin).toBe("http://127.0.0.1:9000");
      const record = await db.feedUpload.findUniqueOrThrow({ where: { id: ticket.uploadId } });
      source = record.sourceKey; ownKeys.add(source);
      const form = new FormData();
      for (const [key, value] of Object.entries(ticket.postFields!)) form.append(key, value);
      form.append("file", new Blob([PNG], { type: "image/png" }), "photo.png");
      const uploadResponse = await fetch(ticket.postUrl!, { method: "POST", body: form });
      expect(uploadResponse.status).toBe(204);
      expect((await storage.head(source))?.bytes).toBe(PNG.length);
      await expect(route(reader, `/uploads/${ticket.uploadId}`)).rejects.toMatchObject({ status: 404 });
      expect((await route(owner, `/uploads/${ticket.uploadId}`) as { status: string }).status)
        .toBe("reserved");
      const confirm = await feed.completeUpload(owner, ticket.uploadId);
      expect(confirm.status).toBe("uploaded");
      const attachedPoll = await polls.save(owner, postId, {
        expectedVersion: draft.version, question: "Какой питомец?",
        options: [{ text: "Собака" }, { text: "Кошка" }],
      });
      expect(attachedPoll.options).toHaveLength(2);
      await feed.saveRevision(owner, postId, { clientRequestId: randomUUID(),
        expectedVersion: draft.version, text: "Реальный фото-момент с опросом",
        attachmentIds: [mediaId] });
      const pending = await feed.publish(owner, postId, { clientRequestId: randomUUID() });
      expect(pending.status).toBe("pending");
      const ownPending = await route(owner, "/me/pending-posts?pageSize=20") as {
        items: { id: string }[];
      };
      expect(ownPending.items.some(item => item.id === postId)).toBe(true);
      await expect(route(reader, `/posts/${postId}`)).rejects.toMatchObject({ status: 404 });
      await expect(route(reader, `/posts/${postId}/editor`)).rejects.toMatchObject({ status: 404 });
      await expect(feed.get(reader, postId)).rejects.toMatchObject({ status: 404 });
      const jobs = createFeedStorageJobs({ db });
      const claim = await jobs.claim(1, "photo");
      expect(claim).toHaveLength(1);
      expect(claim[0]).toMatchObject({ ownerId: owner, postId, mediaId,
        uploadId: ticket.uploadId, kind: "publish_photo" });
      const worker = await import("../../../../../apps/feed-cloud/src/worker.ts");
      const objects = await import("../../../../../apps/feed-cloud/src/objects.ts");
      const sharp = await import("../../../../../apps/feed-cloud/src/sharp-engine.ts");
      const cloud = worker.createFeedCloudWorker({
        core: {
          claimJobs: (size: number, kind?: "photo" | "video") => jobs.claim(size, kind),
          completeJob: (id: string, token: string, output?: Parameters<typeof jobs.complete>[2]) =>
            jobs.complete(id, token, output),
          failJob: (id: string, token: string, code?: string) => jobs.fail(id, token, code),
          renewJob: (id: string, token: string) => jobs.renew(id, token),
          maintenance: async () => { throw Error("UNAUTHORIZED_MAINTENANCE"); },
        }, objects: objects.createFeedCloudObjects(), engine: sharp.sharpFeedEngine,
      });
      expect(await cloud.process(claim[0]!)).toEqual({ accepted: true });
      const finished = await db.feedMediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
      expect(finished.status).toBe("ready");
      expect((await db.feedUpload.findUniqueOrThrow({ where: { id: ticket.uploadId } })).status)
        .toBe("ready");
      for (const key of [finished.thumbKey, finished.fullKey]) {
        expect(typeof key).toBe("string"); ownKeys.add(key!);
        const output = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key! }));
        const payload = Buffer.from(await output.Body!.transformToByteArray());
        expect(payload.subarray(0, 4).toString("ascii")).toBe("RIFF");
        expect(output.ContentType).toBe("image/webp");
      }
      const visible = await feed.get(reader, postId);
      const routed = await route(reader, `/posts/${postId}`) as { id: string; status: string };
      expect(routed).toMatchObject({ id: postId, status: "published" });
      const pollFromRoute = await route(reader, `/posts/${postId}/poll`) as {
        question: string; options: unknown[];
      };
      expect(pollFromRoute.question).toBe("Какой питомец?");
      expect(pollFromRoute.options).toHaveLength(2);
      const pollBefore = await polls.get(reader, postId);
      expect(pollBefore.question).toBe("Какой питомец?");
      expect(pollBefore.options).toHaveLength(2);
      const voted = await polls.vote(reader, postId, {
        optionIds: [pollBefore.options[0]!.id],
      });
      expect(voted.myOptionIds).toContain(pollBefore.options[0]!.id);
      await expect(polls.vote(reader, postId, {
        optionIds: [pollBefore.options[0]!.id],
      })).rejects.toMatchObject({ status: 409 });
      expect(visible.status).toBe("published");
      expect(visible.attachments).toHaveLength(1);
      const attachment = visible.attachments[0]!;
      for (const url of [attachment.thumbUrl, attachment.fullUrl]) {
        expect(new URL(url!).origin).toBe("http://127.0.0.1:9000");
        const read = await fetch(url!);
        expect(read.status).toBe(200);
        expect(Buffer.from(await read.arrayBuffer()).subarray(0, 4).toString("ascii"))
          .toBe("RIFF");
      }
      // Real independent viewer reload without retaining client cache.
      const reloaded = await feed.get(reader, postId);
      expect(reloaded.id).toBe(postId);
      expect(reloaded.attachments[0]?.id).toBe(mediaId);
      await expect(route(reader, `/posts/${postId}`, "DELETE", {}))
        .rejects.toMatchObject({ status: 404 });
      expect(await route(owner, `/posts/${postId}`, "DELETE", {}))
        .toMatchObject({ id: postId });
      await expect(route(reader, `/posts/${postId}`)).rejects.toMatchObject({ status: 404 });
      await expect(feed.get(reader, postId)).rejects.toMatchObject({ status: 404 });
      await expect(polls.get(reader, postId)).rejects.toMatchObject({ status: 404 });
      // Model the signed-POST/lease safety window passing, then execute the
      // EXISTING durable cleanup jobs with the real S3 deleting worker.
      // This is our exclusive empty DB; no foreign queue entries can be claimed.
      const due = createFeedStorageJobs({ db,
        now: () => new Date(Date.now() + 2 * 60 * 60_000) });
      const cleanupClaims = await due.claim(20, "photo");
      expect(cleanupClaims.some(job => job.kind === "delete_keys")).toBe(true);
      expect(cleanupClaims.every(job => job.ownerId === owner &&
        ["delete_keys", "cleanup_source"].includes(job.kind))).toBe(true);
      for (const claim of cleanupClaims) {
        expect(await cloud.process(claim)).toEqual({ accepted: true });
      }
      for (const key of ownKeys) {
        expect(await storage.head(key)).toBeNull();
      }
      console.warn("WEB4_OWN_PG_MINIO_SHARP_POST_READY_GET_RELOAD_DURABLE_CLEANUP_PASS");
    } finally {
      for (const key of ownKeys) {
        // Fail closed: never delete a key outside our owned fixture.
        expect(postId, "OWN_POST_REQUIRED_FOR_CLEANUP").not.toBe("");
        expect(key.startsWith(`posts/${owner}/${postId}/`),
          "FOREIGN_KEY_DELETE_DENIED").toBe(true);
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
        await expect(s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })))
          .rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
      }
      const leftovers = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET,
        Prefix: `posts/${owner}/` }));
      expect(leftovers.Contents ?? []).toHaveLength(0);
      await s3.send(new DeleteBucketCommand({ Bucket: BUCKET }));
      await db.feedStorageJob.deleteMany({ where: { ownerId: owner } });
      for (const id of [owner, reader]) {
        const user = await db.user.findUnique({ where: { id }, select: { username: true } });
        if (user?.username.startsWith(prefix)) await db.user.delete({ where: { id } });
      }
      await db.$disconnect(); s3.destroy();
    }
  }, 90000);
});
