"use server";

import { createWebLogger } from "@gafus/logger";
import { getTrainingDays as getTrainingDaysFromCore } from "@gafus/core/services/training/trainingService";

import type { TrainingDetail, UserCoursePersonalization } from "@gafus/types";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { optionalTrainingTypeSchema, optionalUserIdSchema } from "../validation/schemas";

const logger = createWebLogger("web-get-training-days");

export async function getTrainingDays(
  typeParam?: string,
  userId?: string,
): Promise<{
  trainingDays: (Pick<
    TrainingDetail,
    "trainingDayId" | "title" | "type" | "courseId" | "userStatus" | "showCoursePathExport"
  > & {
    dayOnCourseId: string;
    estimatedDuration: number;
    theoryMinutes: number;
    equipment: string;
    isLocked: boolean;
  })[];
  courseDescription: string | null;
  courseId: string | null;
  courseVideoUrl: string | null;
  courseEquipment: string | null;
  courseTrainingLevel: string | null;
  courseIsPersonalized: boolean;
  userCoursePersonalization: UserCoursePersonalization | null;
}> {
  try {
    // Never let a client-supplied userId impersonate another subscriber.
    const currentUserId = await getCurrentUserId();
    const requestedUserId = optionalUserIdSchema.parse(userId);
    if (requestedUserId && requestedUserId !== currentUserId) {
      throw new Error("USER_ID_MISMATCH");
    }
    const safeType = optionalTrainingTypeSchema.parse(typeParam);

    // Days include private assignments, current subscription entitlement, progress
    // and personalization. Never cache this user-specific authorization result.
    // Shared immutable lesson content is cached separately in trainingDayContent.
    return await getTrainingDaysFromCore(currentUserId, safeType);
  } catch (error) {
    logger.error("Ошибка в getTrainingDays", error as Error, {
      operation: "get_training_days_error",
    });

    if (error instanceof Error && error.message === "COURSE_ACCESS_DENIED") {
      throw error;
    }

    throw new Error("Не удалось загрузить Тренировки");
  }
}
