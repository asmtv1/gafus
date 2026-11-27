import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

// Stable output shape consumed by the authenticated admin-only Hono composition.
type BroadcastResult = {
  success: boolean;
  totalUsers: number;
  sentCount: number;
  failedCount: number;
  error?: string;
};

const logger = createWebLogger("admin-broadcast-service");

/** The preview shows raw persisted subscriptions, not confirmed deliverable targets. */
export async function countBroadcastSubscriptionRows(): Promise<number> {
  return prisma.pushSubscription.count();
}


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
    // Lazy provider import keeps the normal Chat2/health API startup
    // independent of the CJS webpush package's static ESM re-exports.
    const { PushNotificationService, partitionPushSubscriptions,
      sendExpoPushNotifications, deleteInvalidPushRegistrations } =
        await import("@gafus/webpush");
    const rows = await prisma.pushSubscription.findMany({
      select: {
        id: true, userId: true, updatedAt: true, endpoint: true,
        keys: true,
      },
    });

    if (rows.length === 0) {
      logger.info("Нет пользователей с активными push-подписками");
      return {
        success: true,
        totalUsers: 0,
        sentCount: 0,
        failedCount: 0,
      };
    }

    const partitioned = partitionPushSubscriptions(rows);
    const totalTargets =
      partitioned.web.length + partitioned.expo.length;

    logger.info(`Найдено подписок: всего записей ${rows.length}, валидных к отправке ${totalTargets}`);

    const linkUrl = url?.trim() || "/";
    const webPayload = {
      title,
      body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/badge-72x72.png",
      url: linkUrl,
    };


    let sentCount = 0;
    let failedCount = 0;

    if (partitioned.web.length > 0) {
      try {
        const result = await PushNotificationService.fromEnvironment().sendNotifications(partitioned.web, webPayload);
        sentCount += result.successCount;
        failedCount += result.failureCount;
        const invalid = new Set(result.results.filter(row =>
          !row.success && PushNotificationService.shouldDeleteSubscription(row.error)).map(row => row.endpoint));
        if (invalid.size) await deleteInvalidPushRegistrations(partitioned.web, invalid)
          .catch(() => logger.warn("Не удалось очистить устаревшие web-подписки"));
      } catch {
        failedCount += partitioned.web.length;
        logger.warn("Канал Web Push недоступен");
      }
    }

    if (partitioned.expo.length > 0) {
      try {
        const expoResult = await sendExpoPushNotifications(partitioned.expo, { title, body, url: linkUrl });
        sentCount += expoResult.successCount;
        failedCount += expoResult.failureCount;
      } catch {
        failedCount += partitioned.expo.length;
        logger.warn("Канал Expo Push недоступен");
      }
    }

    logger.success("Массовая рассылка завершена", {
      web: partitioned.web.length,
      expo: partitioned.expo.length,
      sent: sentCount,
      failed: failedCount,
    });

    return {
      success: true,
      totalUsers: totalTargets,
      sentCount,
      failedCount,
    };
  } catch (error) {
    logger.error("Admin push broadcast failed", new Error("BROADCAST_PROVIDER_UNAVAILABLE"));
    return {
      success: false,
      totalUsers: 0,
      sentCount: 0,
      failedCount: 0,
      error: "BROADCAST_PROVIDER_UNAVAILABLE",
    };
  }
}
