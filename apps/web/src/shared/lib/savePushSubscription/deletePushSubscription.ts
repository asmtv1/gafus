"use server";
import { prisma } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";

/**
 * Удаляет push-подписку пользователя из БД
 */
export async function deletePushSubscription() {
  try {
    const userId = await getCurrentUserId();
    console.warn("Удаление подписки для пользователя:", userId);

    // Удаляем все подписки пользователя
    const result = await prisma.pushSubscription.deleteMany({
      where: { userId },
    });

    console.warn("Удалено подписок:", result.count);
    return { success: true, deletedCount: result.count };
  } catch (error) {
    console.error("Ошибка при удалении push-подписки:", error);
    throw new Error("Не удалось удалить подписку на уведомления");
  }
}
