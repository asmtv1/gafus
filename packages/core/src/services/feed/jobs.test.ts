import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedDb } from "./ports";
import { createFeedStorageJobs } from "./jobs";

// Gafus wallet events are covered by their own transactional tests.
// This job-lease unit fixture intentionally mocks the economy tables.
vi.mock("../gafus/reactionRewardService", () => ({
  registerGafusPostPublicationTx: vi.fn(async () => undefined),
}));

const now = new Date("2026-10-09T11:00:00.000Z");
const job = {
  id: "job_1", ownerId: "alice", postId: "post_1", mediaId: "asset_1",
  uploadId: "upload_1", kind: "publish_photo" as const, status: "processing" as const,
  sourceKeys: ["posts/alice/post_1/incoming/upload_1/source.jpg"], targetKeys: [],
  attempts: 1, attemptToken: "123e4567-e89b-42d3-a456-426614174000",
  leaseUntil: new Date(now.getTime() + 60_000),
};
const output = {
  width: 1200, height: 700,
  smallKey: "media/v2/asset_1/v1/image/s.webp",
  thumbKey: "media/v2/asset_1/v1/image/m.webp",
  fullKey: "media/v2/asset_1/v1/image/l.webp",
};
function mockDb(options: {
  stale?: boolean; deleted?: boolean; mediaStatus?: string; pending?: boolean;
  attempts?: number; kind?: "publish_photo" | "publish_video" | "delete_keys" | "cleanup_source"; sourceKeys?: string[];
  uploadPurpose?: "post" | "comment";
} = {}) {
  const j = { ...job, attempts: options.attempts ?? job.attempts,
    kind: options.kind ?? job.kind, sourceKeys: options.sourceKeys ?? job.sourceKeys };
  const updates = vi.fn(async () => ({ count: 1 }));
  const mediaUpdate = vi.fn(async () => ({}));
  const published = vi.fn(async () => ({}));
  const media = { id: "asset_1", status: options.mediaStatus ?? "uploaded" };
  const post = {
    id: "post_1", authorId: "alice", deletedAt: options.deleted ? now : null,
    version: 1, publishedAt: null, activeRevisionId: null,
  };
  const tx = {
    feedAuthorPreference: { findMany: vi.fn(async () => []) },
    feedStorageJob: {
      findFirst: vi.fn(async () => options.stale ? null : j),
      updateMany: updates, upsert: vi.fn(async () => ({})),
    },
    $queryRaw: vi.fn(async () => [{ id: "post_1" }]),
    $executeRaw: vi.fn(async () => 1),
    feedPost: { findUnique: vi.fn(async () => post), update: published, updateMany: vi.fn(async () => ({ count: 1 })) },
    feedPoll: { findUnique: vi.fn(async () => null) },
    feedMediaAsset: { findFirst: vi.fn(async () => media), update: mediaUpdate, updateMany: vi.fn(async () => ({ count: 1 })) },
    feedUpload: { findUnique: vi.fn(async () => ({
      id: "upload_1", status: "uploaded", purpose: options.uploadPurpose ?? "post",
      mediaId: "asset_1", sourceKey: j.sourceKeys[0],
    })), update: vi.fn(async () => ({ postExpiresAt: now })), updateMany: vi.fn(async () => ({ count: 1 })) },
    feedPostRevision: { findFirst: vi.fn(async () => options.pending
      ? { id: "revision_1", attachments: [{ media }], status: "pending" } : null),
      update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const db = {
    $transaction: vi.fn(async (callback: (args: typeof tx) => Promise<unknown>) => callback(tx)),
    feedUpload: tx.feedUpload,
    feedStorageJob: {
      findMany: vi.fn(async () => [{ ...j, status: "pending", attemptToken: null }]),
      updateMany: updates,
    },
  } as unknown as FeedDb;
  return { worker: createFeedStorageJobs({ db, now: () => now }), db, tx, updates, mediaUpdate, published };
}
afterEach(() => vi.unstubAllEnvs());
describe("feed processing job lease and fencing", () => {
  it("issues a lease token atomically and restricts claims to 20", async () => {
    const { worker, updates } = mockDb();
    const claimed = await worker.claim(1);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ id: "job_1", kind: "publish_photo", attempts: 2 });
    expect(claimed[0]?.attemptToken).not.toEqual(job.attemptToken);
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "processing", attempts: { increment: 1 },
        attemptToken: expect.any(String), leaseUntil: new Date(now.getTime() + 120_000) }),
    }));
    await expect(worker.claim(21)).rejects.toThrow();
  });
  it("claims exactly one own retired S3 cleanup job, never another owner or worker kind", async () => {
    const x = mockDb({ kind: "delete_keys", sourceKeys: ["media/v2/asset_1/v1/image/l.webp"] });
    const bound = { jobId: job.id, ownerId: "alice", kind: "delete_keys" as const };
    const rows = await x.worker.claim(1, "photo", bound);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ownerId: "alice", kind: "delete_keys", id: job.id });
    expect(x.db.feedStorageJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: job.id, ownerId: "alice", kind: "delete_keys" }),
    }));
    expect(x.updates).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: job.id, ownerId: "alice", kind: "delete_keys" }),
    }));
    const foreign = mockDb({ kind: "delete_keys" });
    expect(await foreign.worker.claim(1,"photo",{jobId:job.id,ownerId:"stranger",kind:"delete_keys"})).toEqual([]);
    expect(foreign.updates).not.toHaveBeenCalled();
  });
  it("leases exactly the specified local photo or video job without claiming unrelated cleanup", async () => {
    const photo = mockDb({ kind: "publish_photo" });
    const scope = { jobId: job.id, ownerId: "alice", kind: "publish_photo" as const };
    const claimed = await photo.worker.claim(1, "photo", undefined, scope);
    expect(claimed).toHaveLength(1);
    expect(photo.db.feedStorageJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining(scope && { id: job.id, ownerId: "alice", kind: "publish_photo" }),
    }));
    expect(photo.updates).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: job.id, ownerId: "alice", kind: "publish_photo" }),
    }));
    const other = mockDb({ kind: "publish_photo" });
    expect(await other.worker.claim(1, "photo", undefined, {
      ...scope, ownerId: "another-user",
    })).toEqual([]);
    expect(other.updates).not.toHaveBeenCalled();
    await expect(photo.worker.claim(1, "video", undefined, scope)).rejects.toThrow();
    await expect(photo.worker.claim(1, "photo", undefined, {
      ...scope, jobId: "../unsafe",
    })).rejects.toThrow();
    await expect(photo.worker.claim(1, "photo", {
      jobId: job.id, ownerId: "alice", kind: "delete_keys",
    }, scope)).rejects.toThrow();
  });

  it("refuses invalid, conflicting and forbidden scoped cleanup before DB access", async () => {
    const x = mockDb({kind:"delete_keys"});
    for (const scope of [
      {jobId:"../foreign", ownerId:"alice",kind:"delete_keys" as const},
      {jobId:job.id,ownerId:"alice/../foreign",kind:"delete_keys" as const},
    ]) await expect(x.worker.claim(1,"photo",scope)).rejects.toThrow();
    await expect(x.worker.claim(1,"video",{jobId:job.id,ownerId:"alice",kind:"delete_keys"})).rejects.toThrow();
    expect(x.db.feedStorageJob.findMany).not.toHaveBeenCalled();
  });
  it("rejects outdated attempt without changing a media asset", async () => {
    const { worker, mediaUpdate } = mockDb({ stale: true });
    expect(await worker.complete(job.id, job.attemptToken, output)).toEqual({ accepted: false });
    expect(mediaUpdate).not.toHaveBeenCalled();
  });
  it("rejects incorrect output paths and missing required variants", async () => {
    const { worker, mediaUpdate } = mockDb();
    await expect(worker.complete(job.id, job.attemptToken, {
      ...output, fullKey: "posts/bob/post_1/attachments/asset_1/full.webp",
    })).rejects.toThrow("Некорректные ключи результата");
    await expect(worker.complete(job.id, job.attemptToken, {
      width: 800, height: 600,
    })).rejects.toThrow("Неполная обработка WebP");
    expect(mediaUpdate).not.toHaveBeenCalled();
  });
  it("does not activate an asset after post deletion", async () => {
    const { worker, mediaUpdate } = mockDb({ deleted: true });
    expect(await worker.complete(job.id, job.attemptToken, output)).toEqual({ accepted: false });
    expect(mediaUpdate).not.toHaveBeenCalled();
  });
  it("atomically promotes accepted media and a fully ready revision", async () => {
    const { worker, mediaUpdate, published, tx, updates } = mockDb({ pending: true });
    expect(await worker.complete(job.id, job.attemptToken, output)).toEqual({ accepted: true });
    expect(mediaUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ready", thumbKey: output.thumbKey, fullKey: output.fullKey }),
    }));
    expect(published).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "published", activeRevisionId: "revision_1" }),
    }));
    expect(tx.feedPostRevision.update).toHaveBeenCalled();
    expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { status: "completed", attemptToken: null, leaseUntil: null },
    }));
  });
  it("marks a comment attachment ready without activating the parent post revision", async () => {
    const { worker, mediaUpdate, published, tx } = mockDb({ pending: true, uploadPurpose: "comment" });
    expect(await worker.complete(job.id, job.attemptToken, output)).toEqual({ accepted: true });
    expect(mediaUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ready" }),
    }));
    expect(tx.feedPostRevision.findFirst).not.toHaveBeenCalled();
    expect(published).not.toHaveBeenCalled();
  });
  it("terminalises a repeatedly failed comment upload without failing its parent post", async () => {
    const { worker, tx } = mockDb({ attempts: 5, uploadPurpose: "comment" });
    expect(await worker.claim(1)).toEqual([]);
    expect(tx.feedMediaAsset.updateMany).toHaveBeenCalled();
    expect(tx.feedPostRevision.updateMany).not.toHaveBeenCalled();
    expect(tx.feedPost.updateMany).not.toHaveBeenCalled();
  });
  it("accepts one 120-second MP4 rendition and rejects excessive durations or untrusted files", async () => {
    const mp4Keys = ["media/v2/asset_1/v1/video/360.mp4", "media/v2/asset_1/v1/video/720.mp4"];
    const valid = { width: 1280, height: 720, durationSeconds: 120,
      posterKey: "media/v2/asset_1/v1/poster.webp", mp4Keys };
    const v = mockDb({ kind: "publish_video", sourceKeys: ["posts/alice/post_1/incoming/upload_1/source.mp4"] });
    expect(await v.worker.complete(job.id, job.attemptToken, valid)).toEqual({ accepted: true });
    expect(v.mediaUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ready", durationSeconds: 120, mp4Keys }),
    }));
    for (const invalid of [{ ...valid, durationSeconds: 120.001 },
      { ...valid, mp4Keys: [] },
      { ...valid, mp4Keys: [...mp4Keys, "media/v2/asset_1/v1/video/private.mp4"] }]) {
      const x = mockDb({ kind: "publish_video", sourceKeys: ["posts/alice/post_1/incoming/upload_1/source.mp4"] });
      await expect(x.worker.complete(job.id, job.attemptToken, invalid)).rejects.toThrow();
      expect(x.mediaUpdate).not.toHaveBeenCalled();
    }
  });
  it("atomically enqueues Beget CDN purge after an authorized individual S3 delete callback", async () => {
    vi.stubEnv("FEED_CDN_PROVIDER", "beget");
    vi.stubEnv("FEED_S3_ENDPOINT", "https://s3.cloud.ru");
    const key = "media/v2/asset_1/v1/image/l.webp";
    const { worker, tx, updates } = mockDb({ kind: "delete_keys", sourceKeys: [key] });
    expect(await worker.complete(job.id, job.attemptToken)).toEqual({ accepted: true });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(vi.mocked(tx.$executeRaw).mock.calls[0]!.slice(1)).toEqual([
      "feed:job_1", "feed", ["/" + key],
    ]);
    expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { status: "completed", attemptToken: null, leaseUntil: null },
    }));
  });
  it("never terminalises private object deletion after the fifth failed attempt", async () => {
    const { worker, tx, updates } = mockDb({ kind: "delete_keys", attempts: 5 });
    expect(await worker.claim(1)).toHaveLength(1);
    expect(tx.feedMediaAsset.updateMany).not.toHaveBeenCalled();
    expect(await worker.fail(job.id, job.attemptToken)).toEqual({ accepted: true });
    expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "pending" }),
    }));
  });
  it("terminalises jobs whose final leased attempt crashed", async () => {
    const { worker, tx } = mockDb({ attempts: 5 });
    expect(await worker.claim(1)).toEqual([]);
    expect(tx.feedStorageJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "failed", attemptToken: null }),
    }));
    expect(tx.feedMediaAsset.updateMany).toHaveBeenCalled();
  });
  it("retries failed processing with backoff and stops after five attempts", async () => {
    const low = mockDb();
    expect(await low.worker.fail(job.id, job.attemptToken)).toEqual({ accepted: true });
    expect(low.updates).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "pending", attemptToken: null,
        availableAt: new Date(now.getTime() + 60_000) }),
    }));
    const exhausted = mockDb({ attempts: 5 });
    expect(await exhausted.worker.fail(job.id, job.attemptToken)).toEqual({ accepted: true });
    expect(exhausted.updates).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "failed" }),
    }));
    expect(exhausted.tx.feedMediaAsset.updateMany).toHaveBeenCalled();
  });
  it("independently verifies all three WebP objects before READY", async () => {
    const { db, mediaUpdate } = mockDb();
    const head = vi.fn(async (key: string) => ({
      etag: `etag-${key}`, bytes: 512, contentType: "image/webp",
    }));
    const worker = createFeedStorageJobs({ db, now: () => now, storage: { head } });
    expect(await worker.complete(job.id, job.attemptToken, output)).toEqual({ accepted: true });
    expect(head.mock.calls.map(([key]) => key).sort()).toEqual(
      [output.smallKey, output.thumbKey, output.fullKey].sort(),
    );
    expect(mediaUpdate).toHaveBeenCalledOnce();
  });
  it("refuses READY when any uploaded WebP is missing or wrongly labelled", async () => {
    for (const variant of [null, { etag: "ok", bytes: 1, contentType: "video/mp4" }]) {
      const { db, mediaUpdate } = mockDb();
      const head = vi.fn(async (key: string) => key === output.fullKey ? variant :
        { etag: "ok", bytes: 512, contentType: "image/webp" });
      const worker = createFeedStorageJobs({ db, now: () => now, storage: { head } });
      await expect(worker.complete(job.id, job.attemptToken, output))
        .rejects.toThrow("Вариант медиа не подтверждён в S3");
      expect(mediaUpdate).not.toHaveBeenCalled();
    }
  });
  it("schedules original deletion immediately after READY rather than upload URL expiry", async () => {
    const { worker, tx } = mockDb();
    await worker.complete(job.id, job.attemptToken, output);
    expect(tx.feedStorageJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { dedupeKey: "feed-source-cleanup:upload_1" },
      create: expect.objectContaining({ kind: "cleanup_source", availableAt: now,
        sourceKeys: job.sourceKeys }),
    }));
  });
  it("persists idempotent source and partial rendition cleanup after terminal failure", async () => {
    const { worker, tx } = mockDb({ attempts: 5 });
    expect(await worker.fail(job.id, job.attemptToken)).toEqual({ accepted: true });
    expect(tx.feedStorageJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { dedupeKey: "feed-terminal-cleanup:job_1" },
      create: expect.objectContaining({ kind: "delete_keys", sourceKeys: expect.arrayContaining([
        job.sourceKeys[0],
        "media/v2/asset_1/v1/image/s.webp",
        "media/v2/asset_1/v1/image/m.webp",
        "media/v2/asset_1/v1/image/l.webp",
      ]), availableAt: new Date(now.getTime() + 11 * 60_000) }),
      update: {},
    }));
  });
  it("cleans crashed exhausted video jobs without ever deleting source albums", async () => {
    const { worker, tx } = mockDb({ attempts: 5, kind: "publish_video",
      sourceKeys: ["posts/alice/post_1/incoming/upload_1/source.mp4"] });
    expect(await worker.claim(1, "video")).toEqual([]);
    expect(tx.feedStorageJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ sourceKeys: expect.arrayContaining([
        "media/v2/asset_1/v1/poster.webp",
        "media/v2/asset_1/v1/video/360.mp4",
        "media/v2/asset_1/v1/video/720.mp4",
      ]) }),
    }));
  });
});
