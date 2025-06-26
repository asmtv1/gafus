"use server";

import webpush from "@/lib/webpush/webpush";
import { revalidatePath } from "next/cache";
import {
  savePushSubscription,
  getAllSubscriptions,
  PushSubscriptionJSON,
} from "@/lib/webpush/savePushSubscription";

/**
 * Возвращает публичный VAPID-ключ для Push API.
 */
export async function getVapidPublicKey(): Promise<string> {
  // Читаем ключ из переменных окружения
  return process.env.VAPID_PUBLIC_KEY!;
}

/**
 * Сохраняет PushSubscription пользователя в БД.
 * 1) Получает userId через getCurrentUserId().
 * 2) Вызывает savePushSubscription() с userId и subscription.
 */
export async function saveSubscription(
  subscription: PushSubscriptionJSON
): Promise<void> {
  await savePushSubscription(subscription);
}

/**
 * Отправляет пуш-уведомление всем подписчикам.
 * 1) Загружает все подписки из БД.
 * 2) Для каждой подписки вызывает webpush.sendNotification().
 * 3) Ревалидирует кэш страниц через revalidatePath.
 *
 * @param payload - Данные для уведомления (строка или JSON).
 */
export async function sendPushToAll(
  payload: string | Record<string, unknown>
): Promise<void> {
  // Если payload — просто строка, упаковываем в { body: string }
  const data = typeof payload === "string" ? { body: payload } : payload;

  const payloadString = JSON.stringify(data);

  const subs = await getAllSubscriptions();
  await Promise.all(
    subs.map((sub: PushSubscriptionJSON) =>
      webpush.sendNotification(sub, payloadString)
    )
  );

  // Инвалидируем кэшированную страницу
  revalidatePath("/");
}
