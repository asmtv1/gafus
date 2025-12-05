"use server";

import { getErrorsFromDatabase } from "@shared/lib/error-log-service";
import { getLokiErrorsCached } from "./loki-errors";
import { createErrorDashboardLogger } from "@gafus/logger";

const logger = createErrorDashboardLogger('error-dashboard-cached-errors');

/**
 * Получает ошибки из PostgreSQL или Loki в зависимости от фильтров
 */
export async function getErrorsCached(filters?: {
    appName?: string;
    environment?: string;
    type?: "errors" | "logs" | "all";
    limit?: number;
    offset?: number;
    tags?: string[];
}) {
    console.warn("[getErrorsCached] FUNCTION CALLED with filters:", JSON.stringify(filters));
    
    // Если есть тег container-logs, используем Loki вместо БД
    if (filters?.tags?.includes("container-logs")) {
      console.warn("[getErrorsCached] Using Loki for container-logs");
      try {
        const lokiErrors = await getLokiErrorsCached({
          appName: filters?.appName,
          level: filters?.type === "errors" ? "error|fatal" : undefined,
          tags: filters?.tags,
          limit: filters?.limit,
        });
        
        return {
          success: true,
          errors: lokiErrors,
        };
      } catch (error) {
        logger.error(
          "Failed to get container logs from Loki",
          error instanceof Error ? error : new Error(String(error)),
          {
            operation: "getErrorsCached",
            action: "getLokiErrorsCached",
            filters,
            tags: ["container-logs", "loki", "server-action"],
          }
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : "Не удалось получить логи контейнеров из Loki",
        };
      }
    }
    
    try {
      console.warn("[getErrorsCached] Fetching errors from database with filters:", filters);
      
      // Преобразуем type в level для БД
      let level: string | undefined;
      if (filters?.type === "errors") {
        level = "error|fatal";
      }
      
      const result = await getErrorsFromDatabase({
        appName: filters?.appName,
        environment: filters?.environment,
        level,
        limit: filters?.limit,
        offset: filters?.offset,
        tags: filters?.tags,
      });
      
      if (!result.success) {
        logger.error(
          result.error || "Failed to get errors from database",
          new Error(result.error || "Unknown error"),
          {
            operation: "getErrorsCached",
            action: "getErrorsFromDatabase",
            filters,
            tags: ["errors", "cache", "server-action", "database"],
        },
        );
        return result;
      }
      
      const errorCount = (result.errors || []).length;
      console.warn("[getErrorsCached] Fetched %d errors from database successfully", errorCount, {
        filters,
        errorIds: result.errors?.slice(0, 3).map((e) => e.id),
      });
      
      return result;
    } catch (error) {
      console.error("❌ Error in getErrorsCached:", error);

      const errorMessage = error instanceof Error ? error.message : "Unknown error in getErrorsCached";

      logger.error(
        errorMessage,
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: "getErrorsCached",
          action: "getErrorsCached",
          filters,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          tags: ["errors", "cache", "server-action"],
      },
      );

      return { 
        success: false, 
        error: `Ошибка при получении ошибок: ${errorMessage}`,
      };
    }
}

/**
 * Получает статистику ошибок из PostgreSQL
 */
export async function getErrorStatsCached() {
    console.warn("[getErrorStatsCached] FUNCTION CALLED");
    
    try {
      console.warn("[getErrorStatsCached] Fetching error statistics from database");
      
      const { getErrorStatsFromDatabase } = await import("@shared/lib/error-log-service");
      const result = await getErrorStatsFromDatabase();
      
      console.warn("[getErrorStatsCached] getErrorStatsFromDatabase result:", {
        success: result.success,
        total: result.stats?.total || 0,
        error: result.error,
      });
      
      if (!result.success) {
        logger.error(
          result.error || "Failed to get error statistics from database",
          new Error(result.error || "Unknown error"),
          {
            operation: "getErrorStatsCached",
            action: "getErrorStatsFromDatabase",
            tags: ["errors", "stats", "cache", "server-action", "database"],
        },
        );
        return {
          success: false,
          error: result.error || "Не удалось получить статистику ошибок",
        };
      }
      
      console.warn("[getErrorStatsCached] Statistics:", {
        total: result.stats?.total,
        unresolved: result.stats?.unresolved,
        byApp: result.stats?.byApp.slice(0, 5),
        byEnvironment: result.stats?.byEnvironment.slice(0, 3),
      });
      
      return {
        success: true,
        stats: result.stats,
      };
    } catch (error) {
      console.error("❌ Error in getErrorStatsCached:", error);

      logger.error(
        error instanceof Error ? error.message : "Unknown error in getErrorStatsCached",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: "getErrorStatsCached",
          action: "getErrorStatsCached",
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          tags: ["errors", "stats", "cache", "server-action"],
      },
      );

      return { success: false, error: "Что-то пошло не так при получении статистики ошибок" };
    }
}
