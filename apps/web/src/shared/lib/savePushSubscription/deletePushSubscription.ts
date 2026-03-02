"use server";

import { z } from "zod";
import { createWebLogger } from "@gafus/logger";
import {
  deletePushSubscriptionByEndpoint as deleteByEndpointInCore,
  deleteAllPushSubscriptions as deleteAllInCore,
} from "@gafus/core/services/subscriptions";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

const logger = createWebLogger("web-delete-push-subscription");

const endpointSchema = z.string().trim().min(1, "endpoint обязателен");

/**
 * Удаляет конкретную push-подписку по endpoint. Обёртка над core.
 */
export async function deletePushSubscriptionByEndpoint(endpoint: string) {
  const safeEndpoint = endpointSchema.parse(endpoint);
  try {
    const userId = await getCurrentUserId();
    logger.info("Удаление подписки для пользователя", {
      userId,
      endpoint: safeEndpoint.substring(0, 50) + "...",
    });
    return deleteByEndpointInCore(userId, safeEndpoint);
  } catch (error) {
    logger.error("Ошибка при удалении push-подписки:", error as Error, { operation: "error" });
    throw new Error("Не удалось удалить подписку на уведомления");
  }
}

/**
 * Удаляет ВСЕ push-подписки пользователя. Обёртка над core.
 */
export async function deleteAllPushSubscriptions() {
  try {
    const userId = await getCurrentUserId();
    logger.warn("Удаление ВСЕХ подписок для пользователя", { userId });
    return deleteAllInCore(userId);
  } catch (error) {
    logger.error("Ошибка при удалении всех push-подписок:", error as Error, { operation: "error" });
    throw new Error("Не удалось удалить подписки на уведомления");
  }
}
