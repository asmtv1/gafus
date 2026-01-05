"use server";

import { getCurrentUserId } from "@/utils";
import {
  pauseStepNotification,
  resetStepNotification,
  resumeStepNotification,
} from "@shared/lib/StepNotification/manageStepNotification";
import { courseIdSchema, stepIndexSchema, positiveDurationSchema, dayIdSchema } from "@shared/lib/validation/schemas";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";
import { prisma } from "@gafus/prisma";

// Создаем логгер для training actions
const logger = createWebLogger('web-training-actions');

const notificationKeySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: dayIdSchema,
  stepIndex: stepIndexSchema,
});

const resumeNotificationSchema = notificationKeySchema.extend({
  durationSec: positiveDurationSchema,
});

// Получаем day (order) из dayOnCourseId для обратной совместимости с уведомлениями
async function getDayFromDayOnCourseId(dayOnCourseId: string): Promise<number> {
  const dayOnCourse = await prisma.dayOnCourse.findUnique({
    where: { id: dayOnCourseId },
    select: { order: true },
  });
  if (!dayOnCourse) {
    throw new Error(`DayOnCourse not found: ${dayOnCourseId}`);
  }
  return dayOnCourse.order;
}

export async function pauseNotificationAction(courseId: string, dayOnCourseId: string, stepIndex: number) {
  const parsed = notificationKeySchema.parse({ courseId, dayOnCourseId, stepIndex });
  try {
    const userId = await getCurrentUserId();
    const day = await getDayFromDayOnCourseId(parsed.dayOnCourseId);

    await pauseStepNotification(userId, day, parsed.stepIndex);
    return { success: true };
  } catch (error) {
    logger.error("Failed to pause notification", error as Error, {
      operation: 'pause_notification_error',
      courseId: courseId,
      dayOnCourseId: dayOnCourseId,
      stepIndex: stepIndex
    });
    throw new Error("Failed to pause notification");
  }
}

export async function resetNotificationAction(courseId: string, dayOnCourseId: string, stepIndex: number) {
  const parsed = notificationKeySchema.parse({ courseId, dayOnCourseId, stepIndex });
  try {
    const userId = await getCurrentUserId();
    const day = await getDayFromDayOnCourseId(parsed.dayOnCourseId);

    await resetStepNotification(userId, day, parsed.stepIndex);
    return { success: true };
  } catch (error) {
    logger.error("Failed to reset notification", error as Error, {
      operation: 'reset_notification_error',
      courseId: courseId,
      dayOnCourseId: dayOnCourseId,
      stepIndex: stepIndex
    });
    throw new Error("Failed to reset notification");
  }
}

export async function resumeNotificationAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
  durationSec: number,
) {
  const parsed = resumeNotificationSchema.parse({ courseId, dayOnCourseId, stepIndex, durationSec });
  try {
    const userId = await getCurrentUserId();
    const day = await getDayFromDayOnCourseId(parsed.dayOnCourseId);

    await resumeStepNotification(userId, day, parsed.stepIndex, parsed.durationSec, parsed.dayOnCourseId);
    return { success: true };
  } catch (error) {
    logger.error("Failed to resume notification", error as Error, {
      operation: 'resume_notification_error',
      courseId: courseId,
      dayOnCourseId: dayOnCourseId,
      stepIndex: stepIndex,
      durationSec: durationSec
    });
    throw new Error("Failed to resume notification");
  }
}
