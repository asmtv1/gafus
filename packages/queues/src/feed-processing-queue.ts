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
      // Aggregate up to one Photo wake-up per second across all users.
      // Every upload has its OWN durable Core DB record; BullMQ is a nudge.
      // Videos retain per-upload wake-ups, and Core recovery runs every minute.
      jobId: kind === "photo"
        ? `feed-photo-wake-${Math.floor(Date.now() / 1000)}`
        : `feed-${uploadId}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: true,
      removeOnFail: { count: 500 },
    },
  );
}

/** One delayed follow-up per bounded batch, not one per user upload.
 * It rechecks durable Core work, not this synthetic wake identifier.
 */
export async function enqueueFeedPhotoFollowUp(delayMs = 5000): Promise<void> {
  if (!Number.isInteger(delayMs) || delayMs < 1000 || delayMs > 60_000)
    throw Error("INVALID_FEED_PHOTO_FOLLOWUP_DELAY");
  await feedProcessingQueue.add("photo-follow-up", {
    uploadId: "feed-photo-resume", kind: "photo",
  }, {
    jobId: "feed-photo-resume-" + Math.floor((Date.now() + delayMs) / 5000),
    delay: delayMs,
    attempts: 5, backoff: {type: "exponential", delay: 3000},
    removeOnComplete: true, removeOnFail: {count: 500},
  });
}
