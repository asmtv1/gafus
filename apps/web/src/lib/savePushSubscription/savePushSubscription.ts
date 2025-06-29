"use server";
import { prisma } from "@prisma";
import { getCurrentUserId } from "@web/utils/getCurrentUserId";

export type PushSubscriptionJSON = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

/**
 * Сохраняет подписку в БД. Если запись с таким endpoint уже есть,
 * обновляет ключи, иначе создаёт новую запись, связав с пользователем.
 */

export async function savePushSubscription(subscription: PushSubscriptionJSON) {
  const userId = await getCurrentUserId();
  return prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: { keys: subscription.keys },
    create: {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userId, // связываем подписку с пользователем
    },
  });
}
