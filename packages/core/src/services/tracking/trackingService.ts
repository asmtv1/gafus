import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("tracking-service");

/**
 * Отслеживает клик по re-engagement уведомлению
 * @param notificationId - ID уведомления
 */
export async function trackReengagementClick(
  notificationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!notificationId) {
      return {
        success: false,
        error: "ID уведомления не указан",
      };
    }

    await prisma.reengagementNotification.update({
      where: { id: notificationId },
      data: {
        clicked: true,
        clickedAt: new Date(),
      },
    });

    logger.info("Клик по re-engagement уведомлению отслежен", { notificationId });

    return { success: true };
  } catch (error) {
    // Не логируем как ошибку если запись не найдена
    if (error instanceof Error && error.message.includes("Record to update not found")) {
      logger.warn("Запись уведомления не найдена", { notificationId });
      return { success: true };
    }

    logger.error("Ошибка отслеживания клика", error as Error, { notificationId });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
