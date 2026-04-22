import { processBookingSlaTimeout } from "@gafus/core/services/consultation";
import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import type { Job } from "bullmq";
import { Worker } from "bullmq";

const logger = createWorkerLogger("consultation-sla-worker");

interface SlaJobData {
  bookingId: string;
}

export function startConsultationSlaWorker(): void {
  const worker = new Worker<SlaJobData>(
    "consultation-sla",
    async (job: Job<SlaJobData>) => {
      const { bookingId } = job.data;
      logger.info("SLA job", { bookingId });
      await processBookingSlaTimeout(bookingId);
    },
    {
      connection,
      concurrency: 4,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );
  worker.on("error", (err) => {
    logger.error("consultation-sla worker error", err);
  });
  logger.success("consultation-sla worker запущен");
}
