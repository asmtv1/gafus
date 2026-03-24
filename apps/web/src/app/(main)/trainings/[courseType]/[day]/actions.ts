"use server";

import { createWebLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

import {
  pauseNotificationAction as pauseImpl,
  resetNotificationAction as resetImpl,
  resumeNotificationAction as resumeImpl,
} from "@shared/lib/StepNotification/notificationActions";

const logger = createWebLogger("training-day-notification-actions");

/** Реэкспорт с границей try для маршрута дня курса (обратная совместимость импортов). */
export async function pauseNotificationAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
) {
  try {
    return await pauseImpl(courseId, dayOnCourseId, stepIndex);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "pauseNotificationAction (training day route)",
      error instanceof Error ? error : new Error(String(error)),
      { courseId, dayOnCourseId, stepIndex },
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось приостановить уведомление",
    };
  }
}

export async function resetNotificationAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
) {
  try {
    return await resetImpl(courseId, dayOnCourseId, stepIndex);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "resetNotificationAction (training day route)",
      error instanceof Error ? error : new Error(String(error)),
      { courseId, dayOnCourseId, stepIndex },
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось сбросить уведомление",
    };
  }
}

export async function resumeNotificationAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
  durationSec: number,
) {
  try {
    return await resumeImpl(courseId, dayOnCourseId, stepIndex, durationSec);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "resumeNotificationAction (training day route)",
      error instanceof Error ? error : new Error(String(error)),
      { courseId, dayOnCourseId, stepIndex, durationSec },
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось возобновить уведомление",
    };
  }
}
