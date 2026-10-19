import { Queue } from "bullmq";
import { connection } from "./redis.js";

/** Wake-ups only: authoritative media jobs and their leases are stored in Core. */
export const FEED_PROCESSING_QUEUE_NAME = "feed-processing-trigger";
// FeedUpload.id is a Prisma CUID (not a UUID). Match Core's feedIdSchema.
export const isFeedUploadId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export type FeedProcessingKind = "photo" | "video";
export interface FeedProcessingJobData {
  uploadId: string;
  kind: FeedProcessingKind;
}

export const feedProcessingQueue = new Queue<FeedProcessingJobData>(
  FEED_PROCESSING_QUEUE_NAME,
  { connection },
);

/** One wake-up per uploaded source. HTTP confirmations may be retried safely. */
export async function enqueueFeedProcessing(
  uploadId: string,
  kind: FeedProcessingKind,
): Promise<void> {
  if (!isFeedUploadId(uploadId) ||
      (kind !== "photo" && kind !== "video")) throw new Error("INVALID_FEED_PROCESSING_TRIGGER");
  await feedProcessingQueue.add(
    "process",
    { uploadId, kind },
    {
      jobId: `feed-${uploadId}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: true,
      removeOnFail: { count: 500 },
    },
  );
}
