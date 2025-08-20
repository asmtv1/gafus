"use server";

import { deletePushSubscription } from "@shared/lib/savePushSubscription/deletePushSubscription";

import { saveSubscription } from "@/utils";

export async function updateSubscriptionAction(subscription: {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  keys: { p256dh: string; auth: string };
}) {
  try {
    await saveSubscription(subscription);
    return { success: true };
  } catch (error) {
    console.error("Ошибка при сохранении подписки:", error);
    throw new Error("Ошибка при сохранении подписки");
  }
}

export async function deleteSubscriptionAction() {
  try {
    await deletePushSubscription();
    return { success: true };
  } catch (error) {
    console.error("Ошибка при удалении подписки:", error);
    throw new Error("Ошибка при удалении подписки");
  }
}
