"use server";

import { createWebLogger } from "@gafus/logger";
import { CACHE_TAGS } from "@gafus/core/services/cache";
import { revalidateTag } from "next/cache";

const logger = createWebLogger("admin-panel-invalidate-courses-cache");

/**
 * Инвалидирует кэш всех курсов
 * Вызывается при создании, обновлении или удалении курсов
 */
export async function invalidateCoursesCache() {
  try {
    logger.warn("[Cache] Invalidating courses cache...", { operation: "warn" });

    revalidateTag(CACHE_TAGS.COURSES);
    revalidateTag(CACHE_TAGS.COURSES_ALL);
    revalidateTag(CACHE_TAGS.COURSES_ALL_PERMANENT);
    revalidateTag(CACHE_TAGS.COURSES_FAVORITES);
    revalidateTag(CACHE_TAGS.COURSES_AUTHORED);
    revalidateTag(CACHE_TAGS.COURSES_METADATA);

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
