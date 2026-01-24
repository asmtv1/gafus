import { prisma } from "@gafus/prisma";
import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import type { Job } from "bullmq";
import { Worker } from "bullmq";

import type { PushSubscription } from "@gafus/prisma";
import { PushNotificationService } from "../../webpush/src/service";
// Local type definition to avoid @gafus/types dependency
interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
// Создаем логгеры для разных компонентов
const notificationLogger = createWorkerLogger("notification-processor");
const workerLogger = createWorkerLogger("push-worker");

// Конфигурация
const config = {
  worker: {
    concurrency: 5,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
  push: {
    retryAttempts: 3,
    retryDelay: 1000,
  },
} as const;

// Типы уведомлений (Discriminated Union)
type NotificationType = "step" | "immediate";

// Интерфейсы для типобезопасности
interface StepNotificationData {
  type: "step";
  stepTitle: string;
  stepIndex: number;
  url?: string;
}

interface ImmediateNotificationData {
  type: "immediate";
  title: string;
  body: string;
  url?: string;
}

type NotificationData = StepNotificationData | ImmediateNotificationData;

// Константы для форматирования
const NOTIFICATION_FORMAT = {
  SEPARATOR: "|" as const,
  DEFAULT_ICON: "/icons/icon192.png" as const,
  DEFAULT_BADGE: "/icons/badge-72.png" as const,
  DEFAULT_URL: "/" as const,
} as const;

// Инициализация PushNotificationService
const pushService = PushNotificationService.fromEnvironment();

// Сервис для обработки уведомлений
class NotificationProcessor {
  private logger = notificationLogger;

  async process(notificationId: string): Promise<void> {
    this.logger.info("Processing notification", { notificationId });

    const notification = await this.fetchNotification(notificationId);
    if (!notification) return;

    // Проверяем, не приостановлено ли уведомление
    if (notification.paused) {
      this.logger.info("Notification is paused, skipping processing", {
        notificationId,
        day: notification.day,
        stepIndex: notification.stepIndex,
      });
      return;
    }

    // Проверяем, не отправлено ли уже уведомление
    if (notification.sent) {
      this.logger.info("Notification already sent, skipping processing", {
        notificationId,
        day: notification.day,
        stepIndex: notification.stepIndex,
      });
      return;
    }

    const subscriptions = await this.fetchSubscriptions(notification.userId);
    if (subscriptions.length === 0) {
      this.logger.warn("No subscriptions found for user", { userId: notification.userId });
      return;
    }

    // Создаем типобезопасные данные на основе поля type из БД
    const notificationData = this.createNotificationData(notification);
    const payload = this.createNotificationPayload(notificationData);
    const results = await this.sendNotifications(subscriptions, payload);

    await this.updateNotificationStatus(notificationId, results.successCount > 0);

    this.logger.success("Notification processing completed", {
      notificationId,
      day: notification.day,
      stepIndex: notification.stepIndex,
      totalSubscriptions: subscriptions.length,
      successfulSends: results.successCount,
      failedSends: results.failedCount,
    });
  }

  private async fetchNotification(notificationId: string) {
    try {
      const notification = await prisma.stepNotification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        this.logger.warn("Notification not found", { notificationId });
        return null;
      }

      return notification;
    } catch (error) {
      this.logger.error("Failed to fetch notification", error as Error, { notificationId });
      throw error;
    }
  }

  private async fetchSubscriptions(userId: string): Promise<PushSubscription[]> {
    try {
      // Получаем все подписки пользователя напрямую из БД
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId },
      });

      this.logger.info("Found subscriptions", {
        userId,
        count: subscriptions.length,
      });

      return subscriptions;
    } catch (error) {
      this.logger.error("Failed to fetch subscriptions", error as Error, { userId });
      throw error;
    }
  }

  /**
   * Создает типобезопасные данные уведомления на основе записи из БД
   */
  private createNotificationData(notification: {
    type: string;
    stepTitle?: string | null;
    stepIndex: number;
    url?: string | null;
  }): NotificationData {
    if (notification.type === "immediate") {
      // Для немедленных уведомлений stepTitle содержит "title|body"
      const stepTitle = notification.stepTitle || "Уведомление|Проверьте детали";
      const separator = NOTIFICATION_FORMAT.SEPARATOR;

      let title: string;
      let body: string;

      if (stepTitle.includes(separator)) {
        const parts = stepTitle.split(separator, 2);
        title = parts[0] || "Уведомление";
        body = parts[1] || "Проверьте детали";
      } else {
        title = stepTitle;
        body = "Проверьте детали";
      }

      return {
        type: "immediate",
        title: title.trim(),
        body: body.trim(),
        url: notification.url || undefined,
      };
    } else {
      // Обычное уведомление о шаге
      // Строгая проверка stepTitle: проверяем на null, undefined и пустую строку
      const rawStepTitle = notification.stepTitle;
      const hasStepTitle = rawStepTitle != null && rawStepTitle.trim().length > 0;
      const stepTitle = hasStepTitle ? rawStepTitle.trim() : `Шаг ${notification.stepIndex + 1}`;

      // Логируем, если stepTitle отсутствует
      if (!hasStepTitle) {
        this.logger.warn("StepTitle отсутствует в уведомлении, используется fallback", {
          stepIndex: notification.stepIndex,
          stepTitleValue: rawStepTitle,
        });
      }

      return {
        type: "step",
        stepTitle,
        stepIndex: notification.stepIndex,
        url: notification.url || undefined,
      };
    }
  }

  private createNotificationPayload(notification: NotificationData): string {
    // TypeScript автоматически сузит типы благодаря Discriminated Union
    if (notification.type === "immediate") {
      return this.createImmediateNotificationPayload(notification);
    } else {
      return this.createStepNotificationPayload(notification);
    }
  }

  /**
   * Создаёт payload для немедленных уведомлений (например, зачёт экзамена)
   */
  private createImmediateNotificationPayload(notification: ImmediateNotificationData): string {
    return JSON.stringify({
      title: notification.title.trim(),
      body: notification.body.trim(),
      icon: NOTIFICATION_FORMAT.DEFAULT_ICON,
      badge: NOTIFICATION_FORMAT.DEFAULT_BADGE,
      data: {
        url: notification.url ?? NOTIFICATION_FORMAT.DEFAULT_URL,
      },
    });
  }

  /**
   * Создаёт payload для обычных уведомлений о шагах
   */
  private createStepNotificationPayload(notification: StepNotificationData): string {
    const stepTitle = notification.stepTitle || `Шаг ${notification.stepIndex + 1}`;

    return JSON.stringify({
      title: "ВЫ ВЕЛИКОЛЕПНЫ!",
      body: `Вы успешно прошли "${stepTitle}".`,
      icon: NOTIFICATION_FORMAT.DEFAULT_ICON,
      badge: NOTIFICATION_FORMAT.DEFAULT_BADGE,
      data: {
        url: notification.url ?? NOTIFICATION_FORMAT.DEFAULT_URL,
      },
    });
  }

  private async sendNotifications(
    subscriptions: PushSubscription[],
    payload: string,
  ): Promise<{ successCount: number; failedCount: number }> {
    // Конвертируем подписки в правильный формат
    const jsonSubscriptions: PushSubscriptionJSON[] = subscriptions
      .map((sub) => ({
        endpoint: sub.endpoint,
        keys: sub.keys as { p256dh: string; auth: string },
      }))
      .filter((sub) => sub.endpoint && sub.keys?.p256dh && sub.keys?.auth);

    const results = await pushService.sendNotifications(jsonSubscriptions, payload);

    // Обрабатываем неудачные подписки
    for (const result of results.results) {
      if (!result.success && PushNotificationService.shouldDeleteSubscription(result.error)) {
        await this.handleFailedSubscription(result.endpoint);
      }
    }

    return {
      successCount: results.successCount,
      failedCount: results.failureCount,
    };
  }

  private async handleFailedSubscription(endpoint: string): Promise<void> {
    try {
      // Удаляем недействительную подписку из базы данных
      await prisma.pushSubscription.deleteMany({
        where: { endpoint },
      });

      this.logger.info("Removed invalid subscription", {
        endpoint: endpoint.substring(0, 50) + "...",
      });
    } catch (error) {
      this.logger.error("Failed to handle subscription failure", error as Error, {
        endpoint: endpoint.substring(0, 50) + "...",
      });
    }
  }

  private async updateNotificationStatus(notificationId: string, sent: boolean): Promise<void> {
    try {
      await prisma.stepNotification.update({
        where: { id: notificationId },
        data: { sent },
      });

      this.logger.success("Notification status updated", { notificationId, sent });
    } catch (error) {
      this.logger.error("Failed to update notification status", error as Error, { notificationId });
      throw error;
    }
  }
}

