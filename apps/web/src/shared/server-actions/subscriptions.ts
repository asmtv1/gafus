"use server";

/**
 * Server Actions для работы с push-подписками.
 * Обёртки над core с авторизацией через getCurrentUserId.
 */

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";
import {
  savePushSubscription as savePushSubscriptionService,
  deletePushSubscriptionByEndpoint as deletePushSubscriptionService,
  deleteAllPushSubscriptions as deleteAllPushSubscriptionsService,
  getUserSubscriptionStatus,
  getUserSubscriptionCount,
  getUserSubscriptions,
} from "@gafus/core/services/subscriptions";

const logger = createWebLogger("subscription-server-actions");

// ========== Schemas ==========

const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().min(1, "endpoint обязателен"),
  keys: z.object({
    p256dh: z.string().trim().min(1, "p256dh обязателен"),
    auth: z.string().trim().min(1, "auth обязателен"),
  }),
});

const updateSubscriptionSchema = z
  .object({
    id: z
      .string()
      .optional()
      .transform((value) => (value?.trim() ? value.trim() : undefined)),
    userId: z.string().trim().min(1, "userId обязателен"),
    endpoint: z.string().trim().min(1, "endpoint обязателен"),
    p256dh: z.string().trim().min(1, "p256dh обязателен"),
    auth: z.string().trim().min(1, "auth обязателен"),
    keys: z.object({
      p256dh: z.string().trim().min(1, "keys.p256dh обязателен"),
      auth: z.string().trim().min(1, "keys.auth обязателен"),
    }),
  })
  .strict();

const deleteSubscriptionSchema = z.object({
  endpoint: z.string().trim().min(1, "endpoint обязателен").optional(),
});

// ========== Server Actions ==========

/**
 * Сохраняет push-подписку пользователя
 */
export async function savePushSubscriptionAction(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const validatedSubscription = pushSubscriptionSchema.parse(subscription);

  try {
    const userId = await getCurrentUserId();
    await savePushSubscriptionService({
      userId,
      endpoint: validatedSubscription.endpoint,
      keys: validatedSubscription.keys,
    });
    return { success: true };
  } catch (error) {
    logger.error("Error saving push subscription", error as Error);
    throw new Error("Ошибка при сохранении подписки");
  }
}

/**
 * Обновляет push-подписку (для обратной совместимости)
 */
export async function updateSubscriptionAction(subscription: {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  keys: { p256dh: string; auth: string };
}) {
  if (!subscription.userId?.trim()) return { success: false };
  const parsedSubscription = updateSubscriptionSchema.parse(subscription);
  try {
    await savePushSubscriptionService({
      userId: parsedSubscription.userId,
      endpoint: parsedSubscription.endpoint,
      keys: parsedSubscription.keys,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message === "Пользователь не авторизован") {
      return { success: false };
    }
    logger.error("Ошибка при сохранении подписки", error as Error);
    throw new Error("Ошибка при сохранении подписки");
  }
}

/**
 * Удаляет push-подписку по endpoint или все подписки пользователя
 */
export async function deleteSubscriptionAction(endpoint?: string) {
  const { endpoint: parsedEndpoint } = deleteSubscriptionSchema.parse({ endpoint });

  try {
    const userId = await getCurrentUserId();

    if (parsedEndpoint) {
      // Удаляем конкретную подписку по endpoint
      logger.info("Удаление подписки для пользователя", {
        userId,
        endpoint: parsedEndpoint.substring(0, 50) + "...",
      });
      await deletePushSubscriptionService(userId, parsedEndpoint);
    } else {
      // Удаляем все подписки пользователя
      logger.warn("Удаление ВСЕХ подписок для пользователя", { userId });
      await deleteAllPushSubscriptionsService(userId);
    }

    return { success: true };
  } catch (error) {
    logger.error("Ошибка при удалении подписки", error as Error);
    throw new Error("Ошибка при удалении подписки");
  }
}

/**
 * Проверяет статус подписки пользователя
 */
export async function getSubscriptionStatusAction() {
  try {
    const userId = await getCurrentUserId();
    return getUserSubscriptionStatus(userId);
  } catch (error) {
    logger.error("Error getting subscription status", error as Error);
    return { hasSubscription: false };
  }
}

/**
 * Получает количество активных подписок пользователя
 */
export async function getSubscriptionCountAction() {
  try {
    const userId = await getCurrentUserId();
    return getUserSubscriptionCount(userId);
  } catch (error) {
    logger.error("Error getting subscription count", error as Error);
    return { subscriptionCount: 0 };
  }
}

/**
 * Получает список подписок пользователя
 */
export async function getUserSubscriptionsAction() {
  try {
    const userId = await getCurrentUserId();
    return getUserSubscriptions(userId);
  } catch (error) {
    logger.error("Error getting user subscriptions", error as Error);
    return { subscriptions: [] };
  }
}
