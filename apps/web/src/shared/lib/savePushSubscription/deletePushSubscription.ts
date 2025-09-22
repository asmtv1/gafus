"use server";
import { prisma } from "@gafus/prisma";
import { z } from "zod";

import { getCurrentUserId } from "@/utils";

const endpointSchema = z.string().trim().min(1, "endpoint обязателен");

/**
 * Удаляет конкретную push-подписку по endpoint
 * Используется только когда пользователь явно отключает уведомления на конкретном устройстве
 */
export async function deletePushSubscriptionByEndpoint(endpoint: string) {
  const safeEndpoint = endpointSchema.parse(endpoint);
  try {
    const userId = await getCurrentUserId();
    console.warn(
      "Удаление подписки для пользователя:",
      userId,
      "endpoint:",
      safeEndpoint.substring(0, 50) + "...",
    );

    // Удаляем только конкретную подписку по endpoint
    const result = await prisma.pushSubscription.deleteMany({
      where: { 
        userId,
        endpoint: safeEndpoint,
      },
    });

    console.warn("Удалено подписок:", result.count);
    return { success: true, deletedCount: result.count };
  } catch (error) {
    console.error("Ошибка при удалении push-подписки:", error);
    throw new Error("Не удалось удалить подписку на уведомления");
  }
}

/**
 * Удаляет ВСЕ push-подписки пользователя
 * Используется только в крайних случаях (удаление аккаунта, глобальное отключение)
 */
export async function deleteAllPushSubscriptions() {
  try {
    const userId = await getCurrentUserId();
    console.warn("Удаление ВСЕХ подписок для пользователя:", userId);

    // Удаляем все подписки пользователя
    const result = await prisma.pushSubscription.deleteMany({
      where: { userId },
    });

    console.warn("Удалено подписок:", result.count);
    return { success: true, deletedCount: result.count };
  } catch (error) {
    console.error("Ошибка при удалении всех push-подписок:", error);
    throw new Error("Не удалось удалить подписки на уведомления");
  }
}
