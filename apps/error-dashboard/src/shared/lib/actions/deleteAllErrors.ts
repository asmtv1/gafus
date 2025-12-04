"use server";

import { getLokiClient } from "@shared/lib/loki-client";
import { createErrorDashboardLogger } from "@gafus/logger";
import { revalidatePath, revalidateTag } from "next/cache";

const logger = createErrorDashboardLogger('error-dashboard-delete-all-errors');

/**
 * Удаляет все ошибки из Loki
 */
export async function deleteAllErrors(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    logger.info("Удаление всех ошибок из Loki");

    const client = getLokiClient();
    
    // Удаляем все логи - без фильтров, Loki удалит все логи
    // Используем фильтр app=~".+" чтобы удалить логи всех приложений
    const result = await client.deleteLogs({
      // Без фильтров - удалит все логи
    });

    if (result.success) {
      logger.success("Все ошибки успешно удалены из Loki");
      
      // Инвалидируем серверный кэш через теги
      revalidateTag("errors");
      revalidateTag("error-stats");
      
      // Инвалидируем кэш и страницу
      revalidatePath("/");
      
      return {
        success: true,
        message: "Все ошибки успешно удалены",
      };
    }

    logger.error("Не удалось удалить все ошибки из Loki", new Error(result.error || "Unknown error"));
    return result;
  } catch (error) {
    logger.error("Ошибка при удалении всех ошибок", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка при удалении всех ошибок",
    };
  }
}

