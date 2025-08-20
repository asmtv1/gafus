"use server";

import { unstable_cache } from "next/cache";

import { reportErrorToDashboard } from "../actions/reportError";
import { getAuthoredCourses } from "../course/getAuthoredCourses";
import { getCoursesWithProgress } from "../course/getCourses";
import { getFavoritesCourses } from "../course/getFavoritesCourses";

// Кэшированная версия получения всех курсов
export const getCoursesWithProgressCached = unstable_cache(
  async () => {
    try {
      console.warn("[React Cache] Fetching all courses with progress");
      const result = await getCoursesWithProgress();
      console.warn(`[React Cache] Cached ${result.data.length} courses successfully`);
      return { success: true, data: result.data };
    } catch (error) {
      console.error("❌ Error in getCoursesWithProgressCached:", error);

      await reportErrorToDashboard({
        message:
          error instanceof Error ? error.message : "Unknown error in getCoursesWithProgressCached",
        stack: error instanceof Error ? error.stack : undefined,
        appName: "web",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "getCoursesWithProgressCached",
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        tags: ["courses", "cache", "server-action"],
      });

      return { success: false, error: "Что-то пошло не так при получении курсов" };
    }
  },
  ["courses-all"],
  {
    revalidate: 30, // 30 секунд
    tags: ["courses"],
  },
);

// Кэшированная версия получения избранных курсов
export const getFavoritesCoursesCached = unstable_cache(
  async () => {
    try {
      console.warn("[React Cache] Fetching favorite courses");
      const result = await getFavoritesCourses();
      console.warn(`[React Cache] Cached ${result.data.length} favorite courses successfully`);
      return { success: true, data: result.data };
    } catch (error) {
      console.error("❌ Error in getFavoritesCoursesCached:", error);

      await reportErrorToDashboard({
        message:
          error instanceof Error ? error.message : "Unknown error in getFavoritesCoursesCached",
        stack: error instanceof Error ? error.stack : undefined,
        appName: "web",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "getFavoritesCoursesCached",
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        tags: ["courses", "favorites", "cache", "server-action"],
      });

      return { success: false, error: "Что-то пошло не так при получении избранных курсов" };
    }
  },
  ["courses-favorites"],
  {
    revalidate: 30, // 30 секунд
    tags: ["courses-favorites"],
  },
);

// Кэшированная версия получения созданных курсов
export const getAuthoredCoursesCached = unstable_cache(
  async () => {
    try {
      console.warn("[React Cache] Fetching authored courses");
      const result = await getAuthoredCourses();
      console.warn(`[React Cache] Cached ${result.length} authored courses successfully`);
      return { success: true, data: result };
    } catch (error) {
      console.error("❌ Error in getAuthoredCoursesCached:", error);

      await reportErrorToDashboard({
        message:
          error instanceof Error ? error.message : "Unknown error in getAuthoredCoursesCached",
        stack: error instanceof Error ? error.stack : undefined,
        appName: "web",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "getAuthoredCoursesCached",
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        tags: ["courses", "authored", "cache", "server-action"],
      });

      return { success: false, error: "Что-то пошло не так при получении созданных курсов" };
    }
  },
  ["courses-authored"],
  {
    revalidate: 30, // 30 секунд
    tags: ["courses-authored"],
  },
);