// Основной класс worker'а
class PushWorker {
  private worker: Worker;
  private notificationProcessor: NotificationProcessor;
  private logger = workerLogger;

  constructor() {
    this.notificationProcessor = new NotificationProcessor();

    this.worker = new Worker("push", this.processJob.bind(this), {
      connection,
      concurrency: config.worker.concurrency,
      removeOnComplete: config.worker.removeOnComplete,
      removeOnFail: config.worker.removeOnFail,
    });

    this.setupEventHandlers();
  }

  private async processJob(job: Job): Promise<void> {
    try {
      const { notificationId } = job.data as { notificationId: string };

      this.logger.info("Processing job", { jobId: job.id, notificationId });

      // АТОМАРНАЯ проверка статуса уведомления с блокировкой
      const notification = await prisma.stepNotification.findUnique({
        where: {
          id: notificationId,
          // Проверяем что jobId все еще актуален (не был изменен)
          jobId: job.id?.toString() || "",
        },
        select: {
          id: true,
          jobId: true,
          sent: true,
          paused: true,
        },
      });

      if (!notification) {
        this.logger.info("Notification skipped - jobId mismatch or not found", {
          jobId: job.id,
          notificationId,
          reason: "jobId mismatch or notification not found",
        });
        return;
      }

      // Дополнительная проверка статуса
      if (notification.sent) {
        this.logger.info("Notification skipped - already sent", {
          jobId: job.id,
          notificationId,
          reason: "already sent",
        });
        return;
      }

      if (notification.paused) {
        this.logger.info("Notification skipped - paused", {
          jobId: job.id,
          notificationId,
          reason: "paused",
        });
        return;
      }

      this.logger.info("Notification will be processed", {
        jobId: job.id,
        notificationId,
        notificationJobId: notification.jobId,
        sent: notification.sent,
        paused: notification.paused,
      });

      await this.notificationProcessor.process(notificationId);

      this.logger.success("Job completed successfully", { jobId: job.id });
    } catch (error) {
      this.logger.error("Job processing failed", error as Error, {
        jobId: job.id,
      });
      throw error; // BullMQ автоматически retry
    }
  }

  private setupEventHandlers(): void {
    this.worker.on("completed", (job) => {
      this.logger.success("Job completed", { jobId: job.id });
    });

    this.worker.on("failed", (job, err) => {
      this.logger.error("Job failed", err as Error, {
        jobId: job?.id,
      });
    });

    this.worker.on("error", (err) => {
      this.logger.error("Worker error", err as Error);
    });

    this.worker.on("stalled", (jobId) => {
      this.logger.warn("Job stalled", { jobId });
    });
  }

  public start(): void {
    this.logger.success("Push worker started", {
      concurrency: config.worker.concurrency,
      removeOnComplete: config.worker.removeOnComplete,
      removeOnFail: config.worker.removeOnFail,
    });
  }
}

// Запуск worker'а
const startupLogger = createWorkerLogger("startup");
startupLogger.info("Starting push-worker process...");

try {
  const worker = new PushWorker();
  worker.start();
} catch (error) {
  startupLogger.error("Failed to start push-worker", error as Error);
  process.exit(1);
}
