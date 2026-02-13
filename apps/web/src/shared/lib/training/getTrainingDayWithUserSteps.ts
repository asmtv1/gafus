"use server";

import { getTrainingDayWithUserSteps as getTrainingDayWithUserStepsFromCore } from "@gafus/core/services/training/trainingService";

import type { TrainingDetail } from "@gafus/types";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { dayIdSchema, trainingTypeSchema } from "../validation/schemas";

const courseTypeSchema = trainingTypeSchema;

export type GetTrainingDayWithUserStepsResult = {
  training: TrainingDetail | null;
  requiresPersonalization?: boolean;
};

export async function getTrainingDayWithUserSteps(
  courseType: string,
  dayOnCourseId: string,
  options?: { createIfMissing?: boolean },
): Promise<GetTrainingDayWithUserStepsResult> {
  const safeCourseType = courseTypeSchema.parse(courseType);
  const safeDayId = dayIdSchema.parse(dayOnCourseId);
  const userId = await getCurrentUserId();

  try {
    const training = await getTrainingDayWithUserStepsFromCore(
      userId ?? undefined,
      safeCourseType,
      safeDayId,
      options,
    );

    return { training };
  } catch (error) {
    if (error instanceof Error && error.message === "PERSONALIZATION_REQUIRED") {
      return { training: null, requiresPersonalization: true };
    }
    throw error;
  }
}
