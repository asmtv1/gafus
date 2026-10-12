import { listExamVideosEligibleForCleanup, markExpiredExamVideoDeleted } from "@gafus/core/services/exam";
import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { deleteFileFromCDN } from "@gafus/cdn-upload";
import type { Job } from "bullmq";
import { Worker } from "bullmq";

const logger = createWorkerLogger("exam-cleanup-worker");

// Конфигурация
const config = {
  worker: {
    concurrency: 2, // Параллельная обработка 2 задач
    removeOnComplete: { count: 1000 }, // Храним последние 1000 успешных
    removeOnFail: { count: 100 }, // Храним последние 100 неудачных
  },
} as const;

/**
 * Сервис для очистки старых видео экзаменов
 */
class ExamCleanupProcessor {
  private logger = logger;

  /**
   * Очистка старых видео по правилам:
   * 1. Зачтенные (COMPLETED) → удалять через 30 дней
   * 2. Незачтенные (IN_PROGRESS) → удалять через 90 дней
   */
  async cleanupOldVideos(): Promise<{ deleted: number; errors: number }> {
    this.logger.info("🧹 Начинаем очистку старых видео экзаменов");

    let deleted = 0;
    let errors = 0;

    try {
      const { completed: completedExams, pending: pendingExams } =
        await listExamVideosEligibleForCleanup(new Date());
      this.logger.info(`Зачтенных видео к очистке: ${completedExams.length}; незачтенных: ${pendingExams.length}`);

      // 3. Удаляем видео для зачтенных экзаменов
      for (const exam of completedExams) {
        if (!exam.userStepId || !exam.userStep) {
          this.logger.warn("⚠️ Пропускаем зачтенный экзамен без связанного userStep", {
            examId: exam.id,
          });
          errors++;
          continue;
        }

        try {
          await this.deleteExamVideo(
            exam.videoReportUrl!,
            exam.userStepId,
            "auto_cleanup_completed",
            exam.userStep.userTraining.user.username,
          );
          deleted++;
        } catch (error) {
          this.logger.error(
            `❌ Ошибка при удалении видео для зачтенного экзамена ${exam.id}`,
            error as Error,
          );
          errors++;
        }
      }

      // 4. Удаляем видео для незачтенных экзаменов
      for (const exam of pendingExams) {
        if (!exam.userStepId || !exam.userStep) {
          this.logger.warn("⚠️ Пропускаем незачтенный экзамен без связанного userStep", {
            examId: exam.id,
          });
          errors++;
          continue;
        }

        try {
          await this.deleteExamVideo(
            exam.videoReportUrl!,
            exam.userStepId,
            "auto_cleanup_pending",
            exam.userStep.userTraining.user.username,
          );
          deleted++;
        } catch (error) {
          this.logger.error(
            `❌ Ошибка при удалении видео для незачтенного экзамена ${exam.id}`,
            error as Error,
          );
          errors++;
        }
      }

      this.logger.success(`✅ Очистка завершена. Удалено: ${deleted}, Ошибок: ${errors}`);

      return { deleted, errors };
    } catch (error) {
      this.logger.error("❌ Критическая ошибка при очистке видео", error as Error);
      throw error;
    }
  }

  /**
   * Удаляет видео с CDN и обновляет запись в БД
   */
  private async deleteExamVideo(
    videoUrl: string,
    userStepId: string,
    reason: string,
    username: string,
  ): Promise<void> {
    try {
      // Извлекаем относительный путь из CDN URL
      const relativePath = videoUrl.replace(
        "https://gafus-media.storage.yandexcloud.net/uploads/",
        "",
      );

      this.logger.info(
        `🗑️ Удаляем видео: ${relativePath} (пользователь: ${username}, причина: ${reason})`,
      );

      // Удаляем файл с CDN
      await deleteFileFromCDN(relativePath);

      // Обновляем запись в БД
      const cleared = await markExpiredExamVideoDeleted({
        userStepId, expectedUrl: videoUrl, reason, deletedAt: new Date(),
      });
      if (!cleared) {
        this.logger.warn("В БД уже выбран другой файл для экзамена", { userStepId });
      }

      this.logger.success(`✅ Видео успешно удалено: ${relativePath}`);
    } catch (error) {
      this.logger.error(`❌ Ошибка при удалении видео: ${videoUrl}`, error as Error);
      throw error;
    }
  }
}

// Worker для обработки задач очистки
class ExamCleanupWorker {
  private worker: Worker;
  private processor: ExamCleanupProcessor;
  private logger = logger;

  constructor() {
    this.processor = new ExamCleanupProcessor();

    this.worker = new Worker("exam-cleanup", this.processJob.bind(this), {
      connection,
      concurrency: config.worker.concurrency,
      removeOnComplete: config.worker.removeOnComplete,
      removeOnFail: config.worker.removeOnFail,
    });

    this.setupEventHandlers();
  }

  private async processJob(job: Job): Promise<void> {
    try {
      this.logger.info("🧹 Запуск задачи очистки видео", { jobId: job.id });

      const result = await this.processor.cleanupOldVideos();

      this.logger.success("✅ Задача очистки завершена", {
        jobId: job.id,
        deleted: result.deleted,
        errors: result.errors,
      });
    } catch (error) {
      this.logger.error("❌ Задача очистки провалилась", error as Error, {
        jobId: job.id,
      });
      throw error; // BullMQ автоматически retry
    }
  }

  private setupEventHandlers(): void {
    this.worker.on("completed", (job) => {
      this.logger.success("✅ Задача очистки завершена", { jobId: job.id });
    });

    this.worker.on("failed", (job, err) => {
      this.logger.error("❌ Задача очистки провалилась", err as Error, {
        jobId: job?.id,
      });
    });

    this.worker.on("error", (err) => {
      this.logger.error("❌ Ошибка worker'а", err as Error);
    });

    this.worker.on("stalled", (jobId) => {
      this.logger.warn("⚠️ Задача зависла", { jobId });
    });
  }

  public start(): void {
    this.logger.success("🚀 Exam cleanup worker запущен", {
      concurrency: config.worker.concurrency,
      removeOnComplete: config.worker.removeOnComplete,
      removeOnFail: config.worker.removeOnFail,
    });
  }
}

// Экспортируем для использования в index.ts
export function startExamCleanupWorker() {
  const worker = new ExamCleanupWorker();
  worker.start();
  return worker;
}

// Если файл запущен напрямую
if (require.main === module) {
  logger.info("🚀 Запуск exam-cleanup-worker процесса...");

  try {
    startExamCleanupWorker();
  } catch (error) {
    logger.error("❌ Не удалось запустить exam-cleanup-worker", error as Error);
    process.exit(1);
  }
}
