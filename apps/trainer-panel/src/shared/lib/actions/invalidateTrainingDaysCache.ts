"use server";


import { createTrainerPanelLogger } from "@gafus/logger";
import { revalidateTag } from "next/cache";

// Создаем логгер для invalidate-training-days-cache
const logger = createTrainerPanelLogger('trainer-panel-invalidate-training-days-cache');

/**
 * Инвалидирует кэш дней курсов в trainer-panel и web-приложении
 * Вызывает API route web-приложения для инвалидации его кэша
 */
async function invalidateWebAppCache(courseId?: string): Promise<void> {
  const webAppUrl = process.env.NEXT_PUBLIC_WEB_APP_URL || process.env.WEB_APP_URL;
  const secretToken = process.env.REVALIDATE_SECRET_TOKEN;

  if (!webAppUrl) {
    logger.warn("[Cache] WEB_APP_URL not configured, skipping web app cache invalidation", {
      operation: 'warn'
    });
    return;
  }

  try {
    const url = `${webAppUrl}/api/revalidate/training-days`;
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Добавляем секретный токен, если он настроен
    if (secretToken) {
      headers["Authorization"] = `Bearer ${secretToken}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ courseId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Web app cache invalidation failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    logger.warn("[Cache] Web app cache invalidated successfully", {
      courseId,
      result,
      operation: 'warn'
    });
  } catch (error) {
    // Логируем ошибку, но не прерываем выполнение
    // Пользователь увидит обновленные данные при следующем обновлении страницы
    logger.error("❌ Error invalidating web app cache:", error as Error, {
      courseId,
      webAppUrl,
      operation: 'error'
    });
  }
}

// Функция для инвалидации кэша дней курсов (все дни)
export async function invalidateTrainingDaysCache(courseId?: string) {
  try {
    logger.warn("[Cache] Invalidating training days cache", { courseId, operation: 'warn' });
    
    // Инвалидируем локальный кэш trainer-panel
    revalidateTag("training");
    revalidateTag("days");
    
    // Инвалидируем кэш web-приложения через API
    await invalidateWebAppCache(courseId);
    
    logger.warn("[Cache] Training days cache invalidated successfully", {
      courseId,
      operation: 'warn'
    });
  } catch (error) {
    logger.error("❌ Error invalidating training days cache:", error as Error, { operation: 'error' });
    logger.error(
      error instanceof Error ? error.message : "Unknown error in invalidateTrainingDaysCache",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "invalidateTrainingDaysCache",
        action: "invalidateTrainingDaysCache",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        courseId,
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
