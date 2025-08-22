/**
 * Простые функции для управления уведомлениями на клиенте
 * Основная логика выполняется на сервере
 */

import {
  pauseNotificationAction,
  resetNotificationAction,
  resumeNotificationAction,
} from "../../../app/(main)/trainings/[courseType]/[day]/actions";

export interface NotificationAction {
  courseId: string;
  day: number;
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
    const result = await pauseNotificationAction(action.courseId, action.day, action.stepIndex);
    return result;
  } catch (error) {
    console.error("Failed to pause notification:", error);
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
    const result = await resetNotificationAction(action.courseId, action.day, action.stepIndex);
    return result;
  } catch (error) {
    console.error("Failed to reset notification:", error);
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
      action.day,
      action.stepIndex,
      action.durationSec,
    );
    return result;
  } catch (error) {
    console.error("Failed to resume notification:", error);
    return { success: false };
  }
}
