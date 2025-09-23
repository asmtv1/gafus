"use server";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { getCurrentUserId } from "@/utils";

// Создаем логгер для getUserSubscriptionStatus
const logger = createWebLogger('web-get-user-subscription-status');

/**
 * Проверяет, есть ли у пользователя активная push-подписка
 */
export async function getUserSubscriptionStatus() {
  try {
    const userId = await getCurrentUserId();

    // Простой Prisma запрос без таймаута
    const subscription = await prisma.pushSubscription.findFirst({
      where: { userId },
      select: { id: true },
    });

    const hasSubscription = !!subscription;
    return { hasSubscription };
    
  } catch (error) {
    logger.error("❌ getUserSubscriptionStatus: Ошибка:", error as Error, { operation: 'error' });
    return { hasSubscription: false };
  }
}

/**
 * Получает количество активных push-подписок пользователя
 */
export async function getUserSubscriptionCount() {
  try {
    const userId = await getCurrentUserId();

    const count = await prisma.pushSubscription.count({
      where: { userId },
    });

    return { subscriptionCount: count };
  } catch (error) {
    logger.error("Ошибка при получении количества подписок:", error as Error, { operation: 'error' });
    return { subscriptionCount: 0 };
  }
}

/**
 * Получает список всех подписок пользователя с деталями
 */
export async function getUserSubscriptions() {
  try {
    const userId = await getCurrentUserId();

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
      select: {
        id: true,
        endpoint: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { subscriptions };
  } catch (error) {
    logger.error("Ошибка при получении списка подписок:", error as Error, { operation: 'error' });
    return { subscriptions: [] };
  }
}
