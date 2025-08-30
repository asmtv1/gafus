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

    // Создаем Prisma запрос с таймаутом
    console.log("🔧 getUserSubscriptionStatus: Создаем Prisma запрос...");
    const subscriptionPromise = prisma.pushSubscription.findFirst({
      where: { userId },
      select: { id: true },
    });
    
    // Таймаут 10 секунд для Prisma запроса
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => {
        console.log("⏰ getUserSubscriptionStatus: Таймаут истек!");
        reject(new Error("Database query timeout"));
      }, 10000); // 10 секунд
    });
    
    console.log("🔧 getUserSubscriptionStatus: Запускаем запрос с таймаутом");
    const subscription = await Promise.race([subscriptionPromise, timeoutPromise]);
    console.log("✅ getUserSubscriptionStatus: Запрос выполнен, результат:", subscription);

    const hasSubscription = !!subscription;
    console.log("✅ getUserSubscriptionStatus: Возвращаем результат:", { hasSubscription });
    return { hasSubscription };
    
  } catch (error) {
    console.error("❌ getUserSubscriptionStatus: Ошибка:", error);
    
    if (error instanceof Error && error.message.includes("timeout")) {
      console.log("🔧 getUserSubscriptionStatus: Таймаут, возвращаем hasSubscription: false");
      return { hasSubscription: false };
    }
    
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
