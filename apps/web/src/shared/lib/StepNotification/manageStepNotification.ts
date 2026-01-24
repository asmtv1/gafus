import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { pushQueue } from "@gafus/queues";

// Создаем логгер для manageStepNotification
const logger = createWebLogger("web-manage-step-notification");

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
      logger.warn(
        `No active notification found for user ${userId}, day ${day}, step ${stepIndex}`,
        { operation: "warn" },
      );
      return; // Уведомление не найдено или уже отправлено
    }

    // Удаляем задачу из очереди
    try {
      await pushQueue.remove(notification.jobId.toString());
      logger.warn(`Job ${notification.jobId} removed from queue`, { operation: "warn" });
    } catch (error) {
      logger.warn("Failed to remove job from queue:", { error, operation: "warn" });
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

    logger.warn(
      `Notification paused for user ${userId}, day ${day}, step ${stepIndex}, jobId cleared, paused: true`,
      { operation: "warn" },
    );
  } catch (error) {
    logger.error("Failed to pause step notification:", error as Error, { operation: "error" });
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
      logger.warn(
        `No active notification found for user ${userId}, day ${day}, step ${stepIndex}`,
        { operation: "warn" },
      );
      return; // Уведомление не найдено
    }

    // Удаляем задачу из очереди, если есть
    if (notification.jobId) {
      try {
        await pushQueue.remove(notification.jobId.toString());
        logger.warn(`Job ${notification.jobId} removed from queue`, { operation: "warn" });
      } catch (error) {
        logger.warn("Failed to remove job from queue:", { error, operation: "warn" });
      }
    }

    // Удаляем запись из БД
    await prisma.stepNotification.delete({
      where: { id: notification.id },
    });

    logger.warn(`Notification reset for user ${userId}, day ${day}, step ${stepIndex}`, {
      operation: "warn",
    });
  } catch (error) {
    logger.error("Failed to reset step notification:", error as Error, { operation: "error" });
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
  dayOnCourseId?: string,
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
      // Если уведомление не найдено (например, было сброшено) — создаем новое
      const nowTs = Math.floor(Date.now() / 1000);
      const endTs = nowTs + Math.max(Number(durationSec) || 0, 0);

      // Получаем stepTitle из БД, если передан dayOnCourseId
      let stepTitle: string | null = null;
      let url: string | null = null;

      if (dayOnCourseId) {
        try {
          const dayOnCourse = await prisma.dayOnCourse.findUnique({
            where: { id: dayOnCourseId },
            include: {
              day: {
                include: {
                  stepLinks: {
                    include: { step: true },
                    orderBy: { order: "asc" },
                  },
                },
              },
              course: {
                select: { type: true },
              },
            },
          });

          if (dayOnCourse?.day?.stepLinks?.[stepIndex]?.step) {
            stepTitle = dayOnCourse.day.stepLinks[stepIndex].step.title;
            url = `/trainings/${dayOnCourse.course.type}/${dayOnCourse.id}`;
          }
        } catch (error) {
          logger.warn("Failed to get stepTitle from DB when resuming notification", {
            dayOnCourseId,
            day,
            stepIndex,
            error: error instanceof Error ? error.message : String(error),
            operation: "resume_notification_get_step_title_error",
          });
        }
      }

      // Получаем подписки пользователя
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId },
      });

      const created = await prisma.stepNotification.create({
        data: {
          userId,
          day,
          stepIndex,
          endTs,
          stepTitle: stepTitle || null,
          url: url || null,
          subscription: {
            subscriptions: subscriptions.map((sub) => ({
              endpoint: sub.endpoint,
              keys: (sub.keys ?? {}) as Record<string, string>,
            })),
            count: subscriptions.length,
          },
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

      logger.warn(
        `Notification created on resume for user ${userId}, day ${day}, step ${stepIndex}, jobId: ${job.id}`,
        {
          operation: "warn",
          stepTitle,
          url,
          dayOnCourseId,
        },
      );
      return;
    }

    // Вычисляем оставшееся время
    const nowTs = Math.floor(Date.now() / 1000);
    // Приоритетно используем durationSec, пришедший с клиента (оставшееся время)
    const remainingSec =
      Math.max(Number(durationSec) || 0, 0) || Math.max(notification.endTs - nowTs, 0);

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
      logger.warn(`Notification expired for user ${userId}, day ${day}, step ${stepIndex}`, {
        operation: "warn",
      });
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

    logger.warn(
      `Notification resumed for user ${userId}, day ${day}, step ${stepIndex}, remaining: ${remainingSec}s, jobId: ${job.id}`,
      { operation: "warn" },
    );
  } catch (error) {
    logger.error("Failed to resume step notification:", error as Error, { operation: "error" });
    throw error;
  }
}
