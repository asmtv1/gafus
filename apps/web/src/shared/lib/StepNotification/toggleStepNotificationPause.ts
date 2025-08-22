"use server";

import { prisma } from "@gafus/prisma";
import { pushQueue } from "@gafus/queues";

import { getCurrentUserId } from "@/utils";

/**
 * Приостанавливает или возобновляет отправку push-уведомления по шагу тренировки.
 *
 * @param day - номер дня тренировки
 * @param stepIndex - индекс шага
 * @param pause - true для паузы, false для возобновления
 * @param jobId -  ID задачи в очереди
 */
export async function toggleStepNotificationPause(day: number, stepIndex: number, pause: boolean) {
  const userId = await getCurrentUserId();
  const now = Math.floor(Date.now() / 1000);

  // Находим активное уведомление для текущего пользователя, дня и шага
  const notif = await prisma.stepNotification.findFirst({
    where: {
      userId,
      day,
      stepIndex,
      sent: false,
    },
  });

  if (!notif) {
    return { success: false, error: "Notification not found" };
  }

  if (pause) {
    // Пауза: удаляем задачу из очереди и сохраняем оставшееся время
    const remaining = Math.max(notif.endTs - now, 0);

    const jobToRemoveId = notif.jobId;

    if (jobToRemoveId) {
      const job = await pushQueue.getJob(jobToRemoveId);
      if (job) {
        await job.remove();
      }
    }

    await prisma.stepNotification.update({
      where: { id: notif.id },
      data: {
        paused: true,
        remainingSec: remaining,
        jobId: null,
      },
    });
  } else {
    // Возобновление: ставим задачу заново с оставшимся временем
    const remainingSec = notif.remainingSec ?? 60;
    const delayMs = remainingSec * 1000;
    const newEndTs = now + remainingSec;

    const job = await pushQueue.add(
      "send-step-notification",
      { notificationId: notif.id },
      {
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    await prisma.stepNotification.update({
      where: { id: notif.id },
      data: {
        endTs: newEndTs,
        paused: false,
        remainingSec: null,
        jobId: job.id,
      },
    });
  }

  return { success: true };
}
