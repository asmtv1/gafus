"use server";


import { createTrainerPanelLogger } from "@gafus/logger";
import { getCourseStatistics } from "@gafus/statistics";
import { unstable_cache } from "next/cache";

import { reportErrorToDashboard } from "./reportError";

// Создаем логгер для cachedStatistics
const logger = createTrainerPanelLogger('trainer-panel-cached-statistics');

// Кэшированная версия getCourseStatistics
export const getCourseStatisticsCached = unstable_cache(
  async (userId: string, isElevated: boolean) => {
    try {
      logger.warn(
        `[React Cache] Fetching statistics for user: ${userId}, elevated: ${isElevated}`,
        { operation: 'warn' }
      );
      const result = await getCourseStatistics(userId, isElevated);
      logger.warn(`[React Cache] Statistics cached successfully for user: ${userId}`, { operation: 'warn' });
      return { success: true, data: result };
    } catch (error) {
      logger.error("❌ Error in getCourseStatisticsCached:", error as Error, { operation: 'error' });

      await reportErrorToDashboard({
        message:
          error instanceof Error ? error.message : "Unknown error in getCourseStatisticsCached",
        stack: error instanceof Error ? error.stack : undefined,
        appName: "trainer-panel",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "getCourseStatisticsCached",
          userId,
          isElevated,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        tags: ["statistics", "cache", "server-action"],
      });

      return { success: false, error: "Что-то пошло не так при получении статистики" };
    }
  },
  ["course-statistics"],
  {
    revalidate: 30, // 30 секунд
    tags: ["statistics"],
  },
);

// Кэшированная версия searchUsersByUsername
export const searchUsersByUsernameCached = unstable_cache(
  async (search: string) => {
    try {
      logger.warn(`[React Cache] Searching users with query: ${search}`, { operation: 'warn' });

      if (!search.trim()) return { success: true, data: [] };

      const { prisma } = await import("@gafus/prisma");
      const users = await prisma.user.findMany({
        where: {
          username: {
            contains: search,
            mode: "insensitive",
          },
        },
        take: 10,
        select: { id: true, username: true },
      });

      logger.warn(`[React Cache] Found ${users.length} users for query: ${search}`, { operation: 'warn' });
      return { success: true, data: users };
    } catch (error) {
      logger.error("❌ Error in searchUsersByUsernameCached:", error as Error, { operation: 'error' });

      await reportErrorToDashboard({
        message:
          error instanceof Error ? error.message : "Unknown error in searchUsersByUsernameCached",
        stack: error instanceof Error ? error.stack : undefined,
        appName: "trainer-panel",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "searchUsersByUsernameCached",
          search,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        tags: ["users", "search", "cache", "server-action"],
      });

      return { success: false, error: "Что-то пошло не так при поиске пользователей" };
    }
  },
  ["user-search"],
  {
    revalidate: 60, // 1 минута
    tags: ["user-search"],
  },
);
