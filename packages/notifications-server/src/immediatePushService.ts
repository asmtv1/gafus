/**
 * Helper для отправки немедленных пуш-уведомлений
 * Используется для событий, требующих мгновенного уведомления (например, зачёт экзамена)
 */

import { randomUUID } from "node:crypto";
import type { ConsultationReminderPush } from "@gafus/consultation-shared/reminder-window";
import { prisma } from "@gafus/prisma";
import { pushQueue } from "@gafus/queues";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("core-immediate-push");

export interface ImmediatePushOptions {
  userId: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  consultationReminder?: ConsultationReminderPush;
}

/**
 * Отправляет немедленное пуш-уведомление пользователю
 *
 * @param options - Параметры уведомления
 * @returns Promise<{ success: boolean; notificationId?: string; error?: string }>
 *
 * @example
 * await sendImmediatePushNotification({
 *   userId: "user123",
 *   title: "Экзамен зачтён! ✅",
 *   body: "Ваш экзамен успешно проверен тренером",
 *   url: "/trainings/authors/1"
 * });
 */
export async function sendImmediatePushNotification(
  options: ImmediatePushOptions,
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
  try {
    const { userId, title, body, url, consultationReminder } = options;
    const id = randomUUID();
    const jobId = "immediate-" + id;
    const now = new Date();
    // Delivery looks up the user's current subscriptions. Do not persist a copy of endpoint secrets.
    const subscription = await prisma.pushSubscription.findFirst({ where: { userId }, select: { id: true } });
    if (!subscription) return { success: false, error: "У пользователя нет активных подписок" };

    const data = {
      id, userId, jobId, day: 0, stepIndex: 0, endTs: Math.floor(now.getTime() / 1000),
      sent: false, paused: false, stepTitle: `${title}|${body}`, type: "immediate",
      url: url || "/", subscription: {},
    };
    const notification = consultationReminder
      ? await prisma.stepNotification.upsert({
          where: { consultationBookingId_consultationReminderKey: {
            consultationBookingId: consultationReminder.bookingId, consultationReminderKey: consultationReminder.key,
          } },
          create: { ...data, consultationBookingId: consultationReminder.bookingId,
            consultationReminderKey: consultationReminder.key, consultationRetryAt: now },
          update: {},
        })
      : await prisma.stepNotification.create({ data });
    if (consultationReminder) {
      // Only one producer schedules a given reminder during the lease. An interrupted Redis enqueue
      // becomes eligible again during the meeting window, using the original stable job ID.
      const claim = await prisma.stepNotification.updateMany({
        where: { id: notification.id, userId, sent: false, paused: false, consultationRetryAt: { lte: now } },
        data: { consultationRetryAt: new Date(now.getTime() + 60_000) },
      });
      if (!claim.count) return { success: true, notificationId: notification.id };
    }
    await pushQueue.add("push", { notificationId: notification.id }, {
      jobId: notification.jobId ?? jobId, delay: 0, attempts: 3, backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: true, removeOnFail: Boolean(consultationReminder),
    });
    return {
      success: true,
      notificationId: notification.id,
    };
  } catch (error) {
    logger.error("Ошибка отправки немедленного пуш-уведомления", error as Error, {
      userId: options.userId,
      title: options.title,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
