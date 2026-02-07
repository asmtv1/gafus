"use server";

/**
 * Server Actions для работы с уведомлениями шагов
 *
 * Эти actions используют stepNotificationService для бизнес-логики
 * и добавляют авторизацию через getCurrentUserId.
 */

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import {
  pauseStepNotification,
  resetStepNotification,
  resumeStepNotification,
  toggleStepNotificationPause,
  deleteStepNotification,
  createStepNotification,
  getDayFromDayOnCourseId,
} from "@gafus/core/services/notifications";
import {
  courseIdSchema,
  stepIndexSchema,
  positiveDurationSchema,
  dayIdSchema,
  dayNumberSchema,
} from "@shared/lib/validation/schemas";

const logger = createWebLogger("notification-server-actions");

// ========== Schemas ==========

const notificationKeySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: dayIdSchema,
  stepIndex: stepIndexSchema,
});

const resumeNotificationSchema = notificationKeySchema.extend({
  durationSec: positiveDurationSchema,
});

const togglePauseSchema = z.object({
  day: dayNumberSchema,
  stepIndex: stepIndexSchema,
  pause: z.boolean(),
});

const deleteSchema = z.object({
  day: dayNumberSchema,
  stepIndex: stepIndexSchema,
  deleted: z.boolean(),
});

const togglePauseByDayOnCourseSchema = notificationKeySchema.extend({
  pause: z.boolean(),
});

// ========== Server Actions ==========

/**
 * Приостанавливает уведомление шага
 */
export async function pauseNotificationAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
) {
  const parsed = notificationKeySchema.parse({ courseId, dayOnCourseId, stepIndex });
  try {
    const userId = await getCurrentUserId();
    const day = await getDayFromDayOnCourseId(parsed.dayOnCourseId);

    await pauseStepNotification(userId, day, parsed.stepIndex);
    return { success: true };
  } catch (error) {
    logger.error("Failed to pause notification", error as Error, {
      courseId,
      dayOnCourseId,
      stepIndex,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to pause notification",
    };
  }
}

/**
 * Сбрасывает уведомление шага (удаляет полностью)
 */
export async function resetNotificationAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
) {
  const parsed = notificationKeySchema.parse({ courseId, dayOnCourseId, stepIndex });
  try {
    const userId = await getCurrentUserId();
    const day = await getDayFromDayOnCourseId(parsed.dayOnCourseId);

    await resetStepNotification(userId, day, parsed.stepIndex);
    return { success: true };
  } catch (error) {
    logger.error("Failed to reset notification", error as Error, {
      courseId,
      dayOnCourseId,
      stepIndex,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reset notification",
    };
  }
}

/**
 * Возобновляет уведомление шага
 */
export async function resumeNotificationAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
  durationSec: number,
) {
  const parsed = resumeNotificationSchema.parse({
    courseId,
    dayOnCourseId,
    stepIndex,
    durationSec,
  });
  try {
    const userId = await getCurrentUserId();
    const day = await getDayFromDayOnCourseId(parsed.dayOnCourseId);

    await resumeStepNotification(
      userId,
      day,
      parsed.stepIndex,
      parsed.durationSec,
      parsed.dayOnCourseId,
    );
    return { success: true };
  } catch (error) {
    logger.error("Failed to resume notification", error as Error, {
      courseId,
      dayOnCourseId,
      stepIndex,
      durationSec,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to resume notification",
    };
  }
}

/**
 * Переключает паузу уведомления по dayOnCourseId (для trainingStore)
 */
export async function toggleStepNotificationPauseByDayOnCourseAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
  pause: boolean,
) {
  const parsed = togglePauseByDayOnCourseSchema.parse({
    courseId,
    dayOnCourseId,
    stepIndex,
    pause,
  });
  try {
    const userId = await getCurrentUserId();
    const day = await getDayFromDayOnCourseId(parsed.dayOnCourseId);
    return toggleStepNotificationPause(userId, day, parsed.stepIndex, parsed.pause);
  } catch (error) {
    logger.error("Failed to toggle notification pause", error as Error, {
      courseId,
      dayOnCourseId,
      stepIndex,
      pause,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to toggle notification pause",
    };
  }
}

/**
 * Переключает паузу уведомления (с сохранением оставшегося времени)
 */
export async function toggleStepNotificationPauseAction(
  day: number,
  stepIndex: number,
  pause: boolean,
) {
  const parsed = togglePauseSchema.parse({ day, stepIndex, pause });
  const userId = await getCurrentUserId();

  return toggleStepNotificationPause(userId, parsed.day, parsed.stepIndex, parsed.pause);
}

/**
 * Удаляет уведомление шага
 */
export async function deleteStepNotificationAction(
  day: number,
  stepIndex: number,
  deleted: boolean,
) {
  const parsed = deleteSchema.parse({ day, stepIndex, deleted });
  const userId = await getCurrentUserId();

  return deleteStepNotification(userId, parsed.day, parsed.stepIndex, parsed.deleted);
}

/**
 * Создает уведомление для шага тренировки
 */
export async function createStepNotificationAction(params: {
  day: number;
  stepIndex: number;
  durationSec: number;
  maybeUrl?: string;
  stepTitle?: string;
}) {
  try {
    const userId = await getCurrentUserId();

    await createStepNotification({
      userId,
      day: params.day,
      stepIndex: params.stepIndex,
      durationSec: params.durationSec,
      maybeUrl: params.maybeUrl,
      stepTitle: params.stepTitle,
    });

    return { success: true };
  } catch (error) {
    logger.error("Failed to create step notification", error as Error, {
      params,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
