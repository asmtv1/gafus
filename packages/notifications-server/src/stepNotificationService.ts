/**
 * Step Notification Service - бизнес-логика работы с уведомлениями шагов
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 * Все операции с авторизацией выполняются в Server Actions.
 */

import { prisma, isPrismaUniqueConstraintError } from "@gafus/prisma";
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
    logger.error(
      "Failed to remove job from queue",
      error instanceof Error ? error : new Error(String(error)),
      { jobId: notification.jobId, userId, day, stepIndex },
    );
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
        typeof remainingSec === "number"
          ? Math.max(Math.floor(remainingSec), 0)
          : notification.remainingSec,
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
      logger.error(
        "Failed to remove job from queue",
        error instanceof Error ? error : new Error(String(error)),
        { jobId: notification.jobId, userId, day, stepIndex },
      );
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
        logger.error(
          "Failed to get stepTitle from DB when resuming notification",
          error instanceof Error ? error : new Error(String(error)),
          { dayOnCourseId, day, stepIndex, userId },
        );
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

// ========== Stable occurrence notification operations (opt-in Web training) ==========

/**
 * Never use legacy day/stepIndex to locate a notification emitted by an opted-in
 * bound progress mutation. The ids below are from the successful SQL mutation.
 */
export interface BoundStepNotification {
  dayOnCourseId: string;
  stepOnDayId: string;
  stepId: string;
}

const boundNotificationWhere = (userId: string, bound: BoundStepNotification) => ({
  userId,
  dayOnCourseId: bound.dayOnCourseId,
  stepOnDayId: bound.stepOnDayId,
  type: "step",
  sent: false,
});

async function getBoundNotificationContext(userId: string, bound: BoundStepNotification) {
  const day = await prisma.dayOnCourse.findUnique({
    where: { id: bound.dayOnCourseId },
    include: {
      day: {
        include: { stepLinks: { orderBy: { order: "asc" }, include: { step: true } } },
      },
      course: { select: { type: true } },
    },
  });
  const stepIndex =
    day?.day?.stepLinks.findIndex(
      (link) => link.id === bound.stepOnDayId && link.stepId === bound.stepId,
    ) ?? -1;
  if (!day || stepIndex < 0) return null;
  const link = day.day.stepLinks[stepIndex];
  const userStep = await prisma.userStep.findFirst({
    where: {
      stepOnDayId: bound.stepOnDayId,
      userTraining: { userId, dayOnCourseId: bound.dayOnCourseId },
    },
    select: { status: true, paused: true, remainingSec: true },
  });
  if (!userStep) return null;
  return { day, link, stepIndex, userStep };
}

