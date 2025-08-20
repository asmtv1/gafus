"use server";

import { prisma } from "@gafus/prisma";
import webpush from "@gafus/webpush";
import { revalidatePath } from "next/cache";

import { savePushSubscription } from "../shared/lib/savePushSubscription/savePushSubscription";
import { getCurrentUserId } from "./getCurrentUserId";

import type { PushSubscriptionJSON } from "@gafus/types";
/**
 * Возвращает публичный VAPID-ключ для Push API.
 */
export async function getVapidPublicKey(): Promise<string> {
  if (!process.env.VAPID_PUBLIC_KEY) {
    throw new Error("VAPID_PUBLIC_KEY is not set in env");
  }
  // Читаем ключ из переменных окружения
  return process.env.VAPID_PUBLIC_KEY!;
}

/**
 * Сохраняет PushSubscription пользователя в БД.
 * 1) Получает userId через getCurrentUserId().
 * 2) Вызывает savePushSubscription() с userId и subscription.
 */
export async function saveSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  await savePushSubscription(subscription);
}

/**
 * Отправляет пуш-уведомление всем подписчикам пользователя.
 * Если userId не передан, определяется из текущей сессии.
 * @param payload - Данные для уведомления (строка или JSON).
 * @param userIdOverride - Необязательный userId для явной отправки конкретному пользователю.
 */
export async function sendPushToUser(
  payload: string | Record<string, unknown>,
  userIdOverride?: string,
): Promise<void> {
  // Если payload — просто строка, упаковываем в { body: string }
  const data = typeof payload === "string" ? { body: payload } : payload;

  const payloadString = JSON.stringify(data);

  try {
    const userId = userIdOverride ?? (await getCurrentUserId());

    // Получаем реальные подписки пользователя из БД
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { endpoint: true, keys: true },
    });

    if (subscriptions.length === 0) {
      return;
    }

    // Отправляем push через каждую подписку
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys as { p256dh: string; auth: string },
            },
            payloadString,
          );
          return { success: true, endpoint: sub.endpoint };
        } catch (error: unknown) {
          console.error("❌ Ошибка отправки push на", sub.endpoint, ":", error);
          // Авто-очистка недействительных подписок (404/410)
          if (typeof error === "object" && error !== null && "statusCode" in error) {
            const statusCode = (error as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
              try {
                await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
                console.warn("🧹 Удалена недействительная подписка:", sub.endpoint);
              } catch (dbErr) {
                console.error("Не удалось удалить подписку из БД:", dbErr);
              }
            }
          }
          return { success: false, endpoint: sub.endpoint, error };
        }
      }),
    );

    const _successful = results.filter((r: { status: string; value: { success: boolean } }) => r.status === "fulfilled" && r.value.success).length;
  } catch (error) {
    console.error("❌ Ошибка при отправке push:", error);
  }

  // Инвалидируем кэшированную страницу
  revalidatePath("/");
}

/**
 * Отправляет пуш-уведомление ВСЕМ пользователям системы.
 * Используется для массовых уведомлений (новости, обновления, системные сообщения).
 * @param payload - Данные для уведомления (строка или JSON).
 */
export async function sendPushToAll(payload: string | Record<string, unknown>): Promise<void> {
  const data = typeof payload === "string" ? { body: payload } : payload;
  const payloadString = JSON.stringify(data);

  try {
    // Получаем ВСЕ подписки из БД
    const allSubscriptions = await prisma.pushSubscription.findMany({
      select: { endpoint: true, keys: true, userId: true },
    });

    if (allSubscriptions.length === 0) {
      return;
    }

    // Отправляем push через каждую подписку
    const results = await Promise.allSettled(
      allSubscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys as { p256dh: string; auth: string },
            },
            payloadString,
          );
          return { success: true, endpoint: sub.endpoint, userId: sub.userId };
        } catch (error) {
          console.error("❌ Ошибка отправки push на", sub.endpoint, ":", error);
          return { success: false, endpoint: sub.endpoint, userId: sub.userId, error };
        }
      }),
    );

    const _successful = results.filter((r: { status: string; value: { success: boolean } }) => r.status === "fulfilled" && r.value.success).length;
  } catch (error) {
    console.error("❌ Ошибка при отправке push всем пользователям:", error);
  }

  // Инвалидируем кэшированную страницу
  revalidatePath("/");
}
