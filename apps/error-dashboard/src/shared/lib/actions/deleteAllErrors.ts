"use server";

import { deleteAllErrorsFromDatabase } from "@shared/lib/error-log-service";
import { createErrorDashboardLogger } from "@gafus/logger";
import { revalidatePath, revalidateTag } from "next/cache";

const logger = createErrorDashboardLogger("error-dashboard-delete-all-errors");

/**
 * Удаляет все ошибки из PostgreSQL
 * Seq остается нетронутым, используется только для чтения
 */
export async function deleteAllErrors(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const operationStartTime = Date.now();

  try {
    logger.info("Удаление всех ошибок из PostgreSQL");

    const result = await deleteAllErrorsFromDatabase();

    if (result.success) {
      const operationDuration = Date.now() - operationStartTime;
      logger.success("Все ошибки успешно удалены из PostgreSQL", {
        deletedCount: result.deletedCount,
        durationMs: operationDuration,
      });

      // Инвалидируем серверный кэш через теги
      revalidateTag("errors");
      revalidateTag("error-stats");
      revalidateTag("seq-errors");

      // Инвалидируем кэш и страницу
      revalidatePath("/");

      const message = result.deletedCount
        ? `Успешно удалено ${result.deletedCount} ошибок из базы данных`
        : "Все ошибки успешно удалены";

      return {
        success: true,
        message,
      };
    }

    const operationDuration = Date.now() - operationStartTime;
    logger.error(
      "Не удалось удалить все ошибки из PostgreSQL",
      new Error(result.error || "Unknown error"),
      {
        durationMs: operationDuration,
      },
    );

    return {
      success: false,
      error: result.error || "Не удалось удалить все ошибки",
    };
  } catch (error) {
    const operationDuration = Date.now() - operationStartTime;
    logger.error("Ошибка при удалении всех ошибок", error as Error, {
      durationMs: operationDuration,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка при удалении всех ошибок",
    };
  }
}
