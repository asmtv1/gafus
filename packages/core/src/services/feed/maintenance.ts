import { enqueueFeedPostCleanup } from "./cleanup";
import type { FeedDb } from "./ports";
import { FEED_LIMITS } from "../../../../types/src/feed";

/** Cleanup is intentionally independent from FEED_ENABLED and its processor-ready flag. */
export function createFeedMaintenance({ db, now = () => new Date() }: {
  db: FeedDb;
  now?: () => Date;
}) {
  async function expireUploads(limit = 20) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("INVALID_MAINTENANCE_LIMIT");
    const at = now();
    const rows = await db.feedUpload.findMany({
      where: { status: "reserved", reservationExpiresAt: { lt: at } },
      orderBy: [{ reservationExpiresAt: "asc" }, { id: "asc" }], take: limit,
    });
    let expired = 0;
    for (const upload of rows) {
      await db.$transaction(async tx => {
        const changed = await tx.feedUpload.updateMany({
          where: { id: upload.id, status: "reserved", reservationExpiresAt: { lt: at } },
          data: { status: "expired", leaseUntil: null, attemptToken: null },
        });
        if (!changed.count) return;
        await tx.feedMediaAsset.updateMany({
          where: { id: upload.mediaId, status: "reserved" }, data: { status: "expired" },
        });
        await tx.feedStorageJob.upsert({
          where: { dedupeKey: `feed-expired-upload:${upload.id}` },
          create: {
            dedupeKey: `feed-expired-upload:${upload.id}`,
            ownerId: upload.ownerId, postId: upload.postId, uploadId: upload.id,
            mediaId: upload.mediaId, kind: "delete_keys", sourceKeys: [upload.sourceKey],
          },
          update: {},
        });
        expired++;
      });
    }
    return { expired };
  }
  async function deleteStaleDrafts(limit = 20) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("INVALID_MAINTENANCE_LIMIT");
    const at = now();
    const cutoff = new Date(at.getTime() - FEED_LIMITS.pendingDraftSeconds * 1000);
    const rows = await db.feedPost.findMany({
      where: { status: "draft", activeRevisionId: null, deletedAt: null, updatedAt: { lt: cutoff } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: limit,
    });
    let deleted = 0;
    for (const post of rows) {
      await db.$transaction(async tx => {
        const changed = await tx.feedPost.updateMany({
          where: { id: post.id, status: "draft", activeRevisionId: null, deletedAt: null,
            updatedAt: { lt: cutoff } },
          data: { status: "deleted", deletedAt: at },
        });
        if (!changed.count) return;
        await enqueueFeedPostCleanup(tx, post.id, post.authorId, at, "expired-draft");
        await tx.feedUpload.updateMany({
          where: { postId: post.id, status: { in: ["reserved", "uploaded", "processing"] } },
          data: { status: "cancelled", leaseUntil: null, attemptToken: null },
        });
        deleted++;
      });
    }
    return { deleted };
  }
  async function run(batchSize = 20) {
    const uploads = await expireUploads(batchSize);
    const drafts = await deleteStaleDrafts(batchSize);
    return { ...uploads, ...drafts };
  }
  return { expireUploads, deleteStaleDrafts, run };
}
