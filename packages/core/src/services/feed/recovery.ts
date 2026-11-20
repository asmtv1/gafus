import type { FeedStoragePort } from "./ports";

/** Scalar DTO: Core is deliberately unaware of FeedUpload/Prisma models. */
export interface FeedRecoveryCandidate {
  id: string;
  ownerId: string;
  postId: string;
  mediaId: string;
  sourceKey: string;
  declaredBytes: number;
  declaredMime: string;
}

/** The server owns the entire serializable, row-locked transition to a Job.
 * Staging markers and ownership are rechecked under the same FeedPost lock.
 */
export interface FeedUploadRecoveryRowsPort {
  findReservedUploads(at: Date, limit: number): Promise<readonly FeedRecoveryCandidate[]>;
  rotateReservedUpload(id: string, at: Date): Promise<void>;
  confirmVerifiedSource(upload: FeedRecoveryCandidate, etag: string, now: () => Date): Promise<boolean>;
}

/** Recover missed client events from the persisted upload, never event-supplied object keys. */
export function createFeedUploadRecovery(input: {
  rows: FeedUploadRecoveryRowsPort;
  storage: Pick<FeedStoragePort, "head">;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  return {
    async run(batchSize = 20) {
      if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 20)
        throw new Error("INVALID_FEED_BATCH_SIZE");
      const uploads = await input.rows.findReservedUploads(now(), batchSize);
      let recovered = 0;
      for (const upload of uploads) {
        let metadata: Awaited<ReturnType<FeedStoragePort["head"]>>;
        try { metadata = await input.storage.head(upload.sourceKey); }
        catch { continue; }
        if (!metadata || metadata.bytes !== upload.declaredBytes || metadata.contentType !== upload.declaredMime) {
          // Rotate the bounded scan so unfinished uploads cannot starve later ones.
          await input.rows.rotateReservedUpload(upload.id, now());
          continue;
        }
        if (await input.rows.confirmVerifiedSource(upload, metadata.etag, now)) recovered++;
      }
      return { recovered };
    },
  };
}
