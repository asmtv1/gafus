"use server";
import { prisma } from "@gafus/prisma";

import type { PushSubscriptionJSON } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

/**
 * Сохраняет подписку в БД. Если запись с таким endpoint уже есть,
 * обновляет ключи, иначе создаёт новую запись, связав с пользователем.
 */

export async function savePushSubscription(subscription: PushSubscriptionJSON) {
  const userId = await getCurrentUserId();

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
