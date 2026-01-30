"use server";

import { prisma, StepType } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { updateUserStepStatus } from "./updateUserStepStatus";
import { invalidateUserProgressCache } from "../actions/invalidateCoursesCache";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { courseIdSchema, dayIdSchema, stepIndexSchema } from "../validation/schemas";

const logger = createWebLogger("web-mark-diary-step-completed");

const markDiaryStepSchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: dayIdSchema,
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

    const stepInfo = await prisma.$transaction(
      async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
        const dayOnCourse = await tx.dayOnCourse.findUnique({
          where: { id: safeInput.dayOnCourseId },
          include: {
            day: {
              include: {
                stepLinks: {
                  include: { step: true },
                  orderBy: { order: "asc" },
                },
              },
            },
          },
        });

        if (!dayOnCourse?.day) {
          logger.error("DayOnCourse or day not found", new Error("DayOnCourse or day not found"), {
            operation: "markDiaryStepAsCompleted",
            courseId: safeInput.courseId,
            dayOnCourseId: safeInput.dayOnCourseId,
            stepIndex: safeInput.stepIndex,
          });
          throw new Error("DayOnCourse or day not found");
        }

        const stepLink = dayOnCourse.day.stepLinks[safeInput.stepIndex];
        if (!stepLink?.step) {
          throw new Error("Step not found");
        }

        if (stepLink.step.type !== StepType.DIARY) {
          throw new Error(`Step is not of type DIARY. Current type: ${stepLink.step.type}`);
        }

        return {
          stepTitle: stepLink.step.title,
          stepOrder: stepLink.order,
        };
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );

    await updateUserStepStatus(
      userId,
      safeInput.courseId,
      safeInput.dayOnCourseId,
      safeInput.stepIndex,
      TrainingStatus.COMPLETED,
      stepInfo.stepTitle,
      stepInfo.stepOrder,
    );

    await invalidateUserProgressCache(userId, false);

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
      userId: userId,
    });

    logger.error(
      error instanceof Error ? error.message : "Unknown error in markDiaryStepAsCompleted",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "markDiaryStepAsCompleted",
        courseId: safeInput.courseId,
        dayOnCourseId: safeInput.dayOnCourseId,
        stepIndex: safeInput.stepIndex,
        tags: ["training", "diary-step", "server-action"],
      },
    );

    return { success: false };
  }
}
