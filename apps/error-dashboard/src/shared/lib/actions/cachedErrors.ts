"use server";

import { unstable_cache } from "next/cache";

import { getErrors } from "./errors";
import { getErrorStats } from "./errorStats";
import { reportErrorToDashboard } from "./reportError";

// Кэшированная версия получения ошибок
export const getErrorsCached = unstable_cache(
  async (filters?: {
    appName?: string;
    environment?: string;
    resolved?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    try {
      console.warn("[React Cache] Fetching errors with filters:", filters);
      const result = await getErrors(filters);
      console.warn(`[React Cache] Cached ${(result.errors || []).length} errors successfully`);
      return result;
    } catch (error) {
      console.error("❌ Error in getErrorsCached:", error);

      await reportErrorToDashboard({
        message: error instanceof Error ? error.message : "Unknown error in getErrorsCached",
        stack: error instanceof Error ? error.stack || null : null,
        appName: "error-dashboard",
        environment: process.env.NODE_ENV || "development",
        url: "error-dashboard",
        userAgent: "server",
        userId: null,
        sessionId: null,
        componentStack: null,
        additionalContext: {
          action: "getErrorsCached",
          filters,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        tags: ["errors", "cache", "server-action"],
      });

      return { success: false, error: "Что-то пошло не так при получении ошибок" };
    }
  },
  ["errors-cached"],
  {
    revalidate: 30, // 30 секунд
    tags: ["errors"],
  },
);

// Кэшированная версия получения статистики ошибок
export const getErrorStatsCached = unstable_cache(
  async () => {
    try {
      console.warn("[React Cache] Fetching error statistics");
      const result = await getErrorStats();
      console.warn("[React Cache] Error statistics cached successfully");
      return result;
    } catch (error) {
      console.error("❌ Error in getErrorStatsCached:", error);

      await reportErrorToDashboard({
        message: error instanceof Error ? error.message : "Unknown error in getErrorStatsCached",
        stack: error instanceof Error ? error.stack || null : null,
        appName: "error-dashboard",
        environment: process.env.NODE_ENV || "development",
        url: "error-dashboard",
        userAgent: "server",
        userId: null,
        sessionId: null,
        componentStack: null,
        additionalContext: {
          action: "getErrorStatsCached",
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        tags: ["errors", "stats", "cache", "server-action"],
      });

      return { success: false, error: "Что-то пошло не так при получении статистики ошибок" };
    }
  },
  ["error-stats-cached"],
  {
    revalidate: 60, // 1 минута
    tags: ["error-stats"],
  },
);
