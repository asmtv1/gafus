import { Queue } from "bullmq";
import { connection } from "./redis.js";

/** Best-effort immediate wake. Cloud.ru cron and immutable S3 staging own recovery. */
export const QUESTIONS_PROCESSING_QUEUE_NAME = "questions-processing-trigger";
export const questionsProcessingQueue = new Queue<{sourceId: string}>(
  QUESTIONS_PROCESSING_QUEUE_NAME, {connection},
);
export async function enqueueQuestionsProcessing(sourceId: string): Promise<void> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sourceId))
    throw new Error("INVALID_QUESTIONS_SOURCE_ID");
  await questionsProcessingQueue.add("process", {sourceId}, {
    jobId: "questions-" + sourceId, attempts: 5,
    backoff: {type: "exponential", delay: 3000},
    removeOnComplete: true, removeOnFail: {count: 500},
  });
}
