"use server";

import { checkDayAccess as checkDayAccessCore } from "@gafus/core/services/training";
import { createWebLogger } from "@gafus/logger";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

import { dayOnCourseIdSchema } from "../validation/schemas";

const logger = createWebLogger("web-check-day-access");

/**
 * Проверяет доступ к дню курса
 * Для дня типа "summary" проверяет, что все остальные дни курса завершены
 */
export async function checkDayAccess(
  dayOnCourseId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const _validatedDayId = dayOnCourseIdSchema.parse(dayOnCourseId);
    void _validatedDayId;
    const userId = await getCurrentUserId();

    if (!userId) {
      return { allowed: false, reason: "Пользователь не авторизован" };
    }

    return checkDayAccessCore(userId, dayOnCourseId);
  } catch (error) {
    logger.error("Ошибка при проверке доступа к дню", error as Error, {
      operation: "check_day_access_error",
      dayOnCourseId,
    });
    return { allowed: false, reason: "Ошибка при проверке доступа" };
  }
}
