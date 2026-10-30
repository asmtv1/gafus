/**
 * Worker для обработки re-engagement уведомлений
 * Обрабатывает задачи из очереди reengagement
 */

import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { PushNotificationService } from "@gafus/webpush";
import {
  getReengagementCampaignState, getReengagementPushSubscriptions,
  deleteInvalidReengagementPushEndpoints, isReengagementDispatchAllowed,
} from "@gafus/core/services/reengagement";
import {
  partitionPushSubscriptions,
  sendExpoPushNotifications,
  sendRustorePushNotifications,
} from "@gafus/webpush";
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
  // WebPush credentials are optional for an Expo/RuStore-only installation.
  // Never load VAPID at import/startup and block the entire cron scheduler.
  private pushService: PushNotificationService | null = null;

  constructor() {
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
      const campaign = await getReengagementCampaignState(campaignId);

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

      // A user may have opted out after the scheduler queued this job.
      if (!(await isReengagementDispatchAllowed(campaignId, userId, level))) {
        logger.info("Кампания более не подходит для отправки, уведомление пропущено", {
          campaignId, userId, level,
        });
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
      const subscriptions = await getReengagementPushSubscriptions(userId);

      if (subscriptions.length === 0) {
        logger.warn("У пользователя нет активных push-подписок", { userId });

        // Обновить кампанию как отправленную (даже если нет подписок)
        await updateCampaignAfterSend(campaignId, notificationId, 0, 0);
        return;
      }

      logger.info(`Найдено ${subscriptions.length} активных подписок`, { userId });

      // 7. Разделить подписки по каналам
      const partitioned = partitionPushSubscriptions(subscriptions);

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
        subscriptionsCount: subscriptions.length,
        webSubscriptionsCount: partitioned.web.length,
        expoSubscriptionsCount: partitioned.expo.length,
        rustoreSubscriptionsCount: partitioned.rustore.length,
      });

      // Recheck immediately before external providers. Opt-out / completion may
      // have happened while composing the payload and fetching subscriptions.
      if (!(await isReengagementDispatchAllowed(campaignId, userId, level))) {
        logger.info("Отправка отменена после изменения прав получателя", {
          campaignId, userId, level,
        });
        return;
      }

      // Web Push is independent of native transports. If VAPID is absent
      // or the WebPush provider fails, still try every Expo/RuStore recipient.
      // An ambiguous failure MUST NOT delete endpoints.
      let webFailure = false;
      let webResult: {
        results: { success: boolean; error?: unknown; endpoint: string }[];
        successCount: number;
        failureCount: number;
      } = { results: [], successCount: 0, failureCount: 0 };
      if (partitioned.web.length > 0) {
        try {
          this.pushService ??= PushNotificationService.fromEnvironment();
          webResult = await this.pushService.sendNotifications(partitioned.web, payload);
        } catch {
          webFailure = true;
          webResult.failureCount = partitioned.web.length;
          logger.warn("WebPush недоступен; независимые мобильные каналы продолжают отправку");
        }
      }

      const expoResult =
        partitioned.expo.length > 0 ?
        await sendExpoPushNotifications(partitioned.expo, {
          title: personalizedMessage.title,
          body: personalizedMessage.body,
          url: personalizedMessage.url ?? "/",
        })
        : {
            successCount: 0,
            failureCount: 0,
            deletedCount: 0,
            temporaryFailureCount: 0,
          };

      const rustoreResult =
        partitioned.rustore.length > 0 ?
          await sendRustorePushNotifications(partitioned.rustore, {
            title: personalizedMessage.title,
            body: personalizedMessage.body,
            url: personalizedMessage.url ?? "/",
          })
        : {
            successCount: 0,
            failureCount: 0,
            deletedCount: 0,
            temporaryFailureCount: 0,
          };

      // A WebPush-only job with unavailable credentials cannot be falsely
      // marked dispatched; let BullMQ retry once a valid VAPID config exists.
      if (webFailure && expoResult.successCount + rustoreResult.successCount === 0) {
        throw new Error("REENGAGEMENT_WEBPUSH_UNAVAILABLE");
      }

      logger.success("Push-уведомления отправлены", {
        userId,
        webSent: webResult.successCount,
        webFailed: webResult.failureCount,
        expoSent: expoResult.successCount,
        expoFailed: expoResult.failureCount,
        rustoreSent: rustoreResult.successCount,
        rustoreFailed: rustoreResult.failureCount,
      });

      // 10. Обработать неудачные web-подписки
      const invalidEndpoints = webResult.results
        .filter((r) => !r.success && PushNotificationService.shouldDeleteSubscription(r.error))
        .map((r) => r.endpoint);

      if (invalidEndpoints.length > 0) {
        await deleteInvalidReengagementPushEndpoints(invalidEndpoints);

        logger.info(`Удалено ${invalidEndpoints.length} недействительных подписок`, { userId });
      }

      // 11. Обновить кампанию
      await updateCampaignAfterSend(
        campaignId,
        notificationId,
        webResult.successCount + expoResult.successCount + rustoreResult.successCount,
        webResult.failureCount + expoResult.failureCount + rustoreResult.failureCount,
      );

      logger.success("Re-engagement задача завершена", {
        jobId: job.id,
        campaignId,
        userId,
        level,
        sent: webResult.successCount + expoResult.successCount + rustoreResult.successCount,
        failed: webResult.failureCount + expoResult.failureCount + rustoreResult.failureCount,
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
