"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { getCourseStatistics } from "@gafus/statistics";
import { searchUsersByUsername } from "@gafus/core/services/user";
import { unstable_cache } from "next/cache";

// Создаем логгер для cachedStatistics
const logger = createTrainerPanelLogger("trainer-panel-cached-statistics");

// Кэшированная версия getCourseStatistics
// Используем фабричный паттерн внутри async функции для соответствия "use server"
export async function getCourseStatisticsCached(userId: string, isElevated: boolean) {
  const cachedFn = unstable_cache(
    async () => {
      try {
        logger.warn(
          `[React Cache] Fetching statistics for user: ${userId}, elevated: ${isElevated}`,
          { operation: "warn" },
        );
        const result = await getCourseStatistics(userId, isElevated);
        logger.warn(`[React Cache] Statistics cached successfully for user: ${userId}`, {
          operation: "warn",
        });
        return { success: true, data: result };
      } catch (error) {
        logger.error("❌ Error in getCourseStatisticsCached:", error as Error, {
          operation: "error",
        });

        logger.error(
          error instanceof Error ? error.message : "Unknown error in getCourseStatisticsCached",
          error instanceof Error ? error : new Error(String(error)),
          {
            operation: "getCourseStatisticsCached",
            action: "getCourseStatisticsCached",
            userId,
            isElevated,
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            tags: ["statistics", "cache", "server-action"],
          },
        );

        return { success: false, error: "Что-то пошло не так при получении статистики" };
      }
    },
    ["course-statistics", userId, String(isElevated)], // userId в ключе
    {
      revalidate: 30, // 30 секунд
      tags: ["statistics", `user-${userId}`], // userId в тегах
    },
  );

  return cachedFn();
}

// Кэшированная версия searchUsersByUsername (делегирует в core)
export const searchUsersByUsernameCached = unstable_cache(
  async (search: string) => {
    try {
      logger.warn(`[React Cache] Searching users with query: ${search}`, { operation: "warn" });

      const users = await searchUsersByUsername(search, 10);
      logger.warn(`[React Cache] Found ${users.length} users for query: ${search}`, {
        operation: "warn",
      });
      return { success: true, data: users };
    } catch (error) {
      logger.error("❌ Error in searchUsersByUsernameCached:", error as Error, {
        operation: "error",
      });

      logger.error(
        error instanceof Error ? error.message : "Unknown error in searchUsersByUsernameCached",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: "searchUsersByUsernameCached",
          action: "searchUsersByUsernameCached",
          search,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          tags: ["users", "search", "cache", "server-action"],
        },
      );

      return { success: false, error: "Что-то пошло не так при поиске пользователей" };
    }
  },
  ["user-search"],
  {
    revalidate: 60, // 1 минута
    tags: ["user-search"],
  },
);
