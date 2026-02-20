import { consentLogCleanupQueue } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";

const logger = createWorkerLogger("consent-log-cleanup-schedule");

export async function setupConsentLogCleanupSchedule(): Promise<void> {
  try {
    logger.info("Настройка расписания очистки ConsentLog");

    const existingJobs = await consentLogCleanupQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      await consentLogCleanupQueue.removeRepeatableByKey(job.key);
      logger.info(`Удалено старое расписание: ${job.key}`);
    }

    await consentLogCleanupQueue.add(
      "daily-cleanup",
      {},
      {
        repeat: { pattern: "0 2 * * *", tz: "Europe/Moscow" },
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 1,
      },
    );

    logger.success(
      "Расписание очистки ConsentLog настроено: каждый день в 02:00 MSK",
    );

    await consentLogCleanupQueue.add("initial-cleanup", {}, { delay: 60000 });

    logger.info("Начальная очистка ConsentLog запланирована через 1 минуту");
  } catch (error) {
    logger.error(
      "Ошибка при настройке расписания очистки ConsentLog",
      error as Error,
    );
    throw error;
  }
}
