"use server";

import { CACHE_TAGS } from "@gafus/core/services/cache";
import { createTrainerPanelLogger } from "@gafus/logger";
import { revalidateTag } from "next/cache";

// Создаем логгер для invalidate-courses-cache
const logger = createTrainerPanelLogger("trainer-panel-invalidate-courses-cache");

/**
 * Инвалидирует кэш всех курсов
 * Вызывается при создании, обновлении или удалении курсов
 */
export async function invalidateCoursesCache() {
  try {
    logger.warn("[Cache] Invalidating courses cache...", { operation: "warn" });

    // Инвалидируем все теги, связанные с курсами (для trainer-panel)
    revalidateTag(CACHE_TAGS.COURSES);
    revalidateTag(CACHE_TAGS.COURSES_ALL);
    revalidateTag(CACHE_TAGS.COURSES_ALL_PERMANENT);
    revalidateTag(CACHE_TAGS.COURSES_FAVORITES);
    revalidateTag(CACHE_TAGS.COURSES_AUTHORED);
    revalidateTag(CACHE_TAGS.COURSES_METADATA);

    // Инвалидируем кэш курсов на web (через API, т.к. это отдельный Next.js процесс)
    try {
      const webUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gafus.ru";
      const revalidateUrl = `${webUrl}/api/revalidate/courses`;
      const secretToken = process.env.REVALIDATE_SECRET_TOKEN;

      if (secretToken) {
        const response = await fetch(revalidateUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${secretToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          logger.warn("[Cache] Failed to invalidate web courses cache", {
            status: response.status,
            operation: "warn",
          });
        } else {
          logger.warn("[Cache] Web courses cache invalidated successfully", {
            operation: "warn",
          });
        }
      } else {
        logger.warn("[Cache] REVALIDATE_SECRET_TOKEN not set, skipping web cache invalidation", {
          operation: "warn",
        });
      }
    } catch (webCacheError) {
      // Логируем, но не прерываем выполнение — кэш trainer-panel уже инвалидирован
      logger.warn("[Cache] Error invalidating web courses cache (non-critical)", {
        error: webCacheError instanceof Error ? webCacheError.message : String(webCacheError),
        operation: "warn",
      });
    }

    logger.warn("[Cache] Courses cache invalidated successfully", { operation: "warn" });
    return { success: true };
  } catch (error) {
    logger.error("❌ Error invalidating courses cache:", error as Error, { operation: "error" });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Инвалидирует только базовый кэш курсов (без пользовательских данных)
 * Используется при изменении структуры курсов
 */
export async function invalidateBaseCoursesCache() {
  try {
    logger.warn("[Cache] Invalidating base courses cache...", { operation: "warn" });

    revalidateTag(CACHE_TAGS.COURSES_ALL_PERMANENT);

    logger.warn("[Cache] Base courses cache invalidated successfully", { operation: "warn" });
    return { success: true };
  } catch (error) {
    logger.error("❌ Error invalidating base courses cache:", error as Error, {
      operation: "error",
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
