"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { updateErrorStatus } from "@shared/lib/error-log-service";
import { revalidateTag } from "next/cache";
import { createErrorDashboardLogger } from "@gafus/logger";

const logger = createErrorDashboardLogger("error-dashboard-update-status");

/**
 * Обновляет статус ошибки через server action
 * При статусе "resolved" автоматически устанавливает resolvedAt и resolvedBy
 */
export async function updateErrorStatusAction(
  errorId: string,
  status: "new" | "viewed" | "resolved" | "archived",
): Promise<{ success: boolean; error?: string }> {
  try {
    // Получаем сессию для resolvedBy
    const session = await getServerSession(authOptions);
    const resolvedBy = session?.user?.username || session?.user?.id || null;

    logger.info("Обновление статуса ошибки", {
      errorId,
      status,
      resolvedBy,
    });

    // Обновляем статус в БД
    const result = await updateErrorStatus(errorId, status, resolvedBy || undefined);

    if (!result.success) {
      logger.error("Не удалось обновить статус", new Error(result.error || "Unknown error"), {
        errorId,
        status,
      });
      return result;
    }

    // Инвалидируем кэш ошибок
    revalidateTag("seq-errors");
    revalidateTag("errors-cached");

    logger.success("Статус ошибки обновлен", {
      errorId,
      status,
      resolvedBy,
    });

    return { success: true };
  } catch (error) {
    logger.error("Исключение при обновлении статуса", error as Error, {
      errorId,
      status,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
