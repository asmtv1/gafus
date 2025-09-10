import { prisma } from "@gafus/prisma";
import { pushQueue } from "@gafus/queues";

/**
 * Приостанавливает уведомление (удаляет из очереди, но оставляет в БД)
 */
export async function pauseStepNotification(
  userId: string,
  day: number,
  stepIndex: number,
): Promise<void> {
  try {
    // Находим уведомление по userId, day, stepIndex
    // Ищем самое свежее неотправленное уведомление
    const notification = await prisma.stepNotification.findFirst({
      where: {
        userId,
        day,
        stepIndex,
        sent: false, // Только неотправленные
      },
      orderBy: {
        createdAt: "desc", // Берем самое свежее
      },
    });

    if (!notification || !notification.jobId) {
      console.warn(`No active notification found for user ${userId}, day ${day}, step ${stepIndex}`);
      return; // Уведомление не найдено или уже отправлено
    }

    // Удаляем задачу из очереди
    try {
      await pushQueue.remove(notification.jobId.toString());
      console.warn(`Job ${notification.jobId} removed from queue`);
    } catch (error) {
      console.warn("Failed to remove job from queue:", error);
    }

    // АТОМАРНАЯ операция: обновляем статус и очищаем jobId
    await prisma.stepNotification.update({
      where: {
        id: notification.id,
        // Дополнительная проверка что уведомление все еще активно
        jobId: notification.jobId,
        sent: false,
        paused: false,
      },
      data: {
        jobId: null,
        paused: true,
        // Добавляем timestamp для отслеживания
        updatedAt: new Date(),
      },
    });

    console.warn(
      `Notification paused for user ${userId}, day ${day}, step ${stepIndex}, jobId cleared, paused: true`,
    );
  } catch (error) {
    console.error("Failed to pause step notification:", error);
    throw error;
  }
}

/**
 * Сбрасывает уведомление (удаляет и из очереди, и из БД)
 */
export async function resetStepNotification(
  userId: string,
  day: number,
  stepIndex: number,
): Promise<void> {
  try {
    // Находим уведомление по userId, day, stepIndex
    // Ищем самое свежее неотправленное уведомление
    const notification = await prisma.stepNotification.findFirst({
      where: {
        userId,
        day,
        stepIndex,
        sent: false, // Только неотправленные
      },
      orderBy: {
        createdAt: "desc", // Берем самое свежее
      },
    });

    if (!notification) {
      console.warn(`No active notification found for user ${userId}, day ${day}, step ${stepIndex}`);
      return; // Уведомление не найдено
    }

    // Удаляем задачу из очереди, если есть
    if (notification.jobId) {
      try {
        await pushQueue.remove(notification.jobId.toString());
        console.warn(`Job ${notification.jobId} removed from queue`);
      } catch (error) {
        console.warn("Failed to remove job from queue:", error);
      }
    }

    // Удаляем запись из БД
    await prisma.stepNotification.delete({
      where: { id: notification.id },
    });

    console.warn(`Notification reset for user ${userId}, day ${day}, step ${stepIndex}`);
  } catch (error) {
    console.error("Failed to reset step notification:", error);
    throw error;
  }
}

/**
 * Возобновляет уведомление (создает новую задачу в очереди)
 */
export async function resumeStepNotification(
  userId: string,
  day: number,
  stepIndex: number,
  durationSec: number,
): Promise<void> {
  try {
    // Находим уведомление по userId, day, stepIndex
    // Ищем самое свежее неотправленное уведомление
    const notification = await prisma.stepNotification.findFirst({
      where: {
        userId,
        day,
        stepIndex,
        sent: false, // Только неотправленные
      },
      orderBy: {
        createdAt: "desc", // Берем самое свежее
      },
    });

    if (!notification) {
      // Если уведомление не найдено (например, было сброшено) — создаем новое и выходим
      const nowTs = Math.floor(Date.now() / 1000);
      const endTs = nowTs + Math.max(Number(durationSec) || 0, 0);

      const created = await prisma.stepNotification.create({
        data: {
          userId,
          day,
          stepIndex,
          endTs,
          // без URL и title — опционально
          subscription: { subscriptions: [], count: 0 },
        },
      });

      const job = await pushQueue.add(
        "push",
        { notificationId: created.id },
        {
          delay: Math.max(Number(durationSec) || 0, 0) * 1000,
          attempts: 5,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      await prisma.stepNotification.update({
        where: { id: created.id },
        data: { jobId: job.id, paused: false },
      });

      console.warn(`Notification created on resume for user ${userId}, day ${day}, step ${stepIndex}, jobId: ${job.id}`);
      return;
    }

    // Вычисляем оставшееся время
    const nowTs = Math.floor(Date.now() / 1000);
    // Приоритетно используем durationSec, пришедший с клиента (оставшееся время)
    const remainingSec = Math.max(Number(durationSec) || 0, 0) || Math.max(notification.endTs - nowTs, 0);

    // Обновляем endTs, чтобы серверная сторона была согласована с клиентским временем
    const newEndTs = nowTs + remainingSec;
    await prisma.stepNotification.update({
      where: { id: notification.id },
      data: { endTs: newEndTs },
    });

    if (remainingSec <= 0) {
      // Время истекло, удаляем уведомление
      await prisma.stepNotification.delete({
        where: { id: notification.id },
      });
      console.warn(`Notification expired for user ${userId}, day ${day}, step ${stepIndex}`);
      return;
    }

    // Создаем новую задачу в очереди
    const job = await pushQueue.add(
      "push",
      { notificationId: notification.id },
      {
        delay: remainingSec * 1000,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    // Обновляем jobId в БД и снимаем флаг паузы
    await prisma.stepNotification.update({
      where: { id: notification.id },
      data: { jobId: job.id, paused: false },
    });

    console.warn(`Notification resumed for user ${userId}, day ${day}, step ${stepIndex}, remaining: ${remainingSec}s, jobId: ${job.id}`);
  } catch (error) {
    console.error("Failed to resume step notification:", error);
    throw error;
  }
}
