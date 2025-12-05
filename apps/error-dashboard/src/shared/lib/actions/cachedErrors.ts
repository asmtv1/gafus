"use server";

import { getLokiErrorsCached } from "./loki-errors";
import { syncLokiErrorToDatabase } from "@shared/lib/error-log-service";
import { getLogLevel } from "@shared/lib/utils/errorSource";
import { createErrorDashboardLogger } from "@gafus/logger";

const logger = createErrorDashboardLogger('error-dashboard-cached-errors');

/**
 * Получает ошибки из Loki, затем синхронизирует их в БД
 * Все ошибки (error, fatal) читаются из Loki, затем автоматически записываются в БД
 * Операции с ошибками (resolve, delete) выполняются только в БД
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
    
    try {
      // Всегда используем Loki для получения ошибок
      // Для ошибок приложений фильтруем по level=error|fatal (только error и fatal)
      // Для container-logs используем специальную логику формирования запроса
      const isContainerLogs = filters?.tags?.includes("container-logs");
      // Для обычных ошибок всегда фильтруем по error|fatal
      // Для container-logs и type: "logs" не фильтруем по level
      const level = isContainerLogs ? undefined :
                    filters?.type === "logs" ? undefined :
                    filters?.type === "errors" ? "error|fatal" :
                    "error|fatal"; // По умолчанию для обычных ошибок только error|fatal
      
      console.warn("[getErrorsCached] Using Loki for errors", {
        isContainerLogs,
        level,
        appName: filters?.appName,
        tags: filters?.tags,
      });

      const lokiResult = await getLokiErrorsCached({
        appName: filters?.appName,
        level,
        tags: filters?.tags,
        limit: filters?.limit,
      });
      
      if (!lokiResult.success) {
        return {
          success: false,
          error: lokiResult.error || "Не удалось получить ошибки из Loki",
        };
      }
      
      const errors = lokiResult.errors || [];
      
      // Применяем offset если указан
      let filteredErrors = errors;
      if (filters?.offset) {
        filteredErrors = filteredErrors.slice(filters.offset);
      }
      
      // Применяем limit после offset
      if (filters?.limit) {
        filteredErrors = filteredErrors.slice(0, filters.limit);
      }
      
      console.warn("[getErrorsCached] Loki result:", {
        success: lokiResult.success,
        errorsCount: errors.length,
        filteredCount: filteredErrors.length,
        sampleIds: filteredErrors.slice(0, 3).map(e => e.id),
        sampleErrors: filteredErrors.slice(0, 2).map(e => ({
          id: e.id,
          message: e.message?.substring(0, 50),
          appName: e.appName,
          tags: e.tags,
          createdAt: e.createdAt,
          hasAdditionalContext: !!e.additionalContext,
        })),
      });
      
      // Проверяем, что errors - это массив
      if (!Array.isArray(filteredErrors)) {
        console.error("[getErrorsCached] ERROR: lokiResult.errors is not an array:", typeof filteredErrors, filteredErrors);
        return {
          success: false,
          error: "Неверный формат данных из Loki",
        };
      }
      
      // Синхронизируем error/fatal логи в БД (fire-and-forget)
      // Это позволяет работать с ошибками в БД (resolve, delete), но читать всегда из Loki
      const errorFatalLogs = filteredErrors.filter(error => {
        const errorLevel = getLogLevel(error);
        return errorLevel === 'error' || errorLevel === 'fatal';
      });

      // Синхронизируем асинхронно, не блокируя ответ
      if (errorFatalLogs.length > 0) {
        void Promise.all(
          errorFatalLogs.map(error => syncLokiErrorToDatabase(error))
        ).catch(err => {
          console.error('[getErrorsCached] Error syncing logs to database:', err);
          logger.error(
            "Failed to sync errors to database",
            err instanceof Error ? err : new Error(String(err)),
            {
              operation: "getErrorsCached",
              action: "syncLokiErrorToDatabase",
              filters,
              tags: ["errors", "loki", "sync", "server-action"],
            }
          );
        });
      }
      
      return {
        success: true,
        errors: filteredErrors,
      };
    } catch (error) {
      logger.error(
        "Failed to get errors from Loki",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: "getErrorsCached",
          action: "getLokiErrorsCached",
          filters,
          tags: ["errors", "loki", "server-action"],
        }
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Не удалось получить ошибки из Loki",
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
