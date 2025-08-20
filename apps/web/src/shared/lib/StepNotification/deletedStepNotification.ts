"use server";

import { prisma } from "@gafus/prisma";
import { pushQueue } from "@gafus/queues";

import { getCurrentUserId } from "@/utils";

/**
 * Приостанавливает отправку push-уведомления по шагу тренировки
 * удаляя задачу из очереди и запись из базы.
 *
 * @param day - номер дня тренировки
 * @param stepIndex - индекс шага
 * @param pause - true для паузы (удаление), false — N/A (возобновление требует создания заново)
 * @param jobId - ID задачи в очереди (если известен)
 */
export async function deletedStepNotification(day: number, stepIndex: number, deleted: boolean) {
  const userId = await getCurrentUserId();

  // Находим активное уведомление
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

  if (deleted) {
    // Удаляем задачу из очереди
    const jobToRemoveId = notif.jobId;
    if (jobToRemoveId) {
      const job = await pushQueue.getJob(jobToRemoveId);
      if (job) await job.remove();
    }

    // Удаляем саму запись из БД
    await prisma.stepNotification.delete({
      where: { id: notif.id },
    });

    return { success: true };
  } else {
    // ❌ Возобновление невозможно — запись удалена
    return {
      success: false,
      error: "Cannot resume. Notification was deleted on pause.",
    };
  }
}
