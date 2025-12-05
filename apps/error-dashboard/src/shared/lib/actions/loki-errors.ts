"use server";

import { unstable_cache } from "next/cache";
import { getLogsFromLoki } from "@shared/lib/loki-client";
import { getLogLevel } from "@shared/lib/utils/errorSource";
import { syncLokiErrorToDatabase } from "@shared/lib/error-log-service";
import type { ErrorDashboardReport } from "@gafus/types";

/**
 * Получает логи из Loki с кэшированием
 */
export const getLokiErrorsCached = unstable_cache(
  async (filters?: {
    appName?: string;
    level?: string;
    tags?: string[];
    container?: string;
    limit?: number;
  }) => {
    try {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[getLokiErrorsCached] Fetching logs with filters:', filters);
      }
      
      const errors = await getLogsFromLoki(filters);
      
      if (process.env.NODE_ENV === 'development') {
        console.warn('[getLokiErrorsCached] Fetched logs:', {
          filters,
          count: errors.length,
          sampleIds: errors.slice(0, 3).map(e => e.id),
        });
      }
      
      return { success: true as const, errors };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось получить логи из Loki";
      console.error("[getLokiErrorsCached] Error fetching logs from Loki:", {
        filters,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      return {
        success: false as const,
        error: errorMessage,
      };
    }
  },
  ["loki-errors-cached"],
  {
    revalidate: 30, // 30 секунд
    tags: ["loki-errors"],
  },
);

/**
 * Получает ошибки из Loki (для обратной совместимости с getErrors)
 */
export async function getLokiErrors(filters?: {
    appName?: string;
    environment?: string;
    type?: "errors" | "logs" | "all";
    limit?: number;
    offset?: number;
    tags?: string[];
}): Promise<{ success: boolean; errors?: ErrorDashboardReport[]; error?: string }> {
  // Логирование в начале функции для диагностики
  console.warn("[getLokiErrors] FUNCTION CALLED with filters:", JSON.stringify(filters));
  
  try {
    // Преобразуем фильтры для Loki
    const lokiFilters: {
      appName?: string;
      level?: string;
      tags?: string[];
      container?: string;
      limit?: number;
    } = {};

    if (filters?.appName) {
      lokiFilters.appName = filters.appName;
    }

    if (filters?.tags) {
      lokiFilters.tags = filters.tags;
    }

    // Фильтруем по уровню для type
    if (filters?.type === "errors") {
      // Включаем error и fatal как критические уровни
      // Используем regex matcher для Loki: level=~"error|fatal"
      lokiFilters.level = "error|fatal";
    } else if (filters?.type === "logs") {
      // Для логов не фильтруем по уровню
    }
    // Для type: "all" не добавляем фильтр по уровню

    if (filters?.limit) {
      lokiFilters.limit = filters.limit;
    }

    console.warn('[getLokiErrors] FUNCTION CALLED with filters:', JSON.stringify(filters));
    console.warn('[getLokiErrors] Calling getLogsFromLoki with filters:', {
      originalFilters: filters,
      lokiFilters,
    });

    const errors = await getLogsFromLoki(lokiFilters);
    
    console.warn('[getLokiErrors] getLogsFromLoki returned:', {
      count: errors.length,
      sampleAppNames: errors.slice(0, 5).map(e => e.appName),
      sampleLevels: errors.slice(0, 5).map(e => getLogLevel(e) || 'unknown'),
    });

    // Синхронизируем error/fatal логи в БД (fire-and-forget)
    // В production дашборд читает из Loki и автоматически записывает в БД
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
      const errorFatalLogs = errors.filter(error => {
        const level = getLogLevel(error);
        return level === 'error' || level === 'fatal';
      });

      // Синхронизируем асинхронно, не блокируя ответ
      void Promise.all(
        errorFatalLogs.map(error => syncLokiErrorToDatabase(error))
      ).catch(err => {
        console.error('[getLokiErrors] Error syncing logs to database:', err);
      });
    }

    // Применяем offset
    let filteredErrors = errors;
    if (filters?.offset) {
      filteredErrors = filteredErrors.slice(filters.offset);
    }

    // Применяем limit после offset
    if (filters?.limit) {
      filteredErrors = filteredErrors.slice(0, filters.limit);
    }

    console.warn('[getLokiErrors] Successfully fetched errors:', {
      filters,
      totalCount: errors.length,
      filteredCount: filteredErrors.length,
      offset: filters?.offset,
      limit: filters?.limit,
    });

    return { success: true, errors: filteredErrors };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Не удалось получить ошибки из Loki";
    
    console.error("[getLokiErrors] Error getting Loki errors:", {
      filters,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Формируем понятное сообщение об ошибке
    let finalErrorMessage = "Не удалось получить ошибки из Loki";
    
    if (error instanceof Error) {
      finalErrorMessage = error.message;
      
      // Если ошибка содержит информацию о подключении, делаем её более понятной
      if (error.message.includes("fetch") || error.message.includes("подключиться")) {
        finalErrorMessage = error.message;
      } else {
        finalErrorMessage = `Ошибка при получении ошибок из Loki: ${error.message}`;
      }
    }
    
    return {
      success: false,
      error: finalErrorMessage,
    };
  }
}

