import { describe, expect, it, vi } from "vitest";
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
  thumbKey: "posts/alice/post_1/attachments/asset_1/thumb.webp",
  fullKey: "posts/alice/post_1/attachments/asset_1/full.webp",
};
function mockDb(options: {
  stale?: boolean; deleted?: boolean; mediaStatus?: string; pending?: boolean;
  attempts?: number;
} = {}) {
  const j = { ...job, attempts: options.attempts ?? job.attempts };
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
    feedPost: { findUnique: vi.fn(async () => post), update: published, updateMany: vi.fn(async () => ({ count: 1 })) },
    feedPoll: { findUnique: vi.fn(async () => null) },
    feedMediaAsset: { findFirst: vi.fn(async () => media), update: mediaUpdate, updateMany: vi.fn(async () => ({ count: 1 })) },
    feedUpload: { findUnique: vi.fn(async () => ({
      id: "upload_1", status: "uploaded", mediaId: "asset_1", sourceKey: job.sourceKeys[0],
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
    })).rejects.toThrow("Неполная обработка фотографии");
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
});
