import { connection, GALLERY_PROCESSING_QUEUE_NAME } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { Worker, type Job } from "bullmq";
import { createGalleryDemandDispatcher } from "./gallery-demand";

const logger = createWorkerLogger("gallery-processing-trigger");

/**
 * A confirmed gallery upload wakes the Cloud.ru processor without waiting for
 * the once-per-minute media cron. Core still owns durable leases and recovery.
 */
export function startGalleryProcessingTriggerWorker(): void {
  if (process.env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true" ||
      process.env.GALLERY_PROCESSOR_READY !== "true") return;

  let dispatch: ReturnType<typeof createGalleryDemandDispatcher>;
  try {
    dispatch = createGalleryDemandDispatcher();
  } catch {
    logger.error("Gallery trigger configuration unavailable", new Error("GALLERY_TRIGGER_CONFIG_UNSAFE"));
    return;
  }
  const worker = new Worker<{ uploadId: string }>(
    GALLERY_PROCESSING_QUEUE_NAME,
    async (job: Job<{ uploadId: string }>) => {
      if (job.data.uploadId !== "gallery-follow-up" &&
          !/^[a-f0-9-]{36}$/i.test(job.data.uploadId))
        throw new Error("INVALID_GALLERY_UPLOAD_ID");
      const started = performance.now();
      const queuedMs = Math.max(0, Date.now() - job.timestamp);
      const result = await dispatch();
      logger.info("Gallery Cloud.ru dispatch timing", {
        queuedMs, dispatchMs: Math.round(performance.now() - started),
      });
      if (result.coalesced || result.idle || result.blocked || result.dispatched > 0)
        return;
      throw new Error("GALLERY_PROCESS_TRIGGER_NOT_DISPATCHED");
    },
    {
      connection,
      concurrency: 1,
      // Bound provider launch rate during multi-file uploads; Core drains
      // up to ten uploads per invocation and skips duplicate leases.
      limiter: { max: 1, duration: 1500 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  );
  worker.on("failed", (_job, error) => {
    logger.error("Gallery immediate processing trigger failed", error);
  });
  worker.on("error", (error) => {
    logger.error("Gallery immediate processing worker error", error);
  });
  logger.success("Gallery immediate processing trigger worker started");
}
