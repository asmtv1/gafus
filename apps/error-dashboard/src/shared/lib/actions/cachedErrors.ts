"use server";

import { getSeqErrorsCached } from "./seq-errors";
import { syncSeqErrorToDatabase, getErrorsFromDatabase } from "@shared/lib/error-log-service";
import { getLogLevel } from "@shared/lib/utils/errorSource";
import { createErrorDashboardLogger } from "@gafus/logger";

const logger = createErrorDashboardLogger('error-dashboard-cached-errors');

/**
 * Получает ошибки из PostgreSQL после синхронизации из Seq
 * Новая архитектура: Seq → синхронизация в PostgreSQL → чтение из PostgreSQL → показ в UI
 * PostgreSQL становится единым источником истины для UI
 */
export async function getErrorsCached(filters?: {
    appName?: string;
    environment?: string;
    type?: "errors" | "logs" | "all";
    limit?: number;
    offset?: number;
    tags?: string[];
    status?: 'new' | 'viewed' | 'resolved' | 'archived';
}) {
    console.warn("[getErrorsCached] FUNCTION CALLED with filters:", JSON.stringify(filters));
    
    try {
      // Шаг 1: Синхронизируем ошибки из Seq в PostgreSQL
      // Для ошибок приложений фильтруем по level=error|fatal (только error и fatal)
      // Для container-logs используем специальную логику формирования запроса
      const isContainerLogs = filters?.tags?.includes("container-logs");
      // Для обычных ошибок всегда фильтруем по error|fatal
      // Для container-logs и type: "logs" не фильтруем по level
      const level = isContainerLogs ? undefined :
                    filters?.type === "logs" ? undefined :
                    filters?.type === "errors" ? "error|fatal" :
                    "error|fatal"; // По умолчанию для обычных ошибок только error|fatal
      
      console.warn("[getErrorsCached] Syncing from Seq to PostgreSQL", {
        isContainerLogs,
        level,
        appName: filters?.appName,
        tags: filters?.tags,
      });

      // Получаем ошибки из Seq для синхронизации
      // Используем больший лимит для синхронизации, чтобы не пропустить данные
      const syncLimit = filters?.limit ? Math.max(filters.limit + (filters.offset || 0), 1000) : 1000;
      
      const seqResult = await getSeqErrorsCached({
        appName: filters?.appName,
        level,
        tags: filters?.tags,
        limit: syncLimit,
      });
      
      if (!seqResult.success) {
        // Если не удалось получить из Seq, пытаемся прочитать из БД
        console.warn("[getErrorsCached] Failed to sync from Seq, reading from database only");
        logger.warn("Failed to sync from Seq, reading from database", {
          error: seqResult.error,
          filters,
        });
      } else {
        // Синхронизируем error/fatal логи в БД (синхронно, чтобы данные были актуальны)
        const errors = seqResult.errors || [];
        const errorFatalLogs = errors.filter(error => {
          const errorLevel = getLogLevel(error);
          return errorLevel === 'error' || errorLevel === 'fatal';
        });

        // Синхронизируем синхронно перед чтением из БД
        if (errorFatalLogs.length > 0) {
          try {
            await Promise.all(
              errorFatalLogs.map(error => syncSeqErrorToDatabase(error))
            );
            console.warn("[getErrorsCached] Synced errors to database:", {
              syncedCount: errorFatalLogs.length,
            });
          } catch (syncError) {
            console.error('[getErrorsCached] Error syncing logs to database:', syncError);
            logger.error(
              "Failed to sync errors to database",
              syncError instanceof Error ? syncError : new Error(String(syncError)),
              {
                operation: "getErrorsCached",
                action: "syncSeqErrorToDatabase",
                filters,
                tags: ["errors", "seq", "sync", "server-action"],
              }
            );
            // Продолжаем выполнение, даже если синхронизация не удалась
          }
        }
      }
      
      // Шаг 2: Читаем из PostgreSQL (единый источник истины для UI)
      const dbResult = await getErrorsFromDatabase({
        appName: filters?.appName,
        environment: filters?.environment,
        type: filters?.type,
        level: level, // Передаем level для фильтрации в БД
        status: filters?.status,
        tags: filters?.tags,
        limit: filters?.limit || 50,
        offset: filters?.offset || 0,
      });
      
      if (!dbResult.success) {
        logger.error(
          "Failed to get errors from database",
          new Error(dbResult.error || "Unknown error"),
          {
            operation: "getErrorsCached",
            action: "getErrorsFromDatabase",
            filters,
            tags: ["errors", "database", "server-action"],
          }
        );
        return {
          success: false,
          error: dbResult.error || "Не удалось получить ошибки из базы данных",
        };
      }
      
      const errors = dbResult.errors || [];
      
      console.warn("[getErrorsCached] Database result:", {
        success: dbResult.success,
        errorsCount: errors.length,
        sampleIds: errors.slice(0, 3).map(e => e.id),
        sampleErrors: errors.slice(0, 2).map(e => ({
          id: e.id,
          message: e.message?.substring(0, 50),
          appName: e.appName,
          tags: e.tags,
          createdAt: e.createdAt,
        })),
      });
      
      return {
        success: true,
        errors,
      };
    } catch (error) {
      logger.error(
        "Failed to get errors",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: "getErrorsCached",
          filters,
          tags: ["errors", "server-action"],
        }
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Не удалось получить ошибки",
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
