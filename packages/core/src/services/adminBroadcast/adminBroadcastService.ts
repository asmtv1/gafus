import { prisma } from "@gafus/prisma";
import {
  PushNotificationService,
  partitionPushSubscriptions,
  sendExpoPushNotifications,
  sendRustorePushNotifications,
} from "@gafus/webpush";
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
    const rows = await prisma.pushSubscription.findMany({
      select: {
        endpoint: true,
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

    const subscriptionLikes = rows.map((r) => ({ endpoint: r.endpoint, keys: r.keys }));
    const partitioned = partitionPushSubscriptions(subscriptionLikes);
    const totalTargets =
      partitioned.web.length + partitioned.expo.length + partitioned.rustore.length;

    logger.info(`Найдено подписок: всего записей ${rows.length}, валидных к отправке ${totalTargets}`);

    const linkUrl = url?.trim() || "/";
    const webPayload = {
      title,
      body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/badge-72x72.png",
      url: linkUrl,
    };

    const pushService = PushNotificationService.fromEnvironment();

    let sentCount = 0;
    let failedCount = 0;

    if (partitioned.web.length > 0) {
      const result = await pushService.sendNotifications(partitioned.web, webPayload);
      sentCount += result.successCount;
      failedCount += result.failureCount;

      const invalidEndpoints = result.results
        .filter((r) => !r.success && PushNotificationService.shouldDeleteSubscription(r.error))
        .map((r) => r.endpoint);

      if (invalidEndpoints.length > 0) {
        await prisma.pushSubscription.deleteMany({
          where: { endpoint: { in: invalidEndpoints } },
        });
        logger.info(`Удалено ${invalidEndpoints.length} недействительных web-подписок`);
      }
    }

    if (partitioned.expo.length > 0) {
      const expoResult = await sendExpoPushNotifications(partitioned.expo, {
        title,
        body,
        url: linkUrl,
      });
      sentCount += expoResult.successCount;
      failedCount += expoResult.failureCount;
    }

    if (partitioned.rustore.length > 0) {
      const rustoreResult = await sendRustorePushNotifications(partitioned.rustore, {
        title,
        body,
        url: linkUrl,
      });
      sentCount += rustoreResult.successCount;
      failedCount += rustoreResult.failureCount;
    }

    logger.success("Массовая рассылка завершена", {
      web: partitioned.web.length,
      expo: partitioned.expo.length,
      rustore: partitioned.rustore.length,
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
