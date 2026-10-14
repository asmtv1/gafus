import { connection, FEED_PROCESSING_QUEUE_NAME } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { Worker, type Job } from "bullmq";
import { createCloudruFeedPoolDispatcher } from "./cloudru-media-dispatcher";

const logger = createWorkerLogger("feed-processing-trigger");
interface FeedJob {
  uploadId: string;
  kind: "photo" | "video";
}

/**
 * Wake only the processor for the verified upload type. The Container Job
 * claims Core's durable processing jobs; this queue never processes media.
 * The minute-based dispatcher remains the recovery path for failed wake-ups.
 */
export function startFeedProcessingTriggerWorker(): void {
  if (process.env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true" ||
      process.env.FEED_PROCESSOR_READY !== "true") return;

  let photo: ReturnType<typeof createCloudruFeedPoolDispatcher>;
  let video: ReturnType<typeof createCloudruFeedPoolDispatcher>;
  try {
    photo = createCloudruFeedPoolDispatcher("photo");
    video = createCloudruFeedPoolDispatcher("video");
  } catch {
    // Feed must not prevent unrelated worker processes from starting.
    logger.error(
      "Feed trigger configuration unavailable",
      new Error("FEED_TRIGGER_CONFIG_UNSAFE"),
    );
    return;
  }

  const worker = new Worker<FeedJob>(
    FEED_PROCESSING_QUEUE_NAME,
    async (job: Job<FeedJob>) => {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(job.data.uploadId))
        throw new Error("INVALID_FEED_UPLOAD_ID");
      if (job.data.kind !== "photo" && job.data.kind !== "video")
        throw new Error("INVALID_FEED_PROCESSING_KIND");
      const result = await (job.data.kind === "photo" ? photo : video)();
      if (result.dispatched !== 1) throw new Error("FEED_PROCESS_TRIGGER_NOT_DISPATCHED");
    },
    {
      connection,
      concurrency: 1,
      // Up to two Cloud.ru launches per second; preserve serial dispatch
      // and Core's authoritative claims/leases to avoid duplicate processing.
      // BullMQ retries temporary provider errors with exponential backoff.
      limiter: { max: 1, duration: 500 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  );
  worker.on("failed", (_job, error) => {
    logger.error("Feed immediate processing trigger failed", error);
  });
  worker.on("error", (error) => {
    logger.error("Feed immediate processing worker error", error);
  });
  logger.success("Feed immediate processing trigger worker started");
}
