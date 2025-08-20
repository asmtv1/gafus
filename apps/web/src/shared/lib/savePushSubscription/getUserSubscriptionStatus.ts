"use server";
import { prisma } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";

/**
 * Проверяет, есть ли у пользователя активная push-подписка
 */
export async function getUserSubscriptionStatus() {
  try {
    const userId = await getCurrentUserId();

    const subscription = await prisma.pushSubscription.findFirst({
      where: { userId },
      select: { id: true },
    });

    return { hasSubscription: !!subscription };
  } catch (error) {
    console.error("Ошибка при проверке статуса подписки:", error);
    return { hasSubscription: false };
  }
}
