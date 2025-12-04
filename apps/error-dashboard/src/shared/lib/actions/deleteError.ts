"use server";

import { deleteErrorFromDatabase } from "@shared/lib/error-log-service";
import { createErrorDashboardLogger } from "@gafus/logger";

const logger = createErrorDashboardLogger('error-dashboard-delete-error');

/**
 * Удаляет ошибку из PostgreSQL по ID
 */
export async function deleteError(errorId: string): Promise<{ 
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
    });
    
    // Удаляем из БД
    const result = await deleteErrorFromDatabase(errorId);
    const operationDuration = Date.now() - operationStartTime;
    
    if (result.success) {
      logger.success("Ошибка удалена из БД", { 
        errorId,
        durationMs: operationDuration,
      });
      return { success: true, message: "Ошибка удалена" };
    }
    
    logger.error("Не удалось удалить ошибку из БД", new Error(result.error || "Unknown"), {
      errorId,
      durationMs: operationDuration,
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
