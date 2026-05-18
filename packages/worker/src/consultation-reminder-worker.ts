import { processConsultationReminder } from "@gafus/core/services/consultation";
import type { ConsultationReminderKind } from "@gafus/queues";
import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import type { Job } from "bullmq";
import { Worker } from "bullmq";

const logger = createWorkerLogger("consultation-reminder-worker");

interface ReminderJobData {
  bookingId: string;
  kind?: ConsultationReminderKind;
}

export function startConsultationReminderWorker(): void {
  const worker = new Worker<ReminderJobData>(
    "consultation-reminder",
    async (job: Job<ReminderJobData>) => {
      const { bookingId, kind = "30m" } = job.data;
      logger.info("consultation reminder job", { bookingId, kind });
      await processConsultationReminder(bookingId, kind);
    },
    {
      connection,
      concurrency: 4,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );
  worker.on("error", (err) => {
    logger.error("consultation-reminder worker error", err);
  });
  logger.success("consultation-reminder worker запущен");
}
