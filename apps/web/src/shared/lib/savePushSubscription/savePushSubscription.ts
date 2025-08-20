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
  return prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: { keys: subscription.keys as { p256dh: string; auth: string } },
    create: {
      endpoint: subscription.endpoint,
      keys: subscription.keys as { p256dh: string; auth: string },
      userId, // связываем подписку с пользователем
    },
  });
}
