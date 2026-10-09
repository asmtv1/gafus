import { describe, expect, it, vi } from "vitest";
import { createFeedUploadRecovery } from "./recovery";
import type { FeedDb } from "./ports";
const at = new Date("2026-10-09T12:00:00Z");
function setup(options: { missing?: boolean; deleted?: boolean; claimed?: boolean; failure?: boolean } = {}) {
  const upload = { id: "upload", ownerId: "owner", postId: "post", mediaId: "media", sourceKey: "posts/owner/post/incoming/upload/source.jpg",
    declaredBytes: 100, declaredMime: "image/jpeg" };
  const head = vi.fn(async () => {
    if (options.failure) throw new Error("storage unavailable");
    return options.missing ? null : { etag: "etag", bytes: 100, contentType: "image/jpeg" };
  });
  const jobs = vi.fn(async () => ({}));
  const changed = vi.fn(async () => ({ count: options.claimed ? 0 : 1 }));
  const tx = { $queryRaw: vi.fn(async () => [{ id: "post" }]),
    feedPost: { findFirst: vi.fn(async () => options.deleted ? null : { id: "post" }) },
    feedUpload: { updateMany: changed }, feedMediaAsset: { updateMany: vi.fn(async () => ({ count: 1 })) },
    feedStorageJob: { upsert: jobs } };
  const touch = vi.fn(async () => ({ count: 1 }));
  const db = { feedUpload: { findMany: vi.fn(async () => [upload]), updateMany: touch },
    $transaction: vi.fn(async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx)) } as unknown as FeedDb;
  return { recovery: createFeedUploadRecovery({ db, storage: { head }, now: () => at }), jobs, touch, tx };
}
describe("feed upload recovery", () => {
  it("turns a verified registered source into exactly one processing job", async () => {
    const { recovery, jobs, tx } = setup();
    expect(await recovery.run()).toEqual({ recovered: 1 });
    expect(tx.feedUpload.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "uploaded", sourceETag: "etag" } }));
    expect(jobs).toHaveBeenCalledWith(expect.objectContaining({ where: { dedupeKey: "feed-process:upload" } }));
  });
  it("rotates missing objects without scheduling processing", async () => {
    const { recovery, jobs, touch } = setup({ missing: true });
    expect(await recovery.run()).toEqual({ recovered: 0 });
    expect(touch).toHaveBeenCalled(); expect(jobs).not.toHaveBeenCalled();
  });
  it.each([{ deleted: true }, { claimed: true }, { failure: true }])("does not revive invalid uploads %s", async options => {
    const { recovery, jobs } = setup(options);
    expect(await recovery.run()).toEqual({ recovered: 0 }); expect(jobs).not.toHaveBeenCalled();
  });
});
