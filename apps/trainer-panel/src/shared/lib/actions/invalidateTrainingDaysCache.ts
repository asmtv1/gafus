"use server";


import { createTrainerPanelLogger } from "@gafus/logger";
import { revalidateTag } from "next/cache";

// Создаем логгер для invalidate-training-days-cache
const logger = createTrainerPanelLogger('trainer-panel-invalidate-training-days-cache');

// Функция для инвалидации кэша дней курсов (все дни)
export async function invalidateTrainingDaysCache() {
  try {
    logger.warn("[Cache] Invalidating training days cache", { operation: 'warn' });
    revalidateTag("training");
    revalidateTag("days");
    logger.warn("[Cache] Training days cache invalidated successfully", { operation: 'warn' });
  } catch (error) {
    logger.error("❌ Error invalidating training days cache:", error as Error, { operation: 'error' });
    logger.error(
      error instanceof Error ? error.message : "Unknown error in invalidateTrainingDaysCache",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "invalidateTrainingDaysCache",
        action: "invalidateTrainingDaysCache",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        tags: ["training", "days", "cache", "invalidation"],
      }
    );
  }
}

// Функция для инвалидации кэша конкретного дня курса
export async function invalidateTrainingDayCache(dayId: string) {
  try {
    logger.warn(`[Cache] Invalidating training day cache for day: ${dayId}`, { operation: 'warn' });
    revalidateTag("training");
    revalidateTag("day");
    logger.warn(`[Cache] Training day ${dayId} cache invalidated successfully`, { operation: 'warn' });
  } catch (error) {
    logger.error("❌ Error invalidating training day cache:", error as Error, { operation: 'error' });
    logger.error(
      error instanceof Error ? error.message : "Unknown error in invalidateTrainingDayCache",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "invalidateTrainingDayCache",
        action: "invalidateTrainingDayCache",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        dayId,
        tags: ["training", "day", "cache", "invalidation"],
      }
    );
  }
}
