"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { PushNotificationService } from "@gafus/webpush";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("admin-panel-broadcast-push");

interface BroadcastResult {
  success: boolean;
  totalUsers: number;
  sentCount: number;
  failedCount: number;
  error?: string;
}

/**
 * Отправляет push-уведомление всем пользователям с активными подписками
 * Доступно только для ADMIN
 */
export async function sendBroadcastPush(
  title: string,
  body: string,
  url?: string
): Promise<BroadcastResult> {
  try {
    // Проверяем сессию и права доступа
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.role || session.user.role !== "ADMIN") {
      logger.warn("Попытка отправки broadcast push без прав ADMIN", {
        userId: session?.user?.id,
        role: session?.user?.role,
      });
      return {
        success: false,
        totalUsers: 0,
        sentCount: 0,
        failedCount: 0,
        error: "Недостаточно прав доступа",
      };
    }

    // Валидация входных данных
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

    logger.info("Начало массовой рассылки push-уведомлений", {
      adminId: session.user.id,
      title,
      bodyLength: body.length,
    });

    // Получаем всех пользователей с активными подписками
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

    // Преобразуем подписки в формат PushSubscriptionJSON
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
      .filter((sub): sub is { endpoint: string; keys: { p256dh: string; auth: string } } => 
        sub !== null
      );

    // Инициализируем сервис отправки push-уведомлений
    // Используем fromEnvironment() для автоматического получения VAPID ключей
    const pushService = PushNotificationService.fromEnvironment();

    // Формируем payload для уведомления
    const payload = {
      title,
      body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/badge-72x72.png",
      ...(url && { url }),
    };

    // Отправляем уведомления всем подписанным пользователям
    const result = await pushService.sendNotifications(pushSubscriptions, payload);

    // Удаляем неактивные подписки (410 Gone, 404 Not Found)
    const invalidEndpoints = result.results
      .filter(
        (r) => !r.success && PushNotificationService.shouldDeleteSubscription(r.error)
      )
      .map((r) => r.endpoint);

    if (invalidEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: {
          endpoint: {
            in: invalidEndpoints,
          },
        },
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

