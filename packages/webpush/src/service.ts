// Unified Push Notification service
// Объединяет логику отправки push-уведомлений для web и worker

// Local type definition to avoid @gafus/types dependency
interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

import webpush from "web-push";
import { createWorkerLogger } from "@gafus/logger";

// Создаем логгер для webpush сервиса
const logger = createWorkerLogger("webpush-service");

// Валидация
const validateVapidPublicKey = (key: string) => !!key && key.length >= 20;
const validateVapidPrivateKey = (key: string) => !!key && key.length >= 20;
const validateVapidSubject = (subject: string) =>
  !!subject && (subject.startsWith("mailto:") || subject.startsWith("http"));
const validatePushSubscription = (sub: { endpoint?: string }) =>
  !!(sub && sub.endpoint && typeof sub.endpoint === "string");
const validatePushSubscriptionFull = (sub: unknown): sub is PushSubscriptionJSON =>
  !!(
    sub &&
    typeof (sub as PushSubscriptionJSON).endpoint === "string" &&
    (sub as PushSubscriptionJSON).keys &&
    typeof (sub as PushSubscriptionJSON).keys.p256dh === "string" &&
    typeof (sub as PushSubscriptionJSON).keys.auth === "string"
  );

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

// Helper: ensure payload fits under Apple's 4KB limit (4096 bytes)
const MAX_APPLE_PAYLOAD_BYTES = 4096;
function trimPayloadToSize(payloadStr: string, maxBytes = MAX_APPLE_PAYLOAD_BYTES): string {
  if (Buffer.byteLength(payloadStr, "utf8") <= maxBytes) return payloadStr;

  // Попробуем аккуратно урезать body, сохранив JSON-валидность
  try {
    const obj = JSON.parse(payloadStr);
    if (typeof obj === "object" && obj !== null && "body" in obj && typeof obj.body === "string") {
      const body = obj.body as string;
      // Уменьшаем body пока не влезает
      let low = 0;
      let high = body.length;
      let best = "";
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const testObj = { ...obj, body: body.slice(0, mid) };
        const candidate = JSON.stringify(testObj);
        if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
          best = candidate;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (best) return best;
    }
  } catch (_) {
    // fallthrough — если не JSON или не получилось, вернём усечённую строку
  }

  // Последняя инстанция — просто обрезаем строку
  const buf = Buffer.from(payloadStr, "utf8");
  return buf.slice(0, maxBytes).toString("utf8");
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

    if (!validateVapidPublicKey(vapidPublicKey)) {
      throw new Error("Invalid VAPID public key format");
    }

    if (!validateVapidPrivateKey(vapidPrivateKey)) {
      throw new Error("Invalid VAPID private key format");
    }

    if (!validateVapidSubject(vapidSubject)) {
      throw new Error("Invalid VAPID subject format");
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    logger.info("VAPID configuration validated", {
      publicKeyLength: vapidPublicKey.length,
      privateKeyLength: vapidPrivateKey.length,
      subject: vapidSubject.startsWith("mailto:") ? "email" : "url",
    });

    this.initialized = true;
  }

  /**
   * Урезает payload до размера, совместимого с Apple
   */
  private trimPayloadToSize(payloadStr: string, maxBytes = MAX_APPLE_PAYLOAD_BYTES): string {
    if (Buffer.byteLength(payloadStr, "utf8") <= maxBytes) return payloadStr;

    // Попробуем аккуратно урезать body, сохранив JSON-валидность
    try {
      const obj = JSON.parse(payloadStr);
      if (typeof obj === "object" && obj !== null && "body" in obj) {
        const body = obj.body as string;
        // Уменьшаем body пока не влезает
        let low = 0;
        let high = body.length;
        let best = "";
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const testObj = { ...obj, body: body.slice(0, mid) };
          const candidate = JSON.stringify(testObj);
          if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
            best = candidate;
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
        if (best) return best;
      }
    } catch (_) {
      // fallthrough — если не JSON или не получилось, вернём усечённую строку
    }

    // Последняя инстанция — просто обрезаем строку
    const buf = Buffer.from(payloadStr, "utf8");
    return buf.slice(0, maxBytes).toString("utf8");
  }

  /**
   * Форматирует payload для iOS Safari (обратная совместимость)
   */
  private formatIOSCompatiblePayload(payload: string | Record<string, unknown>): string {
    // Парсим безопасно
    let payloadObj: Record<string, unknown> = {};

    if (typeof payload === "string") {
      try {
        payloadObj = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        payloadObj = { title: "Уведомление", body: String(payload) };
      }
    } else {
      payloadObj = payload;
    }

    // Notifications API badge — это URL к изображению; для числового бейджа используйте Badging API на клиенте
    const badgeUrl =
      typeof payloadObj.badge === "string" && payloadObj.badge.length > 0
        ? payloadObj.badge
        : payloadObj.badgeUrl || undefined;

    // Специальный формат для iOS Safari
    const out: Record<string, unknown> = {
      title: payloadObj.title || "Уведомление",
      body: payloadObj.body || payloadObj.message || "",
      icon: payloadObj.icon || "/icons/icon192.png",
      badge: badgeUrl,
      tag: payloadObj.tag || "default",
      data: payloadObj.data || {},
      requireInteraction: payloadObj.requireInteraction ?? false,
      silent: payloadObj.silent ?? false,
      // Специальные опции для iOS Safari
      actions: payloadObj.actions || [
        {
          action: "open",
          title: "Открыть",
        },
        {
          action: "close",
          title: "Закрыть",
        },
      ],
      vibrate: payloadObj.vibrate || [200, 100, 200],
      timestamp: payloadObj.timestamp || Date.now(),
    };

    const str = JSON.stringify(out);

    // Проверяем и при необходимости урезаем до лимита Apple
    return this.trimPayloadToSize(str, MAX_APPLE_PAYLOAD_BYTES);
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

    if (!validatePushSubscriptionFull(subscription)) {
      const sub = subscription as { endpoint?: string };
      logger.warn("Invalid subscription format", {
        endpoint: sub.endpoint ? `${sub.endpoint.substring(0, 50)}...` : "unknown",
      });

      return {
        success: false,
        endpoint: (subscription as { endpoint?: string })?.endpoint || "unknown",
        error: new Error("Invalid subscription format"),
      };
    }

    try {
      const iosCompatiblePayload = this.formatIOSCompatiblePayload(payload);

      logger.debug("Sending iOS-compatible push notification", {
        endpoint: subscription.endpoint.substring(0, 50) + "...",
        payloadLength: Buffer.byteLength(iosCompatiblePayload, "utf8"),
        serviceType: subscription.endpoint.includes("web.push.apple.com") ? "iOS Safari" : "Other",
      });

      // Опции: TTL и (при необходимости) другой набор опций
      const options: Record<string, unknown> = {
        TTL: 60 * 60, // 1 час
      };

      await webpush.sendNotification(subscription, iosCompatiblePayload, options);

      logger.info("Push notification sent successfully", {
        endpoint: subscription.endpoint.substring(0, 50) + "...",
        serviceType: subscription.endpoint.includes("web.push.apple.com") ? "iOS Safari" : "Other",
      });

      return {
        success: true,
        endpoint: subscription.endpoint,
      };
    } catch (err) {
      // web-push throws объекты с полем statusCode и body
      const errorObj = err as { statusCode?: number; body?: string };
      const statusCode = errorObj?.statusCode;
      const body = errorObj?.body;

      logger.error(
        "Failed to send push notification",
        err instanceof Error ? err : new Error(String(err)),
        {
          endpoint: subscription.endpoint.substring(0, 50) + "...",
          serviceType: subscription.endpoint.includes("web.push.apple.com")
            ? "iOS Safari"
            : "Other",
          statusCode,
          body,
        },
      );

      return {
        success: false,
        endpoint: subscription.endpoint,
        error:
          statusCode || body
            ? { statusCode: statusCode ?? null, body: body ?? String(err) }
            : err instanceof Error
              ? err.message
              : String(err),
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
   */
  static shouldDeleteSubscription(error: unknown): boolean {
    if (typeof error === "object" && error !== null) {
      const e = error as { statusCode?: number; status?: number; body?: string; message?: string };
      const statusCode = e.statusCode ?? e.status ?? null;
      if (typeof statusCode === "number") {
        return statusCode === 404 || statusCode === 410;
      }

      const body = e.body ?? e.message ?? "";
      if (typeof body === "string") {
        const lower = body.toLowerCase();
        return (
          (lower.includes("subscription") &&
            (lower.includes("expired") || lower.includes("invalid"))) ||
          lower.includes("not found") ||
          lower.includes("gone")
        );
      }
    }

    if (typeof error === "string") {
      const errorLower = error.toLowerCase();
      return (
        errorLower.includes("subscription") &&
        (errorLower.includes("expired") ||
          errorLower.includes("invalid") ||
          errorLower.includes("not found"))
      );
    }

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
