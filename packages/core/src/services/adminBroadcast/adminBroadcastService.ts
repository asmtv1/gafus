import { prisma } from "@gafus/prisma";
import { PushNotificationService } from "@gafus/webpush";
import { createWebLogger } from "@gafus/logger";

import type { BroadcastResult } from "./types";

const logger = createWebLogger("admin-broadcast-service");

export async function sendBroadcastPush(
  title: string,
  body: string,
  url?: string,
): Promise<BroadcastResult> {
  if (!title || title.trim().length === 0) {
    return {
      success: false,
      totalUsers: 0,
      sentCount: 0,
      failedCount: 0,
      error: "Заголовок не может быть пустым",
    };
  }

  if (!body || body.trim().length === 0) {
    return {
      success: false,
      totalUsers: 0,
      sentCount: 0,
      failedCount: 0,
      error: "Текст сообщения не может быть пустым",
    };
  }

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      select: {
        endpoint: true,
        keys: true,
        userId: true,
      },
    });

    if (subscriptions.length === 0) {
      logger.info("Нет пользователей с активными push-подписками");
      return {
        success: true,
        totalUsers: 0,
        sentCount: 0,
        failedCount: 0,
      };
    }

    logger.info(`Найдено ${subscriptions.length} активных подписок`);

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
            keys: { p256dh: keys.p256dh, auth: keys.auth },
          };
        }
        return null;
      })
      .filter(
        (sub): sub is { endpoint: string; keys: { p256dh: string; auth: string } } => sub !== null,
      );

    const pushService = PushNotificationService.fromEnvironment();
    const payload = {
      title,
      body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/badge-72x72.png",
      ...(url && { url }),
    };

    const result = await pushService.sendNotifications(pushSubscriptions, payload);

    const invalidEndpoints = result.results
      .filter((r) => !r.success && PushNotificationService.shouldDeleteSubscription(r.error))
      .map((r) => r.endpoint);

    if (invalidEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: { in: invalidEndpoints } },
      });
      logger.info(`Удалено ${invalidEndpoints.length} недействительных подписок`);
    }

    logger.success("Массовая рассылка завершена", {
      totalSubscriptions: pushSubscriptions.length,
      sent: result.successCount,
      failed: result.failureCount,
      invalidRemoved: invalidEndpoints.length,
    });

    return {
      success: true,
      totalUsers: pushSubscriptions.length,
      sentCount: result.successCount,
      failedCount: result.failureCount,
    };
  } catch (error) {
    logger.error("Ошибка при массовой рассылке push-уведомлений", error as Error);
    return {
      success: false,
      totalUsers: 0,
      sentCount: 0,
      failedCount: 0,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
