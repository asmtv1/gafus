"use server";

import { unstable_cache } from "next/cache";
import { getLogsFromSeq } from "@shared/lib/seq-client";
import { getLogLevel } from "@shared/lib/utils/errorSource";
import { syncSeqErrorToDatabase } from "@shared/lib/error-log-service";
import type { ErrorDashboardReport } from "@gafus/types";

/**
 * Получает логи из Seq с кэшированием
 */
export const getSeqErrorsCached = unstable_cache(
  async (filters?: {
    appName?: string;
    level?: string;
    tags?: string[];
    container?: string;
    limit?: number;
  }) => {
    try {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[getSeqErrorsCached] Fetching logs with filters:', filters);
      }
      
      const errors = await getLogsFromSeq(filters);
      
      if (process.env.NODE_ENV === 'development') {
        console.warn('[getSeqErrorsCached] Fetched logs:', {
          filters,
          count: errors.length,
          sampleIds: errors.slice(0, 3).map(e => e.id),
        });
      }
      
      return { success: true as const, errors };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось получить логи из Seq";
      console.error("[getSeqErrorsCached] Error fetching logs from Seq:", {
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
  ["seq-errors-cached"],
  {
    revalidate: 30, // 30 секунд
    tags: ["seq-errors"],
  },
);

/**
 * Получает ошибки из Seq (для обратной совместимости с getErrors)
 */
export async function getSeqErrors(filters?: {
    appName?: string;
    environment?: string;
    type?: "errors" | "logs" | "all";
    limit?: number;
    offset?: number;
    tags?: string[];
}): Promise<{ success: boolean; errors?: ErrorDashboardReport[]; error?: string }> {
  // Логирование в начале функции для диагностики
  console.warn("[getSeqErrors] FUNCTION CALLED with filters:", JSON.stringify(filters));
  
  try {
    // Преобразуем фильтры для Seq
    const seqFilters: {
      appName?: string;
      level?: string;
      tags?: string[];
      container?: string;
      limit?: number;
    } = {};

    if (filters?.appName) {
      seqFilters.appName = filters.appName;
    }

    if (filters?.tags) {
      seqFilters.tags = filters.tags;
    }

    // Фильтруем по уровню для type
    if (filters?.type === "errors") {
      // Включаем error и fatal как критические уровни
      seqFilters.level = "error|fatal";
    } else if (filters?.type === "logs") {
      // Для логов не фильтруем по уровню
    }
    // Для type: "all" не добавляем фильтр по уровню

    if (filters?.limit) {
      seqFilters.limit = filters.limit;
    }

    console.warn('[getSeqErrors] FUNCTION CALLED with filters:', JSON.stringify(filters));
    console.warn('[getSeqErrors] Calling getLogsFromSeq with filters:', {
      originalFilters: filters,
      seqFilters,
    });

    const errors = await getLogsFromSeq(seqFilters);
    
    console.warn('[getSeqErrors] getLogsFromSeq returned:', {
      count: errors.length,
      sampleAppNames: errors.slice(0, 5).map(e => e.appName),
      sampleLevels: errors.slice(0, 5).map(e => getLogLevel(e) || 'unknown'),
    });

    // Синхронизируем error/fatal логи в БД (fire-and-forget)
    // В production дашборд читает из Seq и автоматически записывает в БД
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
      const errorFatalLogs = errors.filter(error => {
        const level = getLogLevel(error);
        return level === 'error' || level === 'fatal';
      });

      // Синхронизируем асинхронно, не блокируя ответ
      void Promise.all(
        errorFatalLogs.map(error => syncSeqErrorToDatabase(error))
      ).catch(err => {
        console.error('[getSeqErrors] Error syncing logs to database:', err);
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

    console.warn('[getSeqErrors] Successfully fetched errors:', {
      filters,
      totalCount: errors.length,
      filteredCount: filteredErrors.length,
      offset: filters?.offset,
      limit: filters?.limit,
    });

    return { success: true, errors: filteredErrors };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Не удалось получить ошибки из Seq";
    
    console.error("[getSeqErrors] Error getting Seq errors:", {
      filters,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Формируем понятное сообщение об ошибке
    let finalErrorMessage = "Не удалось получить ошибки из Seq";
    
    if (error instanceof Error) {
      finalErrorMessage = error.message;
      
      // Если ошибка содержит информацию о подключении, делаем её более понятной
      if (error.message.includes("fetch") || error.message.includes("подключиться")) {
        finalErrorMessage = error.message;
      } else {
        finalErrorMessage = `Ошибка при получении ошибок из Seq: ${error.message}`;
      }
    }
    
    return {
      success: false,
      error: finalErrorMessage,
    };
  }
}

