"use server";

import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

import {
  deletePushSubscriptionByEndpoint,
  deleteAllPushSubscriptions,
} from "@shared/lib/savePushSubscription/deletePushSubscription";

import { savePushSubscription } from "@shared/lib/savePushSubscription/savePushSubscription";

const logger = createWebLogger("web-subscription-action");

const pushSubscriptionSchema = z
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

export async function updateSubscriptionAction(subscription: {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  keys: { p256dh: string; auth: string };
}) {
  const parsedSubscription = pushSubscriptionSchema.parse(subscription);
  try {
    await savePushSubscription(parsedSubscription);
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при сохранении подписки:", error as Error, { operation: "error" });
    throw new Error("Ошибка при сохранении подписки");
  }
}

export async function deleteSubscriptionAction(endpoint?: string) {
  const { endpoint: parsedEndpoint } = deleteSubscriptionSchema.parse({ endpoint });
  try {
    if (parsedEndpoint) {
      // Удаляем конкретную подписку по endpoint (для конкретного устройства)
      await deletePushSubscriptionByEndpoint(parsedEndpoint);
    } else {
      // Удаляем все подписки пользователя (только в крайних случаях)
      await deleteAllPushSubscriptions();
    }
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при удалении подписки:", error as Error, { operation: "error" });
    throw new Error("Ошибка при удалении подписки");
  }
}
