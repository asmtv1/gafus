import { Queue } from "bullmq";
import { connection } from "./redis.js";

/** Durable wake-up for Cloud.ru processing. The photo and its leases live in Core. */
export const GALLERY_PROCESSING_QUEUE_NAME = "gallery-processing-trigger";

export interface GalleryProcessingJobData {
  uploadId: string;
}

export const galleryProcessingQueue = new Queue<GalleryProcessingJobData>(
  GALLERY_PROCESSING_QUEUE_NAME,
  { connection },
);

/** Dedupe repeated HTTP confirmation attempts without exposing Cloud.ru credentials. */
export async function enqueueGalleryProcessing(uploadId: string): Promise<void> {
  if (!/^[a-f0-9-]{36}$/i.test(uploadId)) throw new Error("INVALID_GALLERY_UPLOAD_ID");
  await galleryProcessingQueue.add(
    "process",
    { uploadId },
    {
      // Coalesce a hundred uploads in the same second into one wake-up.
      // Uploads remain independently durable in Core's PostgreSQL queue.
      jobId: `gallery-wake-${Math.floor(Date.now() / 1000)}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: true,
      removeOnFail: { count: 500 },
    },
  );
}


// Retry a large Gallery backlog after existing executions claim their work.
// The synthetic identifier is not an upload ID and never reaches Core.
export async function enqueueGalleryFollowUp(delayMs = 5000): Promise<void> {
  if (!Number.isInteger(delayMs) || delayMs < 1000 || delayMs > 60_000)
    throw Error("INVALID_GALLERY_FOLLOWUP_DELAY");
  await galleryProcessingQueue.add("follow-up", { uploadId: "gallery-follow-up" }, {
    jobId: "gallery-resume-" + Math.floor((Date.now() + delayMs) / 5000),
    delay: delayMs,
    attempts: 5,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: true,
    removeOnFail: { count: 500 },
  });
}
