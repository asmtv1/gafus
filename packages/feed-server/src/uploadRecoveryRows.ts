/** Authoritative SQL owner for reservation recovery. The source HEAD was
 * validated by Core, but all post/owner/staging/CAS checks run again here.
 */
import type { FeedDb } from "@gafus/media-shared/media-db-ports";
import type { FeedUploadRecoveryRowsPort } from "@gafus/core/services/feed";

export function createFeedUploadRecoveryRows(db: FeedDb): FeedUploadRecoveryRowsPort {
  return {
    findReservedUploads(at, limit) {
      return db.feedUpload.findMany({
        where: { status: "reserved", reservationExpiresAt: { gt: at },
          declaredMime: { in: ["video/mp4", "video/quicktime", "video/webm"] } },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: limit,
      });
    },
    async rotateReservedUpload(id, at) {
      await db.feedUpload.updateMany({ where: { id, status: "reserved" }, data: { updatedAt: at } });
    },
    confirmVerifiedSource(upload, etag, now) {
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "FeedPost" WHERE "id" = ${upload.postId} FOR UPDATE`;
        const post = await tx.feedPost.findFirst({
          where: { id: upload.postId, authorId: upload.ownerId, deletedAt: null },
        });
        if (!post) return false;
        // Client-first MP4 is exclusively completed by POST /uploads/:id/complete.
        // Never claim it here, even if the client has already staged a poster.
        if (upload.declaredMime === "video/mp4") {
          const staged = await tx.feedStorageJob.findUnique({
            where: { dedupeKey: `feed-client-video-staging:${upload.id}` },
            select: { id: true },
          });
          if (staged) {
            // Rotate inside the post lock; never starve a legacy reservation.
            await tx.feedUpload.updateMany({
              where: { id: upload.id, status: "reserved" },
              data: { updatedAt: now() },
            });
            return false;
          }
        }
        const changed = await tx.feedUpload.updateMany({
          where: { id: upload.id, status: "reserved", reservationExpiresAt: { gt: now() } },
          data: { status: "uploaded", sourceETag: etag },
        });
        if (changed.count !== 1) return false;
        await tx.feedMediaAsset.updateMany({
          where: { id: upload.mediaId, status: "reserved" }, data: { status: "uploaded" },
        });
        await tx.feedStorageJob.upsert({
          where: { dedupeKey: `feed-process:${upload.id}` },
          create: { dedupeKey: `feed-process:${upload.id}`, ownerId: upload.ownerId,
            postId: upload.postId, uploadId: upload.id, mediaId: upload.mediaId,
            sourceKeys: [upload.sourceKey], kind: "publish_video", availableAt: now() },
          update: {},
        });
        return true;
      });
    },
  };
}
