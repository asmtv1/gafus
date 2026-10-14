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
      jobId: `gallery-${uploadId}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: true,
      removeOnFail: { count: 500 },
    },
  );
}
