"use server";

import {
  getTrainingDayWithMonetizedSteps,
} from "@gafus/core/services/training/trainingService";

import type { TrainingDetail } from "@gafus/types";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { dayOnCourseIdSchema, trainingTypeSchema } from "../validation/schemas";

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
  const safeDayId = dayOnCourseIdSchema.parse(dayOnCourseId);
  const userId = await getCurrentUserId();
  // Never server-render locked training material to an unauthenticated visitor.
  if (!userId) return { training: null };

  try {
    const training = await getTrainingDayWithMonetizedSteps(userId, safeCourseType, safeDayId, {
      ...options,
      platform: "WEB_DESKTOP",
    });

    return { training };
  } catch (error) {
    if (error instanceof Error && error.message === "PERSONALIZATION_REQUIRED") {
      return { training: null, requiresPersonalization: true };
    }
    throw error;
  }
}
