import {connection, QUESTIONS_PROCESSING_QUEUE_NAME} from "@gafus/queues";
import {createWorkerLogger} from "@gafus/logger";
import {Worker, type Job} from "bullmq";
import {createCloudruMediaDispatcher} from "./cloudru-media-dispatcher";

const logger = createWorkerLogger("questions-processing-trigger");

/** A wake-up only. Originals and processing state are durable in Cloud.ru S3
 * and GAFUS QuestionPhoto, so no queue message is required for recovery.
 */
export function startQuestionsProcessingTriggerWorker() {
  if (process.env.CLOUDRU_MEDIA_JOBS_ENABLED !== "true" ||
      process.env.QUESTIONS_PROCESSOR_READY !== "true" ||
      process.env.QUESTIONS_CLOUD_JOB_ENABLED !== "true") return;
  const dispatch = createCloudruMediaDispatcher(
    process.env, fetch, ["gafus-questions-photo"],
  );
  const worker = new Worker<{sourceId:string}>(
    QUESTIONS_PROCESSING_QUEUE_NAME,
    async (job: Job<{sourceId:string}>) => {
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(job.data.sourceId))
        throw new Error("QUESTIONS_INVALID_SOURCE_ID");
      const result = await dispatch();
      if (result.dispatched !== 1) throw new Error("QUESTIONS_PROCESSOR_NOT_DISPATCHED");
    },
    {connection, concurrency: 1, limiter: {max: 1, duration: 1000},
      removeOnComplete: {count:100}, removeOnFail: {count:500}},
  );
  worker.on("failed", (_job,error) => logger.error("Questions processing trigger failed", error));
  worker.on("error", error => logger.error("Questions processing worker error", error));
}
