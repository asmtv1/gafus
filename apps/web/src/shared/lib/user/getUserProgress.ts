"use server";

import {
  getDetailedUserProgress,
  type UserDayProgress,
  type UserDetailedProgress,
} from "@gafus/core/services/user";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { courseIdSchema, userIdSchema } from "../validation/schemas";

const logger = createWebLogger("web-get-user-progress");

export type { UserDayProgress, UserDetailedProgress };

const userCourseProgressSchema = z.object({
  courseId: courseIdSchema,
  userId: userIdSchema,
});

export async function getUserProgress(
  courseId: string,
  userId: string,
  options?: { readOnly?: boolean },
): Promise<UserDetailedProgress | null> {
  const { courseId: safeCourseId, userId: safeUserId } = userCourseProgressSchema.parse({
    courseId,
    userId,
  });
  try {
    return await getDetailedUserProgress(safeUserId, safeCourseId, options);
  } catch (error) {
    logger.error("Ошибка при получении прогресса пользователя", error as Error, {
      operation: "get_user_progress_error",
      courseId,
      userId,
    });
    return null;
  }
}
