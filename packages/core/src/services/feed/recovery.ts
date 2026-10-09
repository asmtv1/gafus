import type { FeedDb, FeedStoragePort } from "./ports";
/** Restore missed client completion/events using registered uploads, never an object key from an event. */
export function createFeedUploadRecovery(input: { db: FeedDb; storage: Pick<FeedStoragePort, "head">; now?: () => Date }) {
  const now = input.now ?? (() => new Date());
  return {
    async run(batchSize = 20) {
      if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 20) throw new Error("INVALID_FEED_BATCH_SIZE");
      const at = now();
      const uploads = await input.db.feedUpload.findMany({
        where: { status: "reserved", reservationExpiresAt: { gt: at } },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: batchSize,
      });
      let recovered = 0;
      for (const upload of uploads) {
        let metadata: Awaited<ReturnType<FeedStoragePort["head"]>>;
        try { metadata = await input.storage.head(upload.sourceKey); }
        catch { continue; }
        if (!metadata || metadata.bytes !== upload.declaredBytes || metadata.contentType !== upload.declaredMime) {
          // Rotate the bounded scan so an unfinished early upload cannot starve later ones.
          await input.db.feedUpload.updateMany({ where: { id: upload.id, status: "reserved" }, data: { updatedAt: now() } });
          continue;
        }
        await input.db.$transaction(async tx => {
          await tx.$queryRaw`SELECT "id" FROM "FeedPost" WHERE "id" = ${upload.postId} FOR UPDATE`;
          const post = await tx.feedPost.findFirst({ where: { id: upload.postId, authorId: upload.ownerId, deletedAt: null } });
          if (!post) return;
          const changed = await tx.feedUpload.updateMany({
            where: { id: upload.id, status: "reserved", reservationExpiresAt: { gt: now() } },
            data: { status: "uploaded", sourceETag: metadata.etag },
          });
          if (changed.count !== 1) return;
          await tx.feedMediaAsset.updateMany({ where: { id: upload.mediaId, status: "reserved" }, data: { status: "uploaded" } });
          await tx.feedStorageJob.upsert({ where: { dedupeKey: `feed-process:${upload.id}` },
            create: { dedupeKey: `feed-process:${upload.id}`, ownerId: upload.ownerId, postId: upload.postId,
              uploadId: upload.id, mediaId: upload.mediaId, sourceKeys: [upload.sourceKey],
              kind: upload.declaredMime.startsWith("image/") ? "publish_photo" : "publish_video", availableAt: now() }, update: {},
          });
          recovered++;
        });
      }
      return { recovered };
    },
  };
}
