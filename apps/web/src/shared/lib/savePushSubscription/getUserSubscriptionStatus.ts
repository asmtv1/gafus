"use server";

import { createWebLogger } from "@gafus/logger";
import {
  getUserSubscriptionStatus as getUserSubscriptionStatusFromCore,
  getUserSubscriptionCount as getUserSubscriptionCountFromCore,
  getUserSubscriptions as getUserSubscriptionsFromCore,
} from "@gafus/core/services/subscriptions";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

const logger = createWebLogger("web-get-user-subscription-status");

/**
 * Проверяет, есть ли у пользователя активная push-подписка. Обёртка над core.
 */
export async function getUserSubscriptionStatus() {
  try {
    const userId = await getCurrentUserId();
    return getUserSubscriptionStatusFromCore(userId);
  } catch (error) {
    if (error instanceof Error && error.message === "Пользователь не авторизован") {
      return { hasSubscription: false };
    }
    logger.error("Ошибка getUserSubscriptionStatus", error as Error, { operation: "error" });
    return { hasSubscription: false };
  }
}

/**
 * Получает количество активных push-подписок пользователя. Обёртка над core.
 */
export async function getUserSubscriptionCount() {
  try {
    const userId = await getCurrentUserId();
    return getUserSubscriptionCountFromCore(userId);
  } catch (error) {
    logger.error("Ошибка при получении количества подписок", error as Error, {
      operation: "error",
    });
    return { subscriptionCount: 0 };
  }
}

/**
 * Получает список всех подписок пользователя. Обёртка над core.
 */
export async function getUserSubscriptions() {
  try {
    const userId = await getCurrentUserId();
    return getUserSubscriptionsFromCore(userId);
  } catch (error) {
    if (error instanceof Error && error.message === "Пользователь не авторизован") {
      return { subscriptions: [] };
    }
    logger.error("Ошибка при получении списка подписок", error as Error, { operation: "error" });
    return { subscriptions: [] };
  }
}
