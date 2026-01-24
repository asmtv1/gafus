"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createWebLogger } from "@gafus/logger";
import { manualTriggerScheduler } from "@gafus/reengagement";

const logger = createWebLogger("trigger-reengagement-scheduler");

/**
 * Ручной запуск планировщика re-engagement (только для ADMIN)
 */
export async function triggerReengagementScheduler(): Promise<{
  success: boolean;
  result?: {
    newCampaigns: number;
    scheduledNotifications: number;
    closedCampaigns: number;
  };
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return {
        success: false,
        error: "Необходимо войти в систему",
      };
    }

    // Проверить роль ADMIN
    if (session.user.role !== "ADMIN") {
      return {
        success: false,
        error: "Недостаточно прав доступа",
      };
    }

    logger.info("Ручной запуск планировщика re-engagement", {
      adminId: session.user.id,
      adminUsername: session.user.username,
    });

    // Запустить планировщик
    const result = await manualTriggerScheduler();

    if (result.success && result.result) {
      logger.success("Планировщик успешно выполнен", result.result);
    } else {
      logger.error("Ошибка выполнения планировщика", new Error(result.error || "Unknown error"));
    }

    return result;
  } catch (error) {
    logger.error("Критическая ошибка при ручном запуске планировщика", error as Error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
