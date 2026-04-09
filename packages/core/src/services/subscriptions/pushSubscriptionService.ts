/**
 * Push Subscription Service - бизнес-логика работы с push-подписками
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("push-subscription-service");

// ========== Save Push Subscription ==========

interface SavePushSubscriptionParams {
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Сохраняет или обновляет push-подписку пользователя
 */
export async function savePushSubscription(params: SavePushSubscriptionParams) {
  const { userId, endpoint, keys } = params;

  logger.info("Saving push subscription", { userId, endpoint: endpoint.substring(0, 50) + "..." });

  // Проверяем существование подписки по endpoint
  const existingSubscription = await prisma.pushSubscription.findFirst({
    where: { endpoint },
  });

  if (existingSubscription) {
    // Обновляем существующую подписку
    return prisma.pushSubscription.update({
      where: { id: existingSubscription.id },
      data: {
        keys,
        userId,
        updatedAt: new Date(),
      },
    });
  } else {
    // Создаем новую подписку
    return prisma.pushSubscription.create({
      data: {
        endpoint,
        keys,
        userId,
      },
    });
  }
}

// ========== Delete Push Subscription ==========

/**
 * Удаляет push-подписку по endpoint
 */
export async function deletePushSubscriptionByEndpoint(
  userId: string,
  endpoint: string,
): Promise<{ success: boolean; deletedCount: number }> {
  logger.info("Deleting push subscription", {
    userId,
    endpoint: endpoint.substring(0, 50) + "...",
  });

  const result = await prisma.pushSubscription.deleteMany({
    where: {
      userId,
      endpoint,
    },
  });

  logger.info("Deleted subscriptions", { deletedCount: result.count });
  return { success: true, deletedCount: result.count };
}

/**
 * Удаляет ВСЕ push-подписки пользователя
 */
export async function deleteAllPushSubscriptions(
  userId: string,
): Promise<{ success: boolean; deletedCount: number }> {
  logger.info("Deleting ALL subscriptions for user", { userId });

  const result = await prisma.pushSubscription.deleteMany({
    where: { userId },
  });

  logger.info("Deleted subscriptions", { deletedCount: result.count });
  return { success: true, deletedCount: result.count };
}

// ========== Get Subscription Status ==========

/**
 * Проверяет, есть ли у пользователя активные push-подписки и отдельно — Expo (мобильное приложение).
 * Веб-подписка без Expo не должна блокировать регистрацию токена на телефоне.
 */
export async function getUserSubscriptionStatus(
  userId: string,
): Promise<{ hasSubscription: boolean; hasExpoPushSubscription: boolean }> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true },
  });

  const hasSubscription = subscriptions.length > 0;
  const hasExpoPushSubscription = subscriptions.some(
    (s) =>
      s.endpoint.startsWith("ExponentPushToken[") || s.endpoint.startsWith("ExpoPushToken["),
  );

  return { hasSubscription, hasExpoPushSubscription };
}

/** Ответ проверки подписки для переданных endpoint'ов (текущее устройство). */
export interface PushSubscriptionDeviceStatus {
  /** Есть ли в БД запись с одним из переданных endpoint для этого пользователя */
  hasThisDeviceSubscription: boolean;
  /** false, если клиент прислал пустой список — сверить с БД нельзя */
  determined: boolean;
}

/**
 * Проверяет, зарегистрированы ли на сервере push-endpoint'ы этого устройства.
 * Пустой список: determined=false (нет токена с устройства — статус «неизвестен»).
 */
export async function getPushSubscriptionStatusForEndpoints(
  userId: string,
  endpoints: string[],
): Promise<PushSubscriptionDeviceStatus> {
  if (endpoints.length === 0) {
    return { hasThisDeviceSubscription: false, determined: false };
  }

  const count = await prisma.pushSubscription.count({
    where: {
      userId,
      endpoint: { in: endpoints },
    },
  });

  return {
    hasThisDeviceSubscription: count > 0,
    determined: true,
  };
}

/**
 * Получает количество активных push-подписок пользователя
 */
export async function getUserSubscriptionCount(
  userId: string,
): Promise<{ subscriptionCount: number }> {
  const count = await prisma.pushSubscription.count({
    where: { userId },
  });

  return { subscriptionCount: count };
}

/**
 * Получает список всех подписок пользователя
 */
export async function getUserSubscriptions(userId: string) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: {
      id: true,
      endpoint: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return { subscriptions };
}
