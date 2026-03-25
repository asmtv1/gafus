"use server";

import { unstable_cache } from "next/cache";
import { getUserTrainingDates as getUserTrainingDatesCore } from "@gafus/core/services/achievements";
import { getErrorMessage } from "@gafus/core/errors";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-get-user-training-dates");

/**
 * Получает уникальные даты, когда пользователь завершал шаги или дни тренировок
 * Используется для правильного подсчета серий занятий
 *
 * Данные кэшируются на 5 минут для оптимизации производительности.
 * Кэш инвалидируется при обновлении прогресса пользователя.
 *
 * @returns Массив уникальных дат занятий, отсортированных по убыванию (самые свежие первыми)
 *
 * @example
 * ```typescript
 * const dates = await getUserTrainingDates();
 * // dates = [2024-01-03, 2024-01-02, 2024-01-01, ...]
 * ```
 */
export async function getUserTrainingDates(): Promise<Date[]> {
  try {
    const userId = await getCurrentUserId();

    // Кэшируем данные на 5 минут с тегом для инвалидации
    const cachedFunction = unstable_cache(
      async () => {
        logger.info("[Cache] Fetching user training dates", { userId, operation: "info" });
        return getUserTrainingDatesCore(userId);
      },
      ["user-training-dates", userId],
      {
        revalidate: 300, // 5 минут - баланс между актуальностью и производительностью
        tags: ["achievements", "streaks", `user-${userId}`],
      },
    );

    return await cachedFunction();
  } catch (error) {
    logger.error("Ошибка получения дат занятий", error as Error, {
      operation: "get_user_training_dates_error",
    });

    // Логируем ошибку через logger (отправляется в Loki)
    logger.error(
      getErrorMessage(error, "Сбой при получении дат тренировок"),
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "getUserTrainingDates",
        action: "getUserTrainingDates",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        tags: ["achievements", "streaks", "server-action"],
      },
    );

    return [];
  }
}
