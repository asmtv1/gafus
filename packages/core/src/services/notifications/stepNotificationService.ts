/**
 * Step Notification Service - бизнес-логика работы с уведомлениями шагов
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 * Все операции с авторизацией выполняются в Server Actions.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { pushQueue } from "@gafus/queues";
import type { PushSubscription as DbPushSubscription } from "@gafus/prisma";

const logger = createWebLogger("step-notification-service");

// ========== Types ==========

export interface CreateStepNotificationParams {
  userId: string;
  day: number;
  stepIndex: number;
  durationSec: number;
  maybeUrl?: string;
  stepTitle?: string;
}

export interface CreateImmediatePushNotificationParams {
  userId: string;
  title: string;
  body: string;
  url?: string;
}

export interface CreateImmediatePushNotificationResult {
  queued: boolean;
  reason?: "NO_SUBSCRIPTIONS" | "QUEUE_ERROR";
  notificationId?: string;
}

// ========== Create Step Notification ==========

/**
 * Создает уведомление для шага тренировки с отложенной отправкой
 */
export async function createStepNotification(params: CreateStepNotificationParams): Promise<void> {
  const { userId, day, stepIndex, durationSec, maybeUrl, stepTitle } = params;
  const nowTs = Math.floor(Date.now() / 1000);
  const endTs = nowTs + durationSec;

  // Получаем ВСЕ подписки пользователя
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    logger.error("No push subscriptions found for user", new Error("No subscriptions"), {
      userId,
      day,
      stepIndex,
      durationSec,
      stepTitle,
      url: maybeUrl,
      errorType: "missing_subscription",
    });
    throw new Error("No push subscriptions found for user");
  }

  // Валидация stepTitle
  const hasStepTitle = stepTitle != null && stepTitle.trim().length > 0;

  if (!hasStepTitle) {
    logger.warn("StepTitle отсутствует или пустой при создании уведомления", {
      userId,
      day,
      stepIndex,
      durationSec,
      stepTitleValue: stepTitle,
      url: maybeUrl,
      subscriptionCount: subscriptions.length,
    });
  }

  logger.info("Creating step notification", {
    userId,
    day,
    stepIndex,
    durationSec,
    stepTitle: hasStepTitle ? stepTitle : `Шаг ${stepIndex + 1} (fallback)`,
    url: maybeUrl,
    subscriptionCount: subscriptions.length,
  });

  // Создаем уведомление с ВСЕМИ подписками пользователя
  const notif = await prisma.stepNotification.create({
    data: {
      userId,
      day,
      stepIndex,
      endTs,
      url: maybeUrl,
      stepTitle: hasStepTitle ? stepTitle.trim() : null,
      type: "step",
      subscription: {
        subscriptions: subscriptions.map((sub: DbPushSubscription) => ({
          endpoint: sub.endpoint,
          keys: (sub.keys ?? {}) as Record<string, string>,
        })),
        count: subscriptions.length,
      },
    },
  });

  try {
    const job = await pushQueue.add(
      "push",
      { notificationId: notif.id },
      {
        delay: durationSec * 1000,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    await prisma.stepNotification.update({
      where: { id: notif.id },
      data: { jobId: job.id },
    });

    logger.info("Job added to push queue", {
      notificationId: notif.id,
      jobId: job.id,
      userId,
      day,
      stepIndex,
      subscriptionCount: subscriptions.length,
      delay: durationSec * 1000,
    });
  } catch (err) {
    logger.error("Error adding job to push queue", err as Error, {
      notificationId: notif.id,
      userId,
      day,
      stepIndex,
    });
    throw err;
  }
}

export async function createImmediatePushNotification(
  params: CreateImmediatePushNotificationParams,
): Promise<CreateImmediatePushNotificationResult> {
  const { userId, title, body, url } = params;
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, keys: true },
  });

  if (subscriptions.length === 0) {
    logger.warn("Skipping immediate push creation: no subscriptions", { userId, title });
    return { queued: false, reason: "NO_SUBSCRIPTIONS" };
  }

  const notification = await prisma.stepNotification.create({
    data: {
      userId,
      day: 0,
      stepIndex: 0,
      endTs: Math.floor(Date.now() / 1000),
      sent: false,
      paused: false,
      stepTitle: `${title}|${body}`,
      type: "immediate",
      url: url || "/",
      subscription: {
        subscriptions: subscriptions.map((sub) => ({
          endpoint: sub.endpoint,
          keys: sub.keys as Record<string, string>,
        })),
        count: subscriptions.length,
      },
    },
  });

  try {
    const job = await pushQueue.add(
      "push",
      { notificationId: notification.id },
      {
        delay: 0,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    await prisma.stepNotification.update({
      where: { id: notification.id },
      data: { jobId: job.id },
    });

    return {
      queued: true,
      notificationId: notification.id,
    };
  } catch (error) {
    logger.error("Error adding immediate push job to queue", error as Error, {
      notificationId: notification.id,
      userId,
    });
    return {
      queued: false,
      reason: "QUEUE_ERROR",
      notificationId: notification.id,
    };
  }
}

export async function createStepNotificationForStepStart(
  userId: string,
  dayOnCourseId: string,
  stepIndex: number,
  durationSec: number,
): Promise<{ queued: boolean; reason?: string }> {
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

  const stepLink = dayOnCourse?.day?.stepLinks?.[stepIndex];
  if (!dayOnCourse || !stepLink?.step) {
    return { queued: false, reason: "STEP_NOT_FOUND" };
  }

  await createStepNotification({
    userId,
    day: dayOnCourse.order ?? 0,
    stepIndex,
    durationSec,
    maybeUrl: `/trainings/${dayOnCourse.course.type}/${dayOnCourseId}`,
    stepTitle: stepLink.step.title?.trim() || `Шаг ${stepIndex + 1}`,
  });

  return { queued: true };
}

// ========== Pause Step Notification ==========

/**
 * Приостанавливает уведомление (удаляет из очереди, но оставляет в БД)
 */
export async function pauseStepNotification(
  userId: string,
  day: number,
  stepIndex: number,
  remainingSec?: number,
): Promise<void> {
  // Ищем самое свежее неотправленное уведомление
  const notification = await prisma.stepNotification.findFirst({
    where: {
      userId,
      day,
      stepIndex,
      sent: false,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!notification || !notification.jobId) {
    logger.warn(`No active notification found for user ${userId}, day ${day}, step ${stepIndex}`);
    return;
  }

  // Удаляем задачу из очереди
  try {
    await pushQueue.remove(notification.jobId.toString());
    logger.info(`Job ${notification.jobId} removed from queue`);
  } catch (error) {
    logger.warn("Failed to remove job from queue", { error });
  }

  // Атомарно обновляем статус и очищаем jobId
  await prisma.stepNotification.update({
    where: {
      id: notification.id,
      jobId: notification.jobId,
      sent: false,
      paused: false,
    },
    data: {
      jobId: null,
      paused: true,
      remainingSec:
        typeof remainingSec === "number" ? Math.max(Math.floor(remainingSec), 0) : notification.remainingSec,
      updatedAt: new Date(),
    },
  });

  logger.info(`Notification paused for user ${userId}, day ${day}, step ${stepIndex}`);
}

// ========== Reset Step Notification ==========

/**
 * Сбрасывает уведомление (удаляет и из очереди, и из БД)
 */
export async function resetStepNotification(
  userId: string,
  day: number,
  stepIndex: number,
): Promise<void> {
  const notification = await prisma.stepNotification.findFirst({
    where: {
      userId,
      day,
      stepIndex,
      sent: false,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!notification) {
    logger.warn(`No active notification found for user ${userId}, day ${day}, step ${stepIndex}`);
    return;
  }

  // Удаляем задачу из очереди, если есть
  if (notification.jobId) {
    try {
      await pushQueue.remove(notification.jobId.toString());
      logger.info(`Job ${notification.jobId} removed from queue`);
    } catch (error) {
      logger.warn("Failed to remove job from queue", { error });
    }
  }

  // Удаляем запись из БД
  await prisma.stepNotification.delete({
    where: { id: notification.id },
  });

  logger.info(`Notification reset for user ${userId}, day ${day}, step ${stepIndex}`);
}

// ========== Resume Step Notification ==========

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
  const notification = await prisma.stepNotification.findFirst({
    where: {
      userId,
      day,
      stepIndex,
      sent: false,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const nowTs = Math.floor(Date.now() / 1000);

  if (!notification) {
    // Если уведомление не найдено — создаем новое
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

    logger.info(
      `Notification created on resume for user ${userId}, day ${day}, step ${stepIndex}`,
      {
        jobId: job.id,
        stepTitle,
        url,
        dayOnCourseId,
      },
    );
    return;
  }

  // Вычисляем оставшееся время
  const remainingSec =
    Math.max(Number(durationSec) || 0, 0) ||
    Math.max(notification.remainingSec ?? 0, 0) ||
    Math.max(notification.endTs - nowTs, 0);
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
    logger.warn(`Notification expired for user ${userId}, day ${day}, step ${stepIndex}`);
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

  logger.info(`Notification resumed for user ${userId}, day ${day}, step ${stepIndex}`, {
    remainingSec,
    jobId: job.id,
  });
}

// ========== Toggle Step Notification Pause ==========

/**
 * Приостанавливает или возобновляет уведомление с сохранением оставшегося времени
 */
export async function toggleStepNotificationPause(
  userId: string,
  day: number,
  stepIndex: number,
  pause: boolean,
): Promise<{ success: boolean; error?: string }> {
  const now = Math.floor(Date.now() / 1000);

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

    if (notif.jobId) {
      const job = await pushQueue.getJob(notif.jobId);
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
      "push",
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

// ========== Delete Step Notification ==========

/**
 * Удаляет уведомление (используется при завершении шага)
 */
export async function deleteStepNotification(
  userId: string,
  day: number,
  stepIndex: number,
  deleted: boolean,
): Promise<{ success: boolean; error?: string }> {
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
    if (notif.jobId) {
      const job = await pushQueue.getJob(notif.jobId);
      if (job) await job.remove();
    }

    // Удаляем запись из БД
    await prisma.stepNotification.delete({
      where: { id: notif.id },
    });

    return { success: true };
  } else {
    return {
      success: false,
      error: "Cannot resume. Notification was deleted on pause.",
    };
  }
}

// ========== Helper: Get Day Order from DayOnCourseId ==========

/**
 * Получает day (order) из dayOnCourseId для обратной совместимости
 */
export async function getDayFromDayOnCourseId(dayOnCourseId: string): Promise<number> {
  const dayOnCourse = await prisma.dayOnCourse.findUnique({
    where: { id: dayOnCourseId },
    select: { order: true },
  });
  if (!dayOnCourse) {
    throw new Error(`DayOnCourse not found: ${dayOnCourseId}`);
  }
  return dayOnCourse.order;
}
