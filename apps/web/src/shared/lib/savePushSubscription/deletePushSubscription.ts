"use server";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { getCurrentUserId } from "@/utils";

// Создаем логгер для deletePushSubscription
const logger = createWebLogger('web-delete-push-subscription');

const endpointSchema = z.string().trim().min(1, "endpoint обязателен");

/**
 * Удаляет конкретную push-подписку по endpoint
 * Используется только когда пользователь явно отключает уведомления на конкретном устройстве
 */
export async function deletePushSubscriptionByEndpoint(endpoint: string) {
  const safeEndpoint = endpointSchema.parse(endpoint);
  try {
    const userId = await getCurrentUserId();
    logger.warn(
      "Удаление подписки для пользователя:",
      { 
        userId, 
        endpoint: safeEndpoint.substring(0, 50) + "...", 
        operation: 'warn' 
      }
    );

    // Удаляем только конкретную подписку по endpoint
    const result = await prisma.pushSubscription.deleteMany({
      where: { 
        userId,
        endpoint: safeEndpoint,
      },
    });

    logger.warn("Удалено подписок:", { deletedCount: result.count, operation: 'warn' });
    return { success: true, deletedCount: result.count };
  } catch (error) {
    logger.error("Ошибка при удалении push-подписки:", error as Error, { operation: 'error' });
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
    logger.warn("Удаление ВСЕХ подписок для пользователя:", { userId, operation: 'warn' });

    // Удаляем все подписки пользователя
    const result = await prisma.pushSubscription.deleteMany({
      where: { userId },
    });

    logger.warn("Удалено подписок:", { deletedCount: result.count, operation: 'warn' });
    return { success: true, deletedCount: result.count };
  } catch (error) {
    logger.error("Ошибка при удалении всех push-подписок:", error as Error, { operation: 'error' });
    throw new Error("Не удалось удалить подписки на уведомления");
  }
}
