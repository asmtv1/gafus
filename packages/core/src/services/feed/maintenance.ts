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
  // A user can abandon a comment after the object was already processed.
  // Do not let those orphaned objects live indefinitely in the shared S3 bucket.
  async function deleteOrphanCommentUploads(limit = 20) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("INVALID_MAINTENANCE_LIMIT");
    const at = now();
    const cutoff = new Date(at.getTime() - FEED_LIMITS.pendingDraftSeconds * 1000);
    const rows = await db.feedUpload.findMany({
      where: { purpose: "comment", createdAt: { lt: cutoff },
        status: { in: ["uploaded", "processing", "ready", "failed", "expired"] },
        media: { commentAttachments: { none: {} } },
      },
      select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit,
    });
    let orphaned = 0;
    for (const row of rows) {
      await db.$transaction(async tx => {
        // createComment locks the same upload; recheck ownership after locking.
        await tx.$queryRaw`SELECT "id" FROM "FeedUpload" WHERE "id" = ${row.id} FOR UPDATE`;
        const upload = await tx.feedUpload.findFirst({
          where: { id: row.id, purpose: "comment", createdAt: { lt: cutoff },
            status: { in: ["uploaded", "processing", "ready", "failed", "expired"] },
            media: { commentAttachments: { none: {} } },
          }, include: { media: true },
        });
        if (!upload) return;
        const changed = await tx.feedUpload.updateMany({
          where: { id: upload.id, purpose: "comment",
            status: { in: ["uploaded", "processing", "ready", "failed", "expired"] } },
          data: { status: "cancelled", attemptToken: null, leaseUntil: null },
        });
        if (!changed.count) return;
        await tx.feedMediaAsset.updateMany({
          where: { id: upload.mediaId }, data: { status: "cancelled" },
        });
        const asset = upload.media;
        const base = "media/v2/" + asset.id + "/v1/";
        const keys = [upload.sourceKey, asset.smallKey, asset.thumbKey,
          asset.fullKey, asset.posterKey, ...asset.mp4Keys,
          ...["image/s.webp", "image/m.webp", "image/l.webp",
            "poster.webp", "video/360.mp4", "video/720.mp4", "video/1080.mp4"]
            .map(name => base + name),
        ].filter((key): key is string => !!key);
        await tx.feedStorageJob.upsert({
          where: { dedupeKey: "feed-orphan-comment:" + upload.id },
          create: {
            dedupeKey: "feed-orphan-comment:" + upload.id,
            ownerId: upload.ownerId, postId: upload.postId,
            uploadId: upload.id, mediaId: upload.mediaId,
            kind: "delete_keys", sourceKeys: [...new Set(keys)],
            availableAt: new Date(Math.max(at.getTime(), upload.postExpiresAt.getTime(),
              upload.reservationExpiresAt.getTime(), upload.leaseUntil?.getTime() ?? 0) + 60_000),
          }, update: {},
        });
        orphaned++;
      });
    }
    return { orphaned };
  }
  async function run(batchSize = 20) {
    const uploads = await expireUploads(batchSize);
    const drafts = await deleteStaleDrafts(batchSize);
    const comments = await deleteOrphanCommentUploads(batchSize);
    return { ...uploads, ...drafts, ...comments };
  }
  return { expireUploads, deleteStaleDrafts, deleteOrphanCommentUploads, run };
}
