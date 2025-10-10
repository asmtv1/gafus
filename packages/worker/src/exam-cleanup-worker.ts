import { prisma } from "@gafus/prisma";
import { connection, examCleanupQueue } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { deleteFileFromCDN } from "@gafus/cdn-upload";
import type { Job } from "bullmq";
import { Worker } from "bullmq";

const logger = createWorkerLogger('exam-cleanup-worker');

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

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    let deleted = 0;
    let errors = 0;

    try {
      // 1. Находим зачтенные экзамены старше 30 дней с видео
      const completedExams = await prisma.examResult.findMany({
        where: {
          videoReportUrl: { not: null },
          videoDeletedAt: null, // Видео еще не удалено
          userStep: { status: "COMPLETED" },
          updatedAt: { lt: thirtyDaysAgo }
        },
        select: {
          id: true,
          userStepId: true,
          videoReportUrl: true,
          userStep: {
            select: {
              status: true,
              userTraining: {
                select: {
                  user: { select: { username: true } }
                }
              }
            }
          }
        }
      });

      this.logger.info(`📋 Найдено ${completedExams.length} зачтенных экзаменов старше 30 дней для удаления`);

      // 2. Находим незачтенные экзамены старше 90 дней с видео
      const pendingExams = await prisma.examResult.findMany({
        where: {
          videoReportUrl: { not: null },
          videoDeletedAt: null,
          userStep: { status: "IN_PROGRESS" },
          createdAt: { lt: ninetyDaysAgo }
        },
        select: {
          id: true,
          userStepId: true,
          videoReportUrl: true,
          userStep: {
            select: {
              status: true,
              userTraining: {
                select: {
                  user: { select: { username: true } }
                }
              }
            }
          }
        }
      });

      this.logger.info(`📋 Найдено ${pendingExams.length} незачтенных экзаменов старше 90 дней для удаления`);

      // 3. Удаляем видео для зачтенных экзаменов
      for (const exam of completedExams) {
        try {
          await this.deleteExamVideo(
            exam.videoReportUrl!,
            exam.userStepId,
            'auto_cleanup_completed',
            exam.userStep.userTraining.user.username
          );
          deleted++;
        } catch (error) {
          this.logger.error(`❌ Ошибка при удалении видео для зачтенного экзамена ${exam.id}`, error as Error);
          errors++;
        }
      }

      // 4. Удаляем видео для незачтенных экзаменов
      for (const exam of pendingExams) {
        try {
          await this.deleteExamVideo(
            exam.videoReportUrl!,
            exam.userStepId,
            'auto_cleanup_pending',
            exam.userStep.userTraining.user.username
          );
          deleted++;
        } catch (error) {
          this.logger.error(`❌ Ошибка при удалении видео для незачтенного экзамена ${exam.id}`, error as Error);
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
    username: string
  ): Promise<void> {
    try {
      // Извлекаем относительный путь из CDN URL
      const relativePath = videoUrl.replace('https://gafus-media.storage.yandexcloud.net/uploads/', '');
      
      this.logger.info(`🗑️ Удаляем видео: ${relativePath} (пользователь: ${username}, причина: ${reason})`);

      // Удаляем файл с CDN
      await deleteFileFromCDN(relativePath);

      // Обновляем запись в БД
      await prisma.examResult.update({
        where: { userStepId },
        data: {
          videoReportUrl: null,
          videoDeletedAt: new Date(),
          videoDeleteReason: reason
        }
      });

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
        errors: result.errors
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

