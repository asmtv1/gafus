import { describe, expect, it, vi } from "vitest";
import type { FeedDb } from "./ports";
import { createFeedMaintenance } from "./maintenance";
const now = new Date("2026-10-09T12:00:00Z");

function dbFake(changed = true) {
  const upsert = vi.fn(async () => ({}));
  const uploadUpdateMany = vi.fn(async () => ({ count: changed ? 1 : 0 }));
  const postUpdateMany = vi.fn(async () => ({ count: changed ? 1 : 0 }));
  const tx = {
    feedUpload: { updateMany: uploadUpdateMany, findMany: vi.fn(async () => [{
      sourceKey: "posts/u/p/incoming/upload_1/source.jpg", postExpiresAt: now,
    }]) },
    feedMediaAsset: { updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => [{ id: "media_1", thumbKey: "posts/u/p/attachments/media_1/thumb.webp",
        fullKey: null, posterKey: null, playlistKey: null, videoSegmentKeys: [] }]) },
    feedStorageJob: { upsert, findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 1 })) },
    feedPost: { updateMany: postUpdateMany },
  };
  const client = {
    $transaction: async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx),
    feedUpload: { findMany: vi.fn(async () => [{
      id: "upload_1", ownerId: "u", postId: "p", mediaId: "m",
      sourceKey: "posts/u/p/incoming/upload_1/source.jpg",
    }]) },
    feedPost: { findMany: vi.fn(async () => [{
      id: "p", authorId: "u", status: "draft",
    }]) },
  } as unknown as FeedDb;
  return { client, upsert, postUpdateMany, uploadUpdateMany, tx };
}
describe("feed cleanup while feature is off", () => {
  it("expires old upload and enqueues cleanup without public access", async () => {
    const db = dbFake();
    expect(await createFeedMaintenance({ db: db.client, now: () => now }).expireUploads(1))
      .toEqual({ expired: 1 });
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { dedupeKey: "feed-expired-upload:upload_1" },
      create: expect.objectContaining({ kind: "delete_keys" }),
    }));
  });
  it("removes stale private draft and preserves storage cleanup keys", async () => {
    const db = dbFake();
    expect(await createFeedMaintenance({ db: db.client, now: () => now }).deleteStaleDrafts(1))
      .toEqual({ deleted: 1 });
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { dedupeKey: "feed-cleanup:expired-draft:p" },
      create: expect.objectContaining({ sourceKeys: expect.arrayContaining([
        "posts/u/p/incoming/upload_1/source.jpg",
        "posts/u/p/attachments/media_1/thumb.webp",
      ]) }),
    }));
  });
  it("skips a draft refreshed concurrently", async () => {
    const db = dbFake(false);
    expect(await createFeedMaintenance({ db: db.client, now: () => now }).deleteStaleDrafts(1))
      .toEqual({ deleted: 0 });
    expect(db.upsert).not.toHaveBeenCalled();
  });
  it("bounds cleanup batches", async () => {
    const db = dbFake();
    const worker = createFeedMaintenance({ db: db.client, now: () => now });
    await expect(worker.expireUploads(51)).rejects.toThrow();
    await expect(worker.deleteStaleDrafts(0)).rejects.toThrow();
  });
});
