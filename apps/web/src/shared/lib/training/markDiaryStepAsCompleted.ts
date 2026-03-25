"use server";

import { TrainingStatus } from "@gafus/types";
import { validateStepTypeAndGetInfo } from "@gafus/core/services/training";
import { getErrorMessage } from "@gafus/core/errors";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { updateUserStepStatus } from "./updateUserStepStatus";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { courseIdSchema, dayOnCourseIdSchema, stepIndexSchema } from "../validation/schemas";

const logger = createWebLogger("web-mark-diary-step-completed");

const markDiaryStepSchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: dayOnCourseIdSchema,
  stepIndex: stepIndexSchema,
  stepTitle: z.string().trim().optional(),
  stepOrder: z.number().int().min(0).optional(),
});

/**
 * Отмечает шаг «Дневник успехов» как завершённый.
 * Вызывается из UI после успешного saveDiaryEntry (кнопка «Сохранить»).
 */
export async function markDiaryStepAsCompleted(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
  stepTitle?: string,
  stepOrder?: number,
): Promise<{ success: boolean }> {
  const safeInput = markDiaryStepSchema.parse({
    courseId,
    dayOnCourseId,
    stepIndex,
    stepTitle,
    stepOrder,
  });

  let userId: string | null = null;
  try {
    userId = await getCurrentUserId();

    const stepInfo = await validateStepTypeAndGetInfo(
      safeInput.dayOnCourseId,
      safeInput.stepIndex,
      ["DIARY"],
    );
    if (!stepInfo.valid) {
      logger.error(stepInfo.error ?? "Invalid step type", new Error(stepInfo.error ?? "Invalid"), {
        operation: "markDiaryStepAsCompleted",
        courseId: safeInput.courseId,
        dayOnCourseId: safeInput.dayOnCourseId,
        stepIndex: safeInput.stepIndex,
      });
      throw new Error(stepInfo.error ?? "Шаг не найден");
    }

    await updateUserStepStatus(
      userId,
      safeInput.courseId,
      safeInput.dayOnCourseId,
      safeInput.stepIndex,
      TrainingStatus.COMPLETED,
      stepInfo.stepTitle ?? safeInput.stepTitle,
      stepInfo.stepOrder ?? safeInput.stepOrder,
    );

    logger.success("Diary step marked as completed", {
      userId,
      courseId: safeInput.courseId,
      dayOnCourseId: safeInput.dayOnCourseId,
      stepIndex: safeInput.stepIndex,
    });

    return { success: true };
  } catch (error) {
    logger.error("Failed to mark diary step as completed", error as Error, {
      operation: "mark_diary_step_completed_failed",
      courseId: safeInput.courseId,
      dayOnCourseId: safeInput.dayOnCourseId,
      stepIndex: safeInput.stepIndex,
      userId: userId ?? undefined,
    });

    logger.error(
      getErrorMessage(error, "Сбой при отметке шага дневника"),
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "markDiaryStepAsCompleted",
        action: "markDiaryStepAsCompleted",
        courseId: safeInput.courseId,
        dayOnCourseId: safeInput.dayOnCourseId,
        stepIndex: safeInput.stepIndex,
        stepTitle: safeInput.stepTitle,
        stepOrder: safeInput.stepOrder,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        tags: ["training", "diary-step", "server-action"],
      },
    );

    return { success: false };
  }
}
