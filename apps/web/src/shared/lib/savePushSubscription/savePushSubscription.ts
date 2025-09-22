"use server";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import { z } from "zod";

import type { PushSubscriptionJSON } from "@gafus/types";

import { getCurrentUserId } from "@/utils";
import { authOptions } from "@gafus/auth";

const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().min(1, "endpoint обязателен"),
  keys: z.object({
    p256dh: z.string().trim().min(1, "p256dh обязателен"),
    auth: z.string().trim().min(1, "auth обязателен"),
  }),
});

/**
 * Сохраняет подписку в БД. Если запись с таким endpoint уже есть,
 * обновляет ключи, иначе создаёт новую запись, связав с пользователем.
 */

export async function savePushSubscription(subscription: PushSubscriptionJSON) {
  const validatedSubscription = pushSubscriptionSchema.parse(subscription);
  const userId = await getCurrentUserId();
  

  // Проверяем существование пользователя
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  

  if (!user) {
    console.error("savePushSubscription: User not found in database, userId:", userId);
    
    // Попробуем найти пользователя по username из JWT токена
    const session = await getServerSession(authOptions as NextAuthOptions);
    if (session?.user?.username) {
      const userByUsername = await prisma.user.findUnique({
        where: { username: session.user.username },
        select: { id: true },
      });
      
      if (userByUsername) {
        // Используем правильный ID
        const correctUserId = userByUsername.id;
        
        // Проверяем существование подписки по endpoint
        const existingSubscription = await prisma.pushSubscription.findFirst({
          where: { endpoint: validatedSubscription.endpoint },
        });
        
        if (existingSubscription) {
          // Обновляем существующую подписку
          return prisma.pushSubscription.update({
            where: { id: existingSubscription.id },
            data: {
              keys: validatedSubscription.keys,
              userId: correctUserId,
              updatedAt: new Date(),
            },
          });
        } else {
          // Создаем новую подписку
          return prisma.pushSubscription.create({
            data: {
              endpoint: validatedSubscription.endpoint,
              keys: validatedSubscription.keys,
              userId: correctUserId,
            },
          });
        }
      }
    }
    
    throw new Error(`Пользователь с ID ${userId} не найден в базе данных`);
  }

  // Проверяем существование подписки по endpoint
  const existingSubscription = await prisma.pushSubscription.findFirst({
    where: { endpoint: validatedSubscription.endpoint },
  });
  
  if (existingSubscription) {
    // Обновляем существующую подписку
    return prisma.pushSubscription.update({
      where: { id: existingSubscription.id },
      data: {
        keys: validatedSubscription.keys,
        userId,
        updatedAt: new Date(),
      },
    });
  } else {
    // Создаем новую подписку
    return prisma.pushSubscription.create({
      data: {
        endpoint: validatedSubscription.endpoint,
        keys: validatedSubscription.keys,
        userId,
      },
    });
  }
}
