"use server";

import { deleteErrorFromDatabase } from "@shared/lib/error-log-service";
import { createErrorDashboardLogger } from "@gafus/logger";

const logger = createErrorDashboardLogger('error-dashboard-delete-error');

/**
 * Удаляет ошибку из PostgreSQL по ID
 * Опционально принимает данные ошибки для поиска по полям, если удаление по ID не удалось
 */
export async function deleteError(
  errorId: string,
  errorData?: {
    message: string;
    createdAt: Date | string;
    appName: string;
    labels?: Record<string, string>;
  }
): Promise<{ 
  success: boolean; 
  message?: string; 
  error?: string 
}> {
  const operationStartTime = Date.now();
  const operationStartIso = new Date().toISOString();
  
  try {
    // Базовая валидация
    if (!errorId || typeof errorId !== 'string' || errorId.trim() === '') {
      return { success: false, error: "ID ошибки отсутствует или некорректен" };
    }
    
    logger.info("Удаление ошибки из БД", {
      errorId,
      timestamp: operationStartIso,
      hasErrorData: !!errorData,
    });
    
    // Подготавливаем fallback поля если доступны
    let fallbackFields: Parameters<typeof deleteErrorFromDatabase>[1] | undefined;
    
    if (errorData) {
      // Определяем уровень из labels или используем 'error' по умолчанию
      // Аналогично логике в syncLokiErrorToDatabase
      const level = errorData.labels?.level?.toLowerCase() || 'error';
      
      // Преобразуем createdAt в Date если нужно
      const timestamp = errorData.createdAt instanceof Date
        ? errorData.createdAt
        : new Date(errorData.createdAt);
      
      fallbackFields = {
        message: errorData.message,
        appName: errorData.appName,
        level,
        timestamp,
      };
      
      logger.info("Подготовлены fallback поля для поиска", {
        errorId,
        appName: fallbackFields.appName,
        level: fallbackFields.level,
        timestamp: fallbackFields.timestamp.toISOString(),
        messagePreview: fallbackFields.message.substring(0, 100),
      });
    }
    
    // Удаляем из БД
    const result = await deleteErrorFromDatabase(errorId, fallbackFields);
    const operationDuration = Date.now() - operationStartTime;
    
    if (result.success) {
      logger.success("Ошибка удалена из БД", { 
        errorId,
        durationMs: operationDuration,
        usedFallback: !!fallbackFields,
      });
      return { success: true, message: "Ошибка удалена" };
    }
    
    logger.error("Не удалось удалить ошибку из БД", new Error(result.error || "Unknown"), {
      errorId,
      durationMs: operationDuration,
      hasFallbackFields: !!fallbackFields,
      error: result.error,
    });
    
    return {
      success: false,
      error: result.error || "Не удалось удалить ошибку"
    };
  } catch (error) {
    const operationDuration = Date.now() - operationStartTime;
    logger.error("Исключение при удалении", error as Error, {
      errorId,
      durationMs: operationDuration,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка"
    };
  }
}
