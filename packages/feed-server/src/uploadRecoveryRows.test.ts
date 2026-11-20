/** SQL-owner regression: the whole recovery transition is one Post-locked tx. */
import { describe, expect, it, vi } from "vitest";
import type { FeedDb } from "@gafus/media-shared/media-db-ports";
import { createFeedUploadRecoveryRows } from "./uploadRecoveryRows.js";
const at = new Date("2026-10-09T12:00:00Z");
const upload = {
  id: "upload", ownerId: "owner", postId: "post", mediaId: "media",
  sourceKey: "posts/owner/post/incoming/upload/source.mp4",
  declaredBytes: 100, declaredMime: "video/mp4",
};
function setup(options: { deleted?: boolean; claimed?: boolean; staged?: boolean } = {}) {
  const query = vi.fn(async () => [{ id: "post" }]);
  const post = vi.fn(async () => options.deleted ? null : { id: "post" });
  const claim = vi.fn(async () => ({ count: options.claimed ? 0 : 1 }));
  const stage = vi.fn(async () => options.staged ? { id: "client-poster" } : null);
  const jobs = vi.fn(async () => ({}));
  const media = vi.fn(async () => ({ count: 1 }));
  const tx = {
    $queryRaw: query,
    feedPost: { findFirst: post },
    feedUpload: { updateMany: claim },
    feedStorageJob: { findUnique: stage, upsert: jobs },
    feedMediaAsset: { updateMany: media },
  };
  const findMany = vi.fn(async () => [upload]);
  const rotate = vi.fn(async () => ({ count: 1 }));
  const transaction = vi.fn(async (cb: (context: typeof tx) => Promise<unknown>) => cb(tx));
  const db = {
    feedUpload: { findMany, updateMany: rotate }, $transaction: transaction,
  } as unknown as FeedDb;
  return { rows: createFeedUploadRecoveryRows(db), query, post, claim, stage, jobs, media, findMany, rotate, transaction };
}
describe("FeedUpload SQL recovery rows", () => {
  it("selects only live reserved videos in stable bounded order", async () => {
    const x = setup();
    await x.rows.findReservedUploads(at, 17);
    expect(x.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { status: "reserved", reservationExpiresAt: { gt: at },
        declaredMime: { in: ["video/mp4", "video/quicktime", "video/webm"] } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 17,
    });
  });
  it("locks the post and verifies owner before one durable video processing job", async () => {
    const x = setup();
    await expect(x.rows.confirmVerifiedSource(upload, "etag", () => at)).resolves.toBe(true);
    expect(x.transaction).toHaveBeenCalledOnce();
    expect(x.query).toHaveBeenCalledOnce();
    expect(x.post).toHaveBeenCalledExactlyOnceWith({ where: { id: "post", authorId: "owner", deletedAt: null } });
    expect(x.claim).toHaveBeenCalledWith({
      where: { id: "upload", status: "reserved", reservationExpiresAt: { gt: at } },
      data: { status: "uploaded", sourceETag: "etag" },
    });
    expect(x.media).toHaveBeenCalledOnce();
    expect(x.jobs).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      where: { dedupeKey: "feed-process:upload" },
      create: expect.objectContaining({ ownerId: "owner", postId: "post", uploadId: "upload", kind: "publish_video" }),
      update: {},
    }));
  });
  it("never steals a client-first staged MP4 and rotates under the post lock", async () => {
    const x = setup({ staged: true });
    await expect(x.rows.confirmVerifiedSource(upload, "etag", () => at)).resolves.toBe(false);
    expect(x.stage).toHaveBeenCalledExactlyOnceWith({
      where: { dedupeKey: "feed-client-video-staging:upload" }, select: { id: true },
    });
    expect(x.claim).toHaveBeenCalledExactlyOnceWith({
      where: { id: "upload", status: "reserved" }, data: { updatedAt: at },
    });
    expect(x.jobs).not.toHaveBeenCalled();
    expect(x.media).not.toHaveBeenCalled();
  });
  it.each([{ deleted: true }, { claimed: true }])("fences stale reservation %s without a job", async options => {
    const x = setup(options);
    await expect(x.rows.confirmVerifiedSource(upload, "etag", () => at)).resolves.toBe(false);
    expect(x.jobs).not.toHaveBeenCalled();
    expect(x.media).not.toHaveBeenCalled();
  });
  it("rotates only the reserved upload, not another user's status", async () => {
    const x = setup();
    await x.rows.rotateReservedUpload("upload", at);
    expect(x.rotate).toHaveBeenCalledExactlyOnceWith({ where: { id: "upload", status: "reserved" }, data: { updatedAt: at } });
  });
});
