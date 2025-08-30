"use server";
import { prisma } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";

/**
 * Проверяет, есть ли у пользователя активная push-подписка
 */
export async function getUserSubscriptionStatus() {
  console.log("🚀 getUserSubscriptionStatus: Начинаем проверку статуса подписки");
  
  // Пробуем несколько раз с увеличивающимся таймаутом
  const retries = 3;
  const baseTimeout = 3000; // 3 секунды
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔧 getUserSubscriptionStatus: Попытка ${attempt}/${retries}`);
      console.log("🔧 getUserSubscriptionStatus: Получаем userId...");
      const userId = await getCurrentUserId();
      console.log("✅ getUserSubscriptionStatus: userId получен:", userId);

      // Добавляем таймаут для Prisma запроса
      console.log("🔧 getUserSubscriptionStatus: Создаем Prisma запрос...");
      const subscriptionPromise = prisma.pushSubscription.findFirst({
        where: { userId },
        select: { id: true },
      });
      
      const timeout = baseTimeout * attempt; // Увеличиваем таймаут с каждой попыткой
      console.log(`🔧 getUserSubscriptionStatus: Создаем промис с таймаутом ${timeout}мс`);
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => {
          console.log(`⏰ getUserSubscriptionStatus: Таймаут истек на попытке ${attempt}!`);
          reject(new Error(`Database query timeout (attempt ${attempt})`));
        }, timeout);
      });
      
      console.log("🔧 getUserSubscriptionStatus: Запускаем гонку между запросом и таймаутом");
      const subscription = await Promise.race([subscriptionPromise, timeoutPromise]);
      console.log("✅ getUserSubscriptionStatus: Запрос выполнен, результат:", subscription);

      const hasSubscription = !!subscription;
      console.log("✅ getUserSubscriptionStatus: Возвращаем результат:", { hasSubscription });
      return { hasSubscription };
      
    } catch (error) {
      console.error(`❌ getUserSubscriptionStatus: Ошибка на попытке ${attempt}:`, error);
      
      if (attempt === retries) {
        console.log("🔧 getUserSubscriptionStatus: Все попытки исчерпаны, возвращаем hasSubscription: false");
        return { hasSubscription: false };
      }
      
      // Ждем перед следующей попыткой
      const waitTime = 1000 * attempt; // 1с, 2с, 3с
      console.log(`⏳ getUserSubscriptionStatus: Ждем ${waitTime}мс перед следующей попыткой...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  // Fallback
  console.log("🔧 getUserSubscriptionStatus: Fallback - возвращаем hasSubscription: false");
  return { hasSubscription: false };
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
