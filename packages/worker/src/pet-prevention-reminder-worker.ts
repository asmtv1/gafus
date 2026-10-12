import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { checkAndSendPetPreventionReminders } from "@gafus/core/services/petPrevention";
import { Worker } from "bullmq";
import type { Job } from "bullmq";

const logger = createWorkerLogger("pet-prevention-reminder");

export function startPetPreventionReminderWorker() {
  const worker = new Worker(
    "pet-prevention-reminder",
    async (job: Job) => {
      if (job.name !== "check-reminders") return;

      logger.info("🐕 Запуск проверки напоминаний о профилактике");

      const { sent, errors } = await checkAndSendPetPreventionReminders();

      logger.success("✅ Проверка напоминаний завершена", { sent, errors });
    },
    {
      connection,
      concurrency: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  );

  worker.on("completed", (job) => {
    logger.info("Задача завершена", { jobId: job.id });
  });

  worker.on("failed", (job, err) => {
    logger.error("Задача провалилась", err as Error, { jobId: job?.id });
  });

  logger.success("🚀 Pet prevention reminder worker запущен");
  return worker;
}
