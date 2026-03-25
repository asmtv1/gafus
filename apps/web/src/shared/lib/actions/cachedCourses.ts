"use server";

import { unstable_cache } from "next/cache";

import { TrainingStatus } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";
import { getErrorMessage } from "@gafus/core/errors";
import {
  getCoursesWithProgress,
  getFavoritesCourses,
  getAllCoursesForCache,
  getUserCoursesProgressForCache,
  type CourseCacheItem,
  type UserProgressCacheData,
} from "@gafus/core/services/course";
import { optionalUserIdSchema } from "../validation/schemas";

const logger = createWebLogger("web-cached-courses");

export const getAllCoursesCached = unstable_cache(
  async () => {
    try {
      logger.warn("[React Cache] Fetching all courses (permanent cache)", { operation: "warn" });
      const result = await getAllCoursesForCache();
      if (!result.success || !result.data) {
        return { success: false, error: result.error ?? "Ошибка получения курсов" };
      }
      logger.warn(`[React Cache] Cached ${result.data.length} courses permanently`, {
        operation: "warn",
      });
      return { success: true, data: result.data as CourseCacheItem[] };
    } catch (error) {
      logger.error(
        getErrorMessage(error, "Сбой при загрузке курсов для кэша"),
        error instanceof Error ? error : new Error(String(error)),
        { operation: "getAllCoursesCached", tags: ["courses", "cache", "server-action"] },
      );
      return { success: false, error: "Что-то пошло не так при получении курсов" };
    }
  },
  ["courses-all-permanent"],
  {
    revalidate: 20 * 60,
    tags: ["courses", "courses-all-permanent"],
  },
);

export async function getUserCoursesProgressCached(userId?: string) {
  const safeUserId = optionalUserIdSchema.parse(userId);
  const cacheKeyUserId = safeUserId ?? "anonymous";
  const cachedFunction = unstable_cache(
    async () => {
      try {
        logger.warn("[React Cache] Fetching user courses progress", {
          safeUserId,
          operation: "warn",
        });
        const result = await getUserCoursesProgressForCache(safeUserId ?? null);
        if (!result.success || !result.data) {
          return { success: false, error: result.error ?? "Ошибка получения прогресса" };
        }
        logger.warn(
          `[React Cache] Cached progress for ${result.data.userCourses.length} courses for user`,
          { operation: "warn" },
        );
        return { success: true, data: result.data as UserProgressCacheData };
      } catch (error) {
        logger.error("Error in getUserCoursesProgressCached", error as Error, {
          operation: "error",
          userId: safeUserId,
          tags: ["courses", "cache", "server-action"],
        });
        return { success: false, error: "Что-то пошло не так при получении прогресса курсов" };
      }
    },
    ["user-courses-progress", cacheKeyUserId],
    {
      revalidate: 5 * 60,
      tags: ["courses", "user-progress", `user-${cacheKeyUserId}`],
    },
  );
  return await cachedFunction();
}

export async function getCoursesWithProgressCached(userId?: string) {
  const safeUserId = optionalUserIdSchema.parse(userId);
  const cacheKeyUserId = safeUserId ?? "anonymous";
  const cachedFunction = unstable_cache(
    async () => {
      try {
        logger.warn("[React Cache] Fetching all courses with progress", {
          safeUserId,
          operation: "warn",
        });
        const data = await getCoursesWithProgress(safeUserId ?? undefined);
        logger.warn(`[React Cache] Cached ${data.length} courses for user`, {
          operation: "warn",
        });
        return { success: true, data };
      } catch (error) {
        logger.error("Error in getCoursesWithProgressCached", error as Error, {
          operation: "error",
          userId: safeUserId,
          tags: ["courses", "cache", "server-action"],
        });
        return { success: false, error: "Что-то пошло не так при получении курсов" };
      }
    },
    ["courses-all", cacheKeyUserId],
    {
      revalidate: 5 * 60,
      tags: ["courses", "courses-all", `user-${cacheKeyUserId}`],
    },
  );
  return await cachedFunction();
}

export async function getCoursesWithUserProgressCached(userId?: string) {
  const safeUserId = optionalUserIdSchema.parse(userId);
  try {
    logger.warn("[React Cache] Combining all courses with user progress", {
      safeUserId,
      operation: "warn",
    });
    const allCoursesResult = await getAllCoursesCached();
    if (!allCoursesResult.success) return allCoursesResult;

    const userProgressResult = await getUserCoursesProgressCached(safeUserId);
    if (!userProgressResult.success) return userProgressResult;

    const allCourses = allCoursesResult.data;
    const userProgress = userProgressResult.data as UserProgressCacheData;

    if (!allCourses) {
      return { success: false, error: "Не удалось получить список курсов" };
    }

    const userCoursesMap = new Map(userProgress.userCourses.map((uc) => [uc.courseId, uc]));
    const favoriteCourseIds = new Set(userProgress.favoriteCourseIds);

    const accessibleCourses = allCourses.filter((course) => {
      if (!course.isPrivate) return true;
      if (safeUserId && course.access) {
        return course.access.some(
          (access: { user: { id: string } }) => access.user.id === safeUserId,
        );
      }
      return false;
    });

    const coursesWithProgress = accessibleCourses.map((course) => {
      const userCourse = userCoursesMap.get(course.id);
      return {
        ...course,
        userStatus: userCourse?.status ?? TrainingStatus.NOT_STARTED,
        startedAt: userCourse?.startedAt ?? null,
        completedAt: userCourse?.completedAt ?? null,
        isFavorite: favoriteCourseIds.has(course.id),
        access: undefined,
      };
    });

    logger.warn(
      `[React Cache] Combined ${coursesWithProgress.length} accessible courses with user progress`,
      { operation: "warn" },
    );
    return { success: true, data: coursesWithProgress };
  } catch (error) {
    logger.error("Error in getCoursesWithUserProgressCached", error as Error, {
      operation: "error",
      userId: safeUserId,
      tags: ["courses", "cache", "server-action"],
    });
    return { success: false, error: "Что-то пошло не так при получении курсов с прогрессом" };
  }
}

export async function getFavoritesCoursesCached(userId?: string) {
  const safeUserId = optionalUserIdSchema.parse(userId);
  const cacheKeyUserId = safeUserId ?? "anonymous";
  const cachedFunction = unstable_cache(
    async () => {
      try {
        logger.warn("[React Cache] Fetching favorite courses", { operation: "warn" });
        if (!safeUserId) {
          return { success: false, data: [], error: "User ID is required" };
        }
        const result = await getFavoritesCourses(safeUserId);
        logger.warn(`[React Cache] Cached ${result.data.length} favorite courses`, {
          operation: "warn",
        });
        return { success: true, data: result.data };
      } catch (error) {
        logger.error("Error in getFavoritesCoursesCached", error as Error, {
          operation: "error",
          tags: ["courses", "favorites", "cache", "server-action"],
        });
        return { success: false, error: "Что-то пошло не так при получении избранных курсов" };
      }
    },
    ["courses-favorites", cacheKeyUserId],
    {
      revalidate: 5 * 60,
      tags: ["courses", "courses-favorites", `user-${cacheKeyUserId}`],
    },
  );
  return await cachedFunction();
}
