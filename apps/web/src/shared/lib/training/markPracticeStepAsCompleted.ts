"use server";

import { TrainingStatus } from "@gafus/types";
import { validateStepTypeAndGetInfo } from "@gafus/core/services/training";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { updateUserStepStatus } from "./updateUserStepStatus";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { courseIdSchema, dayOnCourseIdSchema, stepIndexSchema } from "../validation/schemas";

const logger = createWebLogger("web-mark-practice-step-completed");

const markPracticeStepSchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: dayOnCourseIdSchema,
  stepIndex: stepIndexSchema,
  stepTitle: z.string().trim().optional(),
  stepOrder: z.number().int().min(0).optional(),
});

/**
 * Отмечает практический шаг (без таймера) как завершенный
 * Вызывается при нажатии кнопки "Выполнено"
 */
export async function markPracticeStepAsCompleted(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
  stepTitle?: string,
  stepOrder?: number,
): Promise<{ success: boolean }> {
  const safeInput = markPracticeStepSchema.parse({
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
      ["PRACTICE"],
    );
    if (!stepInfo.valid) {
      logger.error(stepInfo.error ?? "Invalid step type", new Error(stepInfo.error ?? "Invalid"), {
        operation: "markPracticeStepAsCompleted",
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

    logger.success("Practice step marked as completed", {
      userId,
      courseId: safeInput.courseId,
      dayOnCourseId: safeInput.dayOnCourseId,
      stepIndex: safeInput.stepIndex,
    });

    return { success: true };
  } catch (error) {
    logger.error("Failed to mark practice step as completed", error as Error, {
      operation: "mark_practice_step_completed_failed",
      courseId: safeInput.courseId,
      dayOnCourseId: safeInput.dayOnCourseId,
      stepIndex: safeInput.stepIndex,
      userId: userId,
    });

    // Логируем ошибку через logger (отправляется в Loki)
    logger.error(
      error instanceof Error ? error.message : "Unknown error in markPracticeStepAsCompleted",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "markPracticeStepAsCompleted",
        action: "markPracticeStepAsCompleted",
        courseId: safeInput.courseId,
        dayOnCourseId: safeInput.dayOnCourseId,
        stepIndex: safeInput.stepIndex,
        stepTitle: safeInput.stepTitle,
        stepOrder: safeInput.stepOrder,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        tags: ["training", "practice-step", "server-action"],
      },
    );

    // Возвращаем ошибку, но не прерываем выполнение на клиенте
    // Пользователь сможет отметить шаг, даже если серверное обновление не удалось
    return { success: false };
  }
}
