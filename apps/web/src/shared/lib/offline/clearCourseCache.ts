"use client";

import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-clear-course-cache");

const COURSES_CACHE_NAME = "gafus-courses-v1";

/**
 * Очищает HTML страницы курса из Service Worker Cache
 * @param courseType - Тип курса (например, "personal", "group")
 */
export async function clearCourseCache(courseType: string): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }

  try {
    const cache = await caches.open(COURSES_CACHE_NAME);
    const keys = await cache.keys();

    let deletedCount = 0;

    // Удаляем HTML страницы курса
    for (const request of keys) {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Удаляем страницу списка дней
      if (
        pathname === `/trainings/${courseType}` ||
        pathname === `/trainings/${courseType}/`
      ) {
        await cache.delete(request);
        deletedCount++;
        logger.info("Deleted course list page from cache", {
          courseType,
          url: pathname,
        });
        continue;
      }

      // Удаляем страницы дней курса: /trainings/[courseType]/[dayId]
      const dayPageMatch = pathname.match(
        /^\/trainings\/([^/]+)\/([^/]+)$/
      );
      if (dayPageMatch && dayPageMatch[1] === courseType) {
        await cache.delete(request);
        deletedCount++;
        logger.info("Deleted course day page from cache", {
          courseType,
          dayId: dayPageMatch[2],
          url: pathname,
        });
      }
    }

    logger.info("Course cache cleared", {
      courseType,
      deletedCount,
    });
  } catch (error) {
    logger.error("Failed to clear course cache", error as Error, {
      courseType,
    });
    // Не пробрасываем ошибку, чтобы не прервать удаление курса
  }
}