export async function createBoundStepNotificationForStart(
  userId: string,
  bound: BoundStepNotification,
  durationSec: number,
): Promise<{ queued: boolean; reason?: string }> {
  const context = await getBoundNotificationContext(userId, bound);
  if (!context || context.userStep.status !== "IN_PROGRESS" || context.userStep.paused) {
    return { queued: false, reason: "STALE_OR_INACTIVE_STEP" };
  }
  // New bound starts persist the unsent notification in the SAME Core/UserStep
  // transaction. Reconcile that intent instead of trying to INSERT a second
  // notification. Preserve the older direct-created path for existing callers.
  const durable = await prisma.stepNotification.findFirst({
    where: {
      userId, dayOnCourseId: bound.dayOnCourseId,
      stepOnDayId: bound.stepOnDayId, originalStepId: bound.stepId,
      type: "step", sent: false,
    },
    select: { id: true, jobId: true },
  });
  if (durable) {
    if (durable.jobId) return { queued: false, reason: "ALREADY_PENDING" };
    return reconcileBoundNotificationIntentById(durable.id);
  }
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return { queued: false, reason: "NO_SUBSCRIPTIONS" };
  const seconds = Math.max(0, Math.floor(durationSec));
  let created: { id: string };
  try {
    created = await prisma.stepNotification.create({
      data: {
        userId,
        day: context.day.order ?? 0,
        stepIndex: context.stepIndex,
        dayOnCourseId: bound.dayOnCourseId,
        stepOnDayId: bound.stepOnDayId,
        originalStepId: bound.stepId,
        endTs: Math.floor(Date.now() / 1000) + seconds,
        stepTitle: context.link.step.title || null,
        url: `/trainings/${context.day.course.type}/${bound.dayOnCourseId}`,
        type: "step",
        subscription: {
          subscriptions: subs.map((sub) => ({
            endpoint: sub.endpoint,
            keys: (sub.keys ?? {}) as Record<string, string>,
          })),
          count: subs.length,
        },
      },
      select: { id: true },
    });
  } catch (error) {
    // Partial unique SQL index allows at most one not-sent event per occurrence.
    if (isPrismaUniqueConstraintError(error)) return { queued: false, reason: "ALREADY_PENDING" };
    throw error;
  }
  try {
    const job = await pushQueue.add(
      "push",
      { notificationId: created.id },
      {
        delay: seconds * 1000,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    await prisma.stepNotification.update({
      where: { id: created.id },
      data: { jobId: job.id },
    });
    return { queued: true };
  } catch (error) {
    // Failed enqueue must not leave a misleading pending notification.
    await prisma.stepNotification.deleteMany({
      where: { id: created.id, jobId: null },
    });
    throw error;
  }
}

/** Durable bound normal training notification outbox using StepNotification itself.
 * `jobId = null` and `sent=false` is a committed SQL intent, not a sent push.
 * Called after HTTP commit, on explicit recovery and by a future bounded runner.
 * The Redis job identity is derived from the immutable SQL notification UUID;
 * no duplicate Redis job can arise from retry or two racing reconcilers.
 */
const BOUND_QUEUE_RETRY_MS = 30_000;
const boundQueueJobId = (notificationId: string) => `bound-${notificationId}`;

export async function reconcileBoundNotificationIntentById(
  notificationId: string,
): Promise<{ queued: boolean; reason?: string }> {
  const current = await prisma.stepNotification.findUnique({
    where: { id: notificationId },
    select: {
      id: true, userId: true, dayOnCourseId: true, stepOnDayId: true,
      originalStepId: true, type: true, sent: true, paused: true,
      jobId: true, endTs: true, remainingSec: true,
    },
  });
  if (!current || current.type !== "step" || !current.dayOnCourseId ||
      !current.stepOnDayId || !current.originalStepId || current.sent) {
    return { queued: false, reason: "NOT_PENDING" };
  }
  const bound: BoundStepNotification = {
    dayOnCourseId: current.dayOnCourseId,
    stepOnDayId: current.stepOnDayId,
    stepId: current.originalStepId,
  };
  const context = await getBoundNotificationContext(current.userId, bound);
  const deterministicJobId = boundQueueJobId(current.id);
  if (!context || context.userStep.status !== "IN_PROGRESS") {
    // Completion/reset won while an intent was outstanding: no future push.
    const removed = await prisma.stepNotification.deleteMany({
      where: { id: current.id, userId: current.userId, sent: false },
    });
    if (removed.count) {
      for (const id of new Set([current.jobId, deterministicJobId]))
        if (id) await pushQueue.remove(id).catch(() => undefined);
    }
    return { queued: false, reason: "STALE_OR_COMPLETED" };
  }
  if (context.userStep.paused) {
    // Crash after Core paused the UserStep but before Hono queue cleanup.
    const paused = await prisma.stepNotification.updateMany({
      where: { id: current.id, userId: current.userId, sent: false, paused: false },
      data: { jobId: null, paused: true, remainingSec: context.userStep.remainingSec },
    });
    if (paused.count) {
      for (const id of new Set([current.jobId, deterministicJobId]))
        if (id) await pushQueue.remove(id).catch(() => undefined);
    }
    return { queued: false, reason: "PAUSED" };
  }
  if (current.paused) {
    // Crash after Core resumed but before Hono re-queued. The SQL pause row
    // carries remainingSec and is the only source for this new delay.
    const seconds = Math.max(0, current.remainingSec ?? context.userStep.remainingSec ?? 0);
    if (seconds === 0) {
      await prisma.stepNotification.deleteMany({ where: { id: current.id, sent: false } });
      await pushQueue.remove(deterministicJobId).catch(() => undefined);
      return { queued: false, reason: "EXPIRED" };
    }
    const unpaused = await prisma.stepNotification.updateMany({
      where: { id: current.id, paused: true, jobId: null, sent: false },
      data: { paused: false, endTs: Math.floor(Date.now() / 1000) + seconds },
    });
    if (!unpaused.count) return { queued: false, reason: "STATE_CHANGED" };
    return reconcileBoundNotificationIntentById(current.id);
  }
  // An existing bound queued notification has already been reconciled.
  if (current.jobId) return { queued: false, reason: "ALREADY_QUEUED" };
  // PostgreSQL CAS + future lease timestamp: two contenders cannot claim
  // sequentially before the first Redis/SQL phase finishes. A crash leaves
  // jobId NULL, with the lease expiring after the bounded retry interval.
  // No schema change is required; this is an existing outbox row's updatedAt.
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "StepNotification"
      SET "updatedAt" = clock_timestamp() + INTERVAL '30 seconds'
    WHERE "id" = ${current.id}
      AND "updatedAt" <= clock_timestamp()
      AND "jobId" IS NULL AND "paused" = false AND "sent" = false
    RETURNING "id"
  `;
  if (claimed.length !== 1) return { queued: false, reason: "CLAIMED_BY_OTHER" };
  try {
    const seconds = Math.max(0, current.endTs - Math.floor(Date.now() / 1000));
    const job = await pushQueue.add(
      "push",
      { notificationId: current.id },
      {
        jobId: deterministicJobId,
        delay: seconds * 1000,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    const linked = await prisma.stepNotification.updateMany({
      where: {
        id: current.id, userId: current.userId,
        dayOnCourseId: current.dayOnCourseId, stepOnDayId: current.stepOnDayId,
        originalStepId: current.originalStepId,
        sent: false, paused: false, jobId: null,
      },
      data: { jobId: job.id },
    });
    if (linked.count !== 1) {
      // If a competing reconciler has already linked the same deterministic
      // job, NEVER remove it. Remove only when no valid SQL owner remains.
      const linkedByOther = await prisma.stepNotification.findUnique({
        where: { id: current.id }, select: { jobId: true, sent: true, paused: true },
      });
      if (linkedByOther?.jobId === deterministicJobId &&
          !linkedByOther.sent && !linkedByOther.paused)
        return { queued: false, reason: "LINKED_BY_OTHER" };
      await pushQueue.remove(deterministicJobId).catch(() => undefined);
      return { queued: false, reason: "OBSOLETE_AFTER_ENQUEUE" };
    }
    return { queued: true };
  } catch (error) {
    // Leave durable SQL intent for bounded retry after claim timeout. Never
    // delete it on Redis failure; no external worker is started here.
    logger.error("Bound notification durable queue reconcile failed", error as Error);
    throw error;
  }
}

/** One bounded read-only scan and exact-ID claims; no BullMQ drain or worker. */
export async function reconcilePendingBoundNotificationIntents(
  options: { userId?: string; limit?: number; retryDelayMs?: number } = {},
): Promise<{ checked: number; queued: number }> {
  const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw Error("INVALID_OUTBOX_LIMIT");
  const age = options.retryDelayMs ?? BOUND_QUEUE_RETRY_MS;
  if (!Number.isInteger(age) || age < 0 || age > 3_600_000) throw Error("INVALID_OUTBOX_BACKOFF");
  const pending = await prisma.stepNotification.findMany({
    where: {
      ...(options.userId ? { userId: options.userId } : {}),
      type: "step", sent: false,
      dayOnCourseId: { not: null }, stepOnDayId: { not: null },
      originalStepId: { not: null },
      updatedAt: { lte: new Date(Date.now() - age) },
    },
    orderBy: { updatedAt: "asc" },
    select: { id: true }, take: limit,
  });
  let queued = 0;
  for (const row of pending) {
    try {
      if ((await reconcileBoundNotificationIntentById(row.id)).queued) queued++;
    } catch (error) {
      logger.error("Bound notification outbox retry postponed", error as Error);
    }
  }
  return { checked: pending.length, queued };
}

export async function pauseBoundStepNotification(
  userId: string,
  bound: BoundStepNotification,
  remainingSec: number,
): Promise<void> {
  const where = boundNotificationWhere(userId, bound);
  const notification = await prisma.stepNotification.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });
  if (!notification || notification.paused) return;
  const changed = await prisma.stepNotification.updateMany({
    where: { id: notification.id, ...where, paused: false, jobId: notification.jobId },
    data: { jobId: null, paused: true, remainingSec: Math.max(0, Math.floor(remainingSec)) },
  });
  if (changed.count) {
    // Remove both persisted-job and deterministic orphan from a crash after
    // Redis add but before SQL jobId bind. Only this exact occurrence UUID.
    const ids = new Set([notification.jobId, boundQueueJobId(notification.id)]);
    for (const id of ids) if (id) {
      await pushQueue.remove(id.toString()).catch((error: unknown) => {
        logger.error("Bound pause queue removal failed", error as Error);
      });
    }
  }
}

export async function resumeBoundStepNotification(
  userId: string,
  bound: BoundStepNotification,
): Promise<void> {
  const context = await getBoundNotificationContext(userId, bound);
  if (!context || context.userStep.status !== "IN_PROGRESS" || context.userStep.paused) return;
  const where = boundNotificationWhere(userId, bound);
  const notification = await prisma.stepNotification.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });
  // Never create a synthetic zero-second notification if start never enqueued.
  if (!notification || !notification.paused) return;
  const seconds = Math.max(0, notification.remainingSec ?? 0);
  if (seconds === 0) {
    await prisma.stepNotification.deleteMany({
      where: { id: notification.id, ...where, paused: true },
    });
    return;
  }
  // Resume modifies the exact committed SQL intent before publishing Redis.
  // The same deterministic id/claim/backoff also handles a restart here.
  const updated = await prisma.stepNotification.updateMany({
    where: { id: notification.id, ...where, paused: true, jobId: null },
    data: { paused: false, endTs: Math.floor(Date.now() / 1000) + seconds },
  });
  if (updated.count) await reconcileBoundNotificationIntentById(notification.id);
}

export async function resetBoundStepNotification(
  userId: string,
  bound: BoundStepNotification,
): Promise<void> {
  const where = boundNotificationWhere(userId, bound);
  const notification = await prisma.stepNotification.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });
  if (!notification) return;
  const deleted = await prisma.stepNotification.deleteMany({
    where: { id: notification.id, ...where },
  });
  if (deleted.count) {
    // Exact-identity cleanup also fences Redis add-before-DB-bind crashes.
    const ids = new Set([notification.jobId, boundQueueJobId(notification.id)]);
    for (const id of ids) if (id) {
      await pushQueue.remove(id.toString()).catch((error: unknown) => {
        logger.error("Bound reset queue removal failed", error as Error);
      });
    }
  }
}
