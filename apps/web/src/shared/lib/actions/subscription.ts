"use server";

import { deletePushSubscriptionByEndpoint, deleteAllPushSubscriptions } from "@shared/lib/savePushSubscription/deletePushSubscription";

import { savePushSubscription } from "@shared/lib/savePushSubscription/savePushSubscription";

export async function updateSubscriptionAction(subscription: {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  keys: { p256dh: string; auth: string };
}) {
  try {
    await savePushSubscription(subscription);
    return { success: true };
  } catch (error) {
    console.error("Ошибка при сохранении подписки:", error);
    throw new Error("Ошибка при сохранении подписки");
  }
}

export async function deleteSubscriptionAction(endpoint?: string) {
  try {
    if (endpoint) {
      // Удаляем конкретную подписку по endpoint (для конкретного устройства)
      await deletePushSubscriptionByEndpoint(endpoint);
    } else {
      // Удаляем все подписки пользователя (только в крайних случаях)
      await deleteAllPushSubscriptions();
    }
    return { success: true };
  } catch (error) {
    console.error("Ошибка при удалении подписки:", error);
    throw new Error("Ошибка при удалении подписки");
  }
}
