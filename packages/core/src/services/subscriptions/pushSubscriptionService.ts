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
 * Проверяет, есть ли у пользователя активная push-подписка
 */
export async function getUserSubscriptionStatus(
  userId: string,
): Promise<{ hasSubscription: boolean }> {
  const subscription = await prisma.pushSubscription.findFirst({
    where: { userId },
    select: { id: true },
  });

  return { hasSubscription: !!subscription };
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
