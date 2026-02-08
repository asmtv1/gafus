/**
 * Worker для обработки re-engagement уведомлений
 * Обрабатывает задачи из очереди reengagement
 */

import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { PushNotificationService } from "@gafus/webpush";
import { prisma } from "@gafus/prisma";
import {
  getCampaignData,
  updateCampaignAfterSend,
  createNotificationRecord,
  closeCampaign,
} from "@gafus/reengagement";
import {
  collectUserData,
  selectMessageVariant,
  personalizeMessage,
  validatePersonalizedMessage,
} from "@gafus/reengagement";
import type { ReengagementJobData } from "@gafus/reengagement";

const logger = createWorkerLogger("reengagement-worker");

/**
 * Основной класс worker для обработки re-engagement задач
 */
class ReengagementWorker {
  private worker: Worker;
  private pushService: PushNotificationService;

  constructor() {
    // Инициализировать сервис отправки push
    this.pushService = PushNotificationService.fromEnvironment();

    // Создать worker
    this.worker = new Worker("reengagement", this.processJob.bind(this), {
      connection,
      concurrency: 5,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    });

    this.setupEventHandlers();
  }

  /**
   * Обработать задачу из очереди
   */
  private async processJob(job: Job<ReengagementJobData>): Promise<void> {
    const { campaignId, userId, level } = job.data;

    try {
      logger.info("Начало обработки re-engagement задачи", {
        jobId: job.id,
        campaignId,
        userId,
        level,
      });

      // 1. Получить данные кампании
      const campaignData = await getCampaignData(campaignId);

      if (!campaignData) {
        logger.warn("Кампания не найдена", { campaignId });
        return;
      }

      // Проверить, что кампания активна
      const campaign = await prisma.reengagementCampaign.findUnique({
        where: { id: campaignId },
        select: {
          isActive: true,
          returned: true,
          unsubscribed: true,
        },
      });

      if (!campaign) {
        logger.warn("Кампания не найдена в БД", { campaignId });
        return;
      }

      if (!campaign.isActive) {
        logger.info("Кампания неактивна, пропускаем", { campaignId });
        return;
      }

      if (campaign.returned) {
        logger.info("Пользователь уже вернулся, закрываем кампанию", { campaignId });
        await closeCampaign(campaignId, true);
        return;
      }

      if (campaign.unsubscribed) {
        logger.info("Пользователь отписался, закрываем кампанию", { campaignId });
        await closeCampaign(campaignId, false);
        return;
      }

      // 2. Собрать данные пользователя
      const userData = await collectUserData(userId);

      if (!userData) {
        logger.warn("Не удалось собрать данные пользователя", { userId });
        return;
      }

      // 3. Выбрать вариант сообщения
      const messageVariant = selectMessageVariant(level, userData, campaignData.sentVariantIds);

      if (!messageVariant) {
        logger.warn("Нет доступных вариантов сообщения", {
          userId,
          level,
          sentVariantsCount: campaignData.sentVariantIds.length,
        });
        return;
      }

      logger.info("Выбран вариант сообщения", {
        variantId: messageVariant.id,
        type: messageVariant.type,
      });

      // 4. Персонализировать сообщение
      const personalizedMessage = personalizeMessage(messageVariant, userData);

      // Валидация
      if (!validatePersonalizedMessage(personalizedMessage)) {
        logger.error(
          "Ошибка валидации персонализированного сообщения",
          new Error("Validation failed"),
          {
            variantId: messageVariant.id,
          },
        );
        return;
      }

      // 5. Создать запись уведомления в БД
      const notificationId = await createNotificationRecord(
        campaignId,
        level,
        messageVariant.type,
        messageVariant.id,
        personalizedMessage.title,
        personalizedMessage.body,
        personalizedMessage.url,
      );

      logger.info("Создана запись уведомления", { notificationId });

      // 6. Получить push-подписки пользователя
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId },
        select: {
          endpoint: true,
          keys: true,
        },
      });

      if (subscriptions.length === 0) {
        logger.warn("У пользователя нет активных push-подписок", { userId });

        // Обновить кампанию как отправленную (даже если нет подписок)
        await updateCampaignAfterSend(campaignId, notificationId, 0, 0);
        return;
      }

      logger.info(`Найдено ${subscriptions.length} активных подписок`, { userId });

      // 7. Преобразовать подписки в формат для отправки
      const pushSubscriptions = subscriptions
        .map((sub) => {
          const keysRaw = sub.keys as unknown;

          if (
            keysRaw &&
            typeof keysRaw === "object" &&
            !Array.isArray(keysRaw) &&
            "p256dh" in keysRaw &&
            "auth" in keysRaw &&
            typeof (keysRaw as { p256dh: string; auth: string }).p256dh === "string" &&
            typeof (keysRaw as { p256dh: string; auth: string }).auth === "string"
          ) {
            const keys = keysRaw as { p256dh: string; auth: string };
            return {
              endpoint: sub.endpoint,
              keys: {
                p256dh: keys.p256dh,
                auth: keys.auth,
              },
            };
          }

          return null;
        })
        .filter(
          (sub): sub is { endpoint: string; keys: { p256dh: string; auth: string } } =>
            sub !== null,
        );

      // 8. Подготовить payload для отправки
      const payload = {
        title: personalizedMessage.title,
        body: personalizedMessage.body,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/badge-72x72.png",
        data: {
          ...personalizedMessage.data,
          notificationId, // Для отслеживания кликов
          url: personalizedMessage.url,
        },
      };

      logger.info("Отправка push-уведомлений", {
        userId,
        subscriptionsCount: pushSubscriptions.length,
      });

      // 9. Отправить уведомления
      const result = await this.pushService.sendNotifications(pushSubscriptions, payload);

      logger.success("Push-уведомления отправлены", {
        userId,
        sent: result.successCount,
        failed: result.failureCount,
      });

      // 10. Обработать неудачные подписки
      const invalidEndpoints = result.results
        .filter((r) => !r.success && PushNotificationService.shouldDeleteSubscription(r.error))
        .map((r) => r.endpoint);

      if (invalidEndpoints.length > 0) {
        await prisma.pushSubscription.deleteMany({
          where: {
            endpoint: {
              in: invalidEndpoints,
            },
          },
        });

        logger.info(`Удалено ${invalidEndpoints.length} недействительных подписок`, { userId });
      }

      // 11. Обновить кампанию
      await updateCampaignAfterSend(
        campaignId,
        notificationId,
        result.successCount,
        result.failureCount,
      );

      logger.success("Re-engagement задача завершена", {
        jobId: job.id,
        campaignId,
        userId,
        level,
        sent: result.successCount,
        failed: result.failureCount,
      });
    } catch (error) {
      logger.error("Ошибка обработки re-engagement задачи", error as Error, {
        jobId: job.id,
        campaignId,
        userId,
        level,
      });
      throw error; // BullMQ автоматически retry
    }
  }

  /**
   * Настроить обработчики событий worker
   */
  private setupEventHandlers(): void {
    this.worker.on("completed", (job) => {
      logger.success("Задача завершена", { jobId: job.id });
    });

    this.worker.on("failed", (job, err) => {
      logger.error("Задача провалилась", err as Error, {
        jobId: job?.id,
      });
    });

    this.worker.on("error", (err) => {
      logger.error("Worker error", err as Error);
    });

    this.worker.on("stalled", (jobId) => {
      logger.warn("Job stalled", { jobId });
    });
  }

  /**
   * Запустить worker
   */
  public start(): void {
    logger.success("Re-engagement worker запущен", {
      concurrency: 5,
    });
  }

  /**
   * Остановить worker
   */
  public async stop(): Promise<void> {
    await this.worker.close();
    logger.info("Re-engagement worker остановлен");
  }
}

// Запуск worker
const startupLogger = createWorkerLogger("startup");
startupLogger.info("Запуск re-engagement worker...");

try {
  const worker = new ReengagementWorker();
  worker.start();
} catch (error) {
  startupLogger.error("Ошибка запуска re-engagement worker", error as Error);
  process.exit(1);
}
