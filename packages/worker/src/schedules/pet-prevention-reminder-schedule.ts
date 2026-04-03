import { petPreventionReminderQueue } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";

const logger = createWorkerLogger("pet-prevention-reminder-schedule");

/**
 * Настройка ежедневного расписания напоминаний о профилактике питомцев
 * Запускается каждый день в 09:00 по Москве
 */
export async function setupPetPreventionReminderSchedule() {
  try {
    logger.info("📅 Настройка расписания напоминаний о профилактике питомцев");

    const existingJobs = await petPreventionReminderQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      await petPreventionReminderQueue.removeRepeatableByKey(job.key);
      logger.info(`🗑️ Удалено старое расписание: ${job.key}`);
    }

    await petPreventionReminderQueue.add(
      "check-reminders",
      {},
      {
        repeat: {
          pattern: "*/30 * * * *",
          tz: "Europe/Moscow",
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    logger.success("✅ Расписание напоминаний о профилактике настроено: каждые 30 мин MSK");
  } catch (error) {
    logger.error("❌ Ошибка при настройке расписания напоминаний", error as Error);
    throw error;
  }
}
