import { examCleanupQueue } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";

const logger = createWorkerLogger('exam-cleanup-schedule');

/**
 * Настройка ежедневного расписания для очистки видео экзаменов
 * Запускается каждую ночь в 03:00 (когда минимальная нагрузка)
 */
export async function setupExamCleanupSchedule() {
  try {
    logger.info("📅 Настройка расписания очистки видео экзаменов");

    // Удаляем старое расписание если есть
    const existingJobs = await examCleanupQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      await examCleanupQueue.removeRepeatableByKey(job.key);
      logger.info(`🗑️ Удалено старое расписание: ${job.key}`);
    }

    // Добавляем новое расписание
    // Cron: каждый день в 03:00 по московскому времени
    await examCleanupQueue.add(
      'daily-cleanup',
      {}, // Пустые данные, всю логику делает worker
      {
        repeat: {
          pattern: '0 3 * * *', // Каждый день в 03:00
          tz: 'Europe/Moscow'
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    );

    logger.success("✅ Расписание очистки видео настроено: каждый день в 03:00 MSK");

    // Также можно добавить задачу на первый запуск (опционально)
    await examCleanupQueue.add(
      'initial-cleanup',
      {},
      {
        delay: 60000 // Запустить через 1 минуту после старта
      }
    );

    logger.info("⏰ Начальная очистка запланирована через 1 минуту");
  } catch (error) {
    logger.error("❌ Ошибка при настройке расписания очистки", error as Error);
    throw error;
  }
}

