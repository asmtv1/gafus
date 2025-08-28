// Единый сервис для работы с push-уведомлениями
// Объединяет логику из apps/web/src/utils/push.ts и packages/worker/src/push-worker.ts

// Local type definition to avoid @gafus/types dependency
interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}
import webpush from "web-push";
import type { PushLogEntry } from "./types";

// Функция для отправки логов в error-dashboard
const sendToErrorDashboard = async (logEntry: PushLogEntry): Promise<void> => {
  try {
    // Определяем URL error-dashboard из переменных окружения
    const errorDashboardUrl = process.env.ERROR_DASHBOARD_URL || "http://gafus-error-dashboard:3005";

    const errorReport = {
      message: logEntry.message,
      stack:
        logEntry.error && typeof logEntry.error === "object" && "stack" in logEntry.error
          ? (logEntry.error as { stack?: string }).stack || null
          : null,
      appName: "push-notifications",
      environment: process.env.NODE_ENV || "development",
      url: `${errorDashboardUrl}/push-logs`,
      userAgent: "push-service",
      userId: logEntry.userId || null,
      sessionId: null, // Для push-уведомлений не используем сессии
      componentStack: null,
      additionalContext: {
        context: logEntry.context,
        service: logEntry.service,
        notificationId: logEntry.notificationId,
        endpoint: logEntry.endpoint,
        timestamp: logEntry.timestamp,
        level: logEntry.level,
        ...logEntry.meta,
      },
      tags: ["push-notifications", logEntry.level, logEntry.context],
    };

    const response = await fetch(`${errorDashboardUrl}/api/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(errorReport),
    });

    if (!response.ok) {
      console.error(
        `Failed to send log to error-dashboard: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    // Если не удалось отправить в error-dashboard, логируем локально
    console.error("Failed to send log to error-dashboard:", error);
  }
};

// Собственный логгер для push-уведомлений, интегрирующийся с error-dashboard
interface PushLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

// Реализация логгера с интеграцией в error-dashboard
const createPushLogger = (context: string): PushLogger => {
  const logToErrorDashboard = (
    level: string,
    message: string,
    error?: unknown,
    meta?: Record<string, unknown>,
  ) => {
    // Отправляем в error-dashboard через стандартный интерфейс
    const logEntry: PushLogEntry = {
      timestamp: new Date().toISOString(),
      level: level as PushLogEntry["level"],
      context,
      message,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
      meta,
      service: "push-notifications",
    };

    // Отправляем в error-dashboard
    sendToErrorDashboard(logEntry);

    // В разработке также выводим в console для отладки
    if (process.env.NODE_ENV !== "production") {
      console.log(`[${context}] ${level.toUpperCase()}: ${message}`, { error, meta });
    }
  };

  return {
    info: (message, meta) => logToErrorDashboard("info", message, undefined, meta),
    warn: (message, meta) => logToErrorDashboard("warn", message, undefined, meta),
    error: (message, error, meta) => logToErrorDashboard("error", message, error, meta),
    debug: (message, meta) => logToErrorDashboard("debug", message, undefined, meta),
  };
};

const logger = createPushLogger("webpush-service");

// Простые функции валидации
const validateVapidPublicKey = (key: string) => key && key.length >= 20;
const validateVapidPrivateKey = (key: string) => key && key.length >= 20;
const validateVapidSubject = (subject: string) =>
  subject && (subject.startsWith("mailto:") || subject.startsWith("http"));
const validatePushSubscription = (sub: { endpoint?: string }) =>
  sub && sub.endpoint && typeof sub.endpoint === "string";

export interface PushServiceConfig {
  vapidSubject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
}

export interface SendResult {
  success: boolean;
  endpoint: string;
  error?: unknown;
}

/**
 * Универсальный сервис для отправки push-уведомлений
 * Используется как в worker, так и в основном приложении
 */
export class PushNotificationService {
  private initialized = false;

  constructor(private config: PushServiceConfig) {
    this.validateAndInitialize();
  }

  private validateAndInitialize(): void {
    const { vapidSubject, vapidPublicKey, vapidPrivateKey } = this.config;

    // Валидируем все VAPID параметры
    if (!validateVapidPublicKey(vapidPublicKey)) {
      throw new Error("Invalid VAPID public key format");
    }

    if (!validateVapidPrivateKey(vapidPrivateKey)) {
      throw new Error("Invalid VAPID private key format");
    }

    if (!validateVapidSubject(vapidSubject)) {
      throw new Error("Invalid VAPID subject format");
    }

    // Настраиваем web-push
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    logger.info("VAPID configuration validated", {
      publicKeyLength: vapidPublicKey.length,
      privateKeyLength: vapidPrivateKey.length,
      subject: vapidSubject.startsWith("mailto:") ? "email" : "url",
    });

    this.initialized = true;
  }

  /**
   * Отправляет push-уведомление на одну подписку
   */
  async sendNotification(
    subscription: PushSubscriptionJSON,
    payload: string | Record<string, unknown>,
  ): Promise<SendResult> {
    if (!this.initialized) {
      throw new Error("PushNotificationService not initialized");
    }

    // Валидируем подписку
    if (!validatePushSubscription(subscription)) {
      const sub = subscription as { endpoint?: string };
      logger.warn("Invalid subscription format", {
        endpoint: sub.endpoint?.substring(0, 50) + "...",
      });
      return {
        success: false,
        endpoint: sub.endpoint || "unknown",
        error: new Error("Invalid subscription format"),
      };
    }

    const payloadString = typeof payload === "string" ? payload : JSON.stringify(payload);

    try {
      logger.debug("Sending push notification", {
        endpoint: subscription.endpoint.substring(0, 50) + "...",
        payloadLength: payloadString.length,
      });

      await webpush.sendNotification(subscription, payloadString);

      logger.info("Push notification sent successfully", {
        endpoint: subscription.endpoint.substring(0, 50) + "...",
      });

      return {
        success: true,
        endpoint: subscription.endpoint,
      };
    } catch (error) {
      logger.error(
        "Failed to send push notification",
        error instanceof Error ? error : new Error(String(error)),
        {
          endpoint: subscription.endpoint.substring(0, 50) + "...",
        },
      );

      return {
        success: false,
        endpoint: subscription.endpoint,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Отправляет push-уведомления на несколько подписок
   */
  async sendNotifications(
    subscriptions: PushSubscriptionJSON[],
    payload: string | Record<string, unknown>,
  ): Promise<{
    results: SendResult[];
    successCount: number;
    failureCount: number;
  }> {
    if (!this.initialized) {
      throw new Error("PushNotificationService not initialized");
    }

    logger.info("Sending push notifications", {
      subscriptionCount: subscriptions.length,
    });

    const results = await Promise.allSettled(
      subscriptions.map((subscription) => this.sendNotification(subscription, payload)),
    );

    const processedResults: SendResult[] = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return {
          success: false,
          endpoint: subscriptions[index]?.endpoint || "unknown",
          error: result.reason,
        };
      }
    });

    const successCount = processedResults.filter((r) => r.success).length;
    const failureCount = processedResults.length - successCount;

    logger.info("Push notifications batch completed", {
      total: subscriptions.length,
      success: successCount,
      failed: failureCount,
    });

    return {
      results: processedResults,
      successCount,
      failureCount,
    };
  }

  /**
   * Проверяет, является ли ошибка признаком недействительной подписки
   * Удаляем подписку ТОЛЬКО при явных признаках недействительности
   */
  static shouldDeleteSubscription(error: unknown): boolean {
    if (typeof error === "object" && error !== null && "statusCode" in error) {
      const statusCode = (error as { statusCode: number }).statusCode;
      // Удаляем только при явных признаках недействительности
      return statusCode === 404 || statusCode === 410;
    }

    // Если ошибка - строка, проверяем на явные признаки недействительности
    if (typeof error === "string") {
      const errorLower = error.toLowerCase();
      // Удаляем только при явных признаках недействительности
      return (
        errorLower.includes("subscription") &&
        (errorLower.includes("expired") ||
          errorLower.includes("invalid") ||
          errorLower.includes("not found"))
      );
    }

    // По умолчанию НЕ удаляем подписку
    return false;
  }

  /**
   * Создает экземпляр сервиса из переменных окружения
   */
  static fromEnvironment(): PushNotificationService {
    const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@gafus.localhost";
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error(
        "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in environment variables",
      );
    }

    return new PushNotificationService({
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey,
    });
  }
}
