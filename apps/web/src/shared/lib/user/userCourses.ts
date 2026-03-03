"use server";

import {
  completeUserCourse as completeUserCourseCore,
  checkAndCompleteCourse as checkAndCompleteCourseCore,
} from "@gafus/core/services/user";
import { syncUserCourseStatusFromDays as syncUserCourseStatusFromDaysCore } from "@gafus/core/services/training";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { invalidateUserProgressCache } from "../actions/invalidateCoursesCache";
import { courseIdSchema } from "../validation/schemas";

const logger = createWebLogger("web");
const trainingDayStatusesSchema = z.array(
  z.object({
    userStatus: z.string().trim().min(1, "userStatus обязателен"),
  }),
);

export async function assignCoursesToUser(courseId: string) {
  courseIdSchema.parse(courseId);
  try {
    const userId = await getCurrentUserId();
    await invalidateUserProgressCache(userId, false);
    return { success: true };
  } catch (error) {
    logger.error("Ошибка в assignCoursesToUser:", error as Error, { operation: "error" });
    throw new Error("Ошибка при назначении курса. Попробуйте перезагрузить страницу.");
  }
}

export async function completeUserCourse(courseId: string) {
  const safeCourseId = courseIdSchema.parse(courseId);
  try {
    const userId = await getCurrentUserId();
    const result = await completeUserCourseCore(userId, safeCourseId);
    if (!result.success) {
      throw new Error(result.error ?? "Не удалось завершить курс");
    }
    await invalidateUserProgressCache(userId, false);
    return { success: true, data: result.data };
  } catch (error) {
    logger.error("Ошибка в completeUserCourse:", error as Error, { operation: "error" });
    throw new Error("Ошибка при завершении курса. Попробуйте перезагрузить страницу.");
  }
}

export async function syncUserCourseStatusFromDays(userId: string, courseId: string): Promise<void> {
  const safeCourseId = courseIdSchema.parse(courseId);
  await syncUserCourseStatusFromDaysCore(userId, safeCourseId);
}

export async function checkAndCompleteCourse(
  courseIdOrTrainingDays: string | { userStatus: string }[],
  courseIdParam?: string | null,
): Promise<{ success: boolean; reason?: string }> {
  let courseId: string;
  let parsedTrainingDays: { userStatus: string }[] | undefined;

  if (typeof courseIdOrTrainingDays === "string") {
    courseId = courseIdSchema.parse(courseIdOrTrainingDays);
  } else {
    courseId = courseIdSchema.parse(courseIdParam ?? "");
    parsedTrainingDays = trainingDayStatusesSchema.parse(courseIdOrTrainingDays);

    if (!courseId) {
      return { success: false, reason: "CourseId not provided" };
    }
    if (parsedTrainingDays.length === 0) {
      return { success: false, reason: "No training days provided" };
    }
    const allCompleted = parsedTrainingDays.every((day) => day.userStatus === "COMPLETED");
    if (!allCompleted) {
      return { success: false, reason: "Not all training days completed" };
    }

    try {
      const userId = await getCurrentUserId();
      const result = await checkAndCompleteCourseCore(userId, courseId, {
        trainingDays: parsedTrainingDays,
      });
      return result;
    } catch (error) {
      logger.error("Ошибка при проверке завершения курса:", error as Error, { operation: "error" });
      return { success: false, reason: "Error checking course completion" };
    }
  }

  try {
    const userId = await getCurrentUserId();
    return await checkAndCompleteCourseCore(userId, courseId);
  } catch (error) {
    logger.error("Ошибка в checkAndCompleteCourse:", error as Error, { operation: "error" });
    throw new Error("Ошибка при проверке завершения курса. Попробуйте перезагрузить страницу.");
  }
}
