"use server";
import { prisma } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";

/**
 * Проверяет, есть ли у пользователя активная push-подписка
 */
export async function getUserSubscriptionStatus() {
  console.log("🚀 getUserSubscriptionStatus: Начинаем проверку статуса подписки");
  
  try {
    console.log("🔧 getUserSubscriptionStatus: Получаем userId...");
    const userId = await getCurrentUserId();
    console.log("✅ getUserSubscriptionStatus: userId получен:", userId);

    // Простой Prisma запрос без таймаута
    console.log("🔧 getUserSubscriptionStatus: Создаем Prisma запрос...");
    const subscription = await prisma.pushSubscription.findFirst({
      where: { userId },
      select: { id: true },
    });
    
    console.log("✅ getUserSubscriptionStatus: Запрос выполнен, результат:", subscription);

    const hasSubscription = !!subscription;
    console.log("✅ getUserSubscriptionStatus: Возвращаем результат:", { hasSubscription });
    return { hasSubscription };
    
  } catch (error) {
    console.error("❌ getUserSubscriptionStatus: Ошибка:", error);
    console.log("🔧 getUserSubscriptionStatus: Ошибка базы данных, возвращаем hasSubscription: false");
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
    console.error("Ошибка при получении количества подписок:", error);
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
    console.error("Ошибка при получении списка подписок:", error);
    return { subscriptions: [] };
  }
}
