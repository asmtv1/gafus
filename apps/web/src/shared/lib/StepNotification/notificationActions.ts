"use server";

import { createWebLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

import {
  pauseNotificationAction as pauseFromServer,
  resetNotificationAction as resetFromServer,
  resumeNotificationAction as resumeFromServer,
} from "@shared/server-actions/notifications";

const logger = createWebLogger("step-notification-actions");

export async function pauseNotificationAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
) {
  try {
    return await pauseFromServer(courseId, dayOnCourseId, stepIndex);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "pauseNotificationAction",
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
    return await resetFromServer(courseId, dayOnCourseId, stepIndex);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "resetNotificationAction",
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
    return await resumeFromServer(courseId, dayOnCourseId, stepIndex, durationSec);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "resumeNotificationAction",
      error instanceof Error ? error : new Error(String(error)),
      { courseId, dayOnCourseId, stepIndex, durationSec },
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось возобновить уведомление",
    };
  }
}
