"use server";

/**
 * Server Actions для работы с уведомлениями шагов
 *
 * Эти actions используют stepNotificationService для бизнес-логики
 * и добавляют авторизацию через getCurrentUserId.
 */

import { getErrorMessage } from "@gafus/core/errors";
import { createWebLogger } from "@gafus/logger";
import {
  pauseStepNotification,
  resetStepNotification,
  resumeStepNotification,
  toggleStepNotificationPause,
  deleteStepNotification,
  createStepNotificationForStepStart,
  getDayFromDayOnCourseId,
} from "@gafus/core/services/notifications";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import {
  courseIdSchema,
  stepIndexSchema,
  positiveDurationSchema,
  dayOnCourseIdSchema,
  dayNumberSchema,
} from "@shared/lib/validation/schemas";

const logger = createWebLogger("notification-server-actions");

// ========== Schemas ==========

const notificationKeySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: dayOnCourseIdSchema,
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
  try {
    const parsed = notificationKeySchema.parse({ courseId, dayOnCourseId, stepIndex });
    const userId = await getCurrentUserId();
    const day = await getDayFromDayOnCourseId(parsed.dayOnCourseId);

    await pauseStepNotification(userId, day, parsed.stepIndex);
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "Failed to pause notification",
      error instanceof Error ? error : new Error(String(error)),
      { courseId, dayOnCourseId, stepIndex },
    );
    return {
      success: false,
      error: getErrorMessage(error, "Failed to pause notification"),
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
  try {
    const parsed = notificationKeySchema.parse({ courseId, dayOnCourseId, stepIndex });
    const userId = await getCurrentUserId();
    const day = await getDayFromDayOnCourseId(parsed.dayOnCourseId);

    await resetStepNotification(userId, day, parsed.stepIndex);
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "Failed to reset notification",
      error instanceof Error ? error : new Error(String(error)),
      { courseId, dayOnCourseId, stepIndex },
    );
    return {
      success: false,
      error: getErrorMessage(error, "Failed to reset notification"),
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
  try {
    const parsed = resumeNotificationSchema.parse({
      courseId,
      dayOnCourseId,
      stepIndex,
      durationSec,
    });
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
    unstable_rethrow(error);
    logger.error(
      "Failed to resume notification",
      error instanceof Error ? error : new Error(String(error)),
      { courseId, dayOnCourseId, stepIndex, durationSec },
    );
    return {
      success: false,
      error: getErrorMessage(error, "Failed to resume notification"),
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
  try {
    const parsed = togglePauseByDayOnCourseSchema.parse({
      courseId,
      dayOnCourseId,
      stepIndex,
      pause,
    });
    const userId = await getCurrentUserId();
    const day = await getDayFromDayOnCourseId(parsed.dayOnCourseId);
    return toggleStepNotificationPause(userId, day, parsed.stepIndex, parsed.pause);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "Failed to toggle notification pause",
      error instanceof Error ? error : new Error(String(error)),
      { courseId, dayOnCourseId, stepIndex, pause },
    );
    return {
      success: false,
      error: getErrorMessage(error, "Failed to toggle notification pause"),
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
  try {
    const parsed = togglePauseSchema.parse({ day, stepIndex, pause });
    const userId = await getCurrentUserId();

    return toggleStepNotificationPause(userId, parsed.day, parsed.stepIndex, parsed.pause);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "Failed to toggle notification pause (by day)",
      error instanceof Error ? error : new Error(String(error)),
      { day, stepIndex, pause },
    );
    return {
      success: false,
      error: getErrorMessage(error, "Failed to toggle notification pause"),
    };
  }
}

/**
 * Удаляет уведомление шага
 */
export async function deleteStepNotificationAction(
  day: number,
  stepIndex: number,
  deleted: boolean,
) {
  try {
    const parsed = deleteSchema.parse({ day, stepIndex, deleted });
    const userId = await getCurrentUserId();

    return deleteStepNotification(userId, parsed.day, parsed.stepIndex, parsed.deleted);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "Failed to delete step notification",
      error instanceof Error ? error : new Error(String(error)),
      { day, stepIndex, deleted },
    );
    return {
      success: false,
      error: getErrorMessage(error, "Failed to delete notification"),
    };
  }
}

/**
 * Создает уведомление для шага тренировки
 */
export async function createStepNotificationAction(params: {
  dayOnCourseId: string;
  stepIndex: number;
  durationSec: number;
}) {
  try {
    const parsed = resumeNotificationSchema.pick({
      dayOnCourseId: true,
      stepIndex: true,
      durationSec: true,
    }).parse({
      dayOnCourseId: params.dayOnCourseId,
      stepIndex: params.stepIndex,
      durationSec: params.durationSec,
    });

    const userId = await getCurrentUserId();
    await createStepNotificationForStepStart(
      userId,
      parsed.dayOnCourseId,
      parsed.stepIndex,
      parsed.durationSec,
    );

    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "Failed to create step notification",
      error instanceof Error ? error : new Error(String(error)),
      { params },
    );
    return {
      success: false,
      error: getErrorMessage(error, "Не удалось создать напоминание для шага"),
    };
  }
}
