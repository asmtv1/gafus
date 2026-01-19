"use server";

/**
 * Achievements Server Actions - обёртки над datesService с кэшированием
 */

import { unstable_cache } from "next/cache";
import { createWebLogger } from "@gafus/logger";
import { getCurrentUserId } from "@/utils";
import * as datesService from "@shared/services/achievements/datesService";

const logger = createWebLogger('achievements-actions');

/**
 * Получает уникальные даты тренировок пользователя
 * Данные кэшируются на 5 минут для оптимизации производительности.
 * 
 * @returns Массив уникальных дат занятий
 */
export async function getUserTrainingDatesAction(): Promise<Date[]> {
  try {
    const userId = await getCurrentUserId();

    // Кэшируем данные на 5 минут с тегами для инвалидации
    const cachedFunction = unstable_cache(
      async () => {
        logger.info("[Cache] Fetching user training dates from service", { userId });
        return await datesService.getUserTrainingDates(userId);
      },
      ["user-training-dates", userId],
      {
        revalidate: 300, // 5 минут
        tags: ["achievements", "streaks", `user-${userId}`],
      }
    );

    return await cachedFunction();
  } catch (error) {
    logger.error("Error in getUserTrainingDatesAction", error as Error);
    return [];
  }
}
