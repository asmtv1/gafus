"use server";

import { createWebLogger } from "@gafus/logger";
import { getUserProgress } from "@shared/lib/user/getUserProgress";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

import { courseIdSchema } from "../validation/schemas";
import { z } from "zod";

const logger = createWebLogger("web-user-progress-action");

const courseIdsSchema = z.array(courseIdSchema).optional();

/**
 * Серверное действие для получения прогресса текущего пользователя по курсу
 */
export async function getUserProgressForCurrentUser(courseId: string) {
  const safeCourseId = courseIdSchema.parse(courseId);
  try {
    const userId = await getCurrentUserId();
    const result = await getUserProgress(safeCourseId, userId);
    return result;
  } catch (error) {
    logger.error("Ошибка при получении прогресса пользователя:", error as Error, {
      operation: "error",
    });
    return null;
  }
}

/**
 * Серверное действие для получения прогресса текущего пользователя по нескольким курсам
 */
export async function getUserProgressForMultipleCourses(courseIds: string[]) {
  const safeCourseIds = courseIdsSchema.parse(courseIds) ?? [];
  try {
    const userId = await getCurrentUserId();
    logger.info("getUserProgressForMultipleCourses - userId:", {
      userId,
      courseIds: safeCourseIds,
      operation: "info",
    });

    if (safeCourseIds.length === 0) {
      logger.info("No course IDs provided, returning empty object", { operation: "info" });
      return {};
    }

    if (!userId) {
      logger.info("No user ID found, returning empty object", { operation: "info" });
      return {};
    }

    const progressPromises = safeCourseIds.map((courseId) => getUserProgress(courseId, userId));
    const results = await Promise.all(progressPromises);

    // Создаем объект курсId -> прогресс (Map не сериализуется в JSON)
    const progressMap: Record<string, unknown> = {};
    safeCourseIds.forEach((courseId, index) => {
      progressMap[courseId] = results[index];
    });

    logger.info("getUserProgressForMultipleCourses - results:", { results, operation: "info" });
    logger.info("getUserProgressForMultipleCourses - progressMap:", {
      progressMap,
      operation: "info",
    });

    return progressMap;
  } catch (error) {
    logger.error("Ошибка при получении прогресса по нескольким курсам:", error as Error, {
      operation: "error",
    });
    return {};
  }
}
