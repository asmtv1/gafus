import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { processConsultationEmailLog } from "@gafus/core/services/consultation";
import type { Job } from "bullmq";
import { Worker } from "bullmq";

const logger = createWorkerLogger("consultation-mail-worker");

interface MailJobData {
  emailLogId: string;
}

export function startConsultationMailWorker(): void {
  const worker = new Worker<MailJobData>(
    "consultation-mail",
    async (job: Job<MailJobData>) => {
      const { emailLogId } = job.data;
      const outcome = await processConsultationEmailLog(emailLogId);
      if (outcome === "missing") logger.warn("email log missing", { emailLogId });
    },
    {
      connection,
      concurrency: 2,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );
  worker.on("error", (err) => {
    logger.error("consultation-mail worker error", err);
  });
  logger.success("consultation-mail worker запущен");
}
