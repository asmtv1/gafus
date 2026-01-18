/**
 * Простые функции для управления уведомлениями на клиенте
 * Основная логика выполняется на сервере
 */

import {
  pauseNotificationAction,
  resetNotificationAction,
  resumeNotificationAction,
} from "./notificationActions";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('web');

export interface NotificationAction {
  courseId: string;
  dayOnCourseId: string;
  stepIndex: number;
  durationSec?: number;
}

/**
 * Приостанавливает уведомление
 */
export async function pauseNotificationClient(
  action: NotificationAction,
): Promise<{ success: boolean }> {
  try {
    const result = await pauseNotificationAction(action.courseId, action.dayOnCourseId, action.stepIndex);
    return result;
  } catch (error) {
    logger.error("Failed to pause notification:", error as Error, { operation: 'error' });
    return { success: false };
  }
}

/**
 * Сбрасывает уведомление
 */
export async function resetNotificationClient(
  action: NotificationAction,
): Promise<{ success: boolean }> {
  try {
    const result = await resetNotificationAction(action.courseId, action.dayOnCourseId, action.stepIndex);
    return result;
  } catch (error) {
    logger.error("Failed to reset notification:", error as Error, { operation: 'error' });
    return { success: false };
  }
}

/**
 * Возобновляет уведомление
 */
export async function resumeNotificationClient(
  action: NotificationAction,
): Promise<{ success: boolean }> {
  try {
    if (!action.durationSec) {
      throw new Error("durationSec is required for resume");
    }

    const result = await resumeNotificationAction(
      action.courseId,
      action.dayOnCourseId,
      action.stepIndex,
      action.durationSec,
    );
    return result;
  } catch (error) {
    logger.error("Failed to resume notification:", error as Error, { operation: 'error' });
    return { success: false };
  }
}
