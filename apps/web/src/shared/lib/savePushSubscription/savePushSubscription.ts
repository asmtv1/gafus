"use server";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";

import type { PushSubscriptionJSON } from "@gafus/types";

import { getCurrentUserId } from "@/utils";
import { authOptions } from "@gafus/auth";

/**
 * Сохраняет подписку в БД. Если запись с таким endpoint уже есть,
 * обновляет ключи, иначе создаёт новую запись, связав с пользователем.
 */

export async function savePushSubscription(subscription: PushSubscriptionJSON) {
  const userId = await getCurrentUserId();
  
  console.log("savePushSubscription: userId from getCurrentUserId:", userId);

  // Проверяем существование пользователя
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  console.log("savePushSubscription: user found:", user);

  if (!user) {
    console.error("savePushSubscription: User not found in database, userId:", userId);
    
    // Попробуем найти пользователя по username из JWT токена
    const session = await getServerSession(authOptions);
    if (session?.user?.username) {
      const userByUsername = await prisma.user.findUnique({
        where: { username: session.user.username },
        select: { id: true },
      });
      console.log("savePushSubscription: user found by username:", userByUsername);
      
      if (userByUsername) {
        console.log("savePushSubscription: Using user ID from username lookup:", userByUsername.id);
        // Используем правильный ID
        const correctUserId = userByUsername.id;
        
        // Сначала ищем существующую подписку для пользователя
        const existingSubscription = await prisma.pushSubscription.findFirst({
          where: { userId: correctUserId },
        });

        if (existingSubscription) {
          // Обновляем существующую подписку (включая endpoint)
          return prisma.pushSubscription.update({
            where: { id: existingSubscription.id },
            data: {
              endpoint: subscription.endpoint,
              keys: subscription.keys as { p256dh: string; auth: string },
              updatedAt: new Date(),
            },
          });
        } else {
          // Создаем новую подписку для пользователя
          return prisma.pushSubscription.create({
            data: {
              endpoint: subscription.endpoint,
              keys: subscription.keys as { p256dh: string; auth: string },
              userId: correctUserId,
            },
          });
        }
      }
    }
    
    throw new Error(`Пользователь с ID ${userId} не найден в базе данных`);
  }

  // Сначала ищем существующую подписку для пользователя
  const existingSubscription = await prisma.pushSubscription.findFirst({
    where: { userId },
  });

  if (existingSubscription) {
    // Обновляем существующую подписку (включая endpoint)
    return prisma.pushSubscription.update({
      where: { id: existingSubscription.id },
      data: {
        endpoint: subscription.endpoint,
        keys: subscription.keys as { p256dh: string; auth: string },
        updatedAt: new Date(),
      },
    });
  } else {
    // Создаем новую подписку для пользователя
    return prisma.pushSubscription.create({
      data: {
        endpoint: subscription.endpoint,
        keys: subscription.keys as { p256dh: string; auth: string },
        userId,
      },
    });
  }
}
