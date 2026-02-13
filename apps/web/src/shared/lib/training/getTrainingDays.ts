"use server";

import { unstable_cache } from "next/cache";
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
    "trainingDayId" | "title" | "type" | "courseId" | "userStatus"
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
    const safeUserId = optionalUserIdSchema.parse(userId);
    const currentUserId = safeUserId ?? (await getCurrentUserId());
    const safeType = optionalTrainingTypeSchema.parse(typeParam);

    if (!currentUserId) {
      throw new Error("Пользователь не авторизован");
    }

    const cachedFunction = unstable_cache(
      async () => getTrainingDaysFromCore(currentUserId, safeType),
      ["training-days", currentUserId, safeType ?? "all"],
      {
        revalidate: 300,
        tags: ["training", "days", `user-${currentUserId}`],
      },
    );

    return await cachedFunction();
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
