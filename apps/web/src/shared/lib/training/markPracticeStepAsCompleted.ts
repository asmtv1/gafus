"use server";

import { prisma, StepType } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { updateUserStepStatus } from "./updateUserStepStatus";
import { invalidateUserProgressCache } from "../actions/invalidateCoursesCache";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { courseIdSchema, dayIdSchema, stepIndexSchema } from "../validation/schemas";

const logger = createWebLogger('web-mark-practice-step-completed');

const markPracticeStepSchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: dayIdSchema,
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

    // Получаем информацию о шаге и проверяем его тип
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
            operation: "markPracticeStepAsCompleted",
            courseId: safeInput.courseId,
            dayOnCourseId: safeInput.dayOnCourseId,
            stepIndex: safeInput.stepIndex,
          });
          throw new Error("DayOnCourse or day not found");
        }

        // Берём шаг по индексу массива (stepIndex — это 0-based индекс в UI)
        const stepLink = dayOnCourse.day.stepLinks[safeInput.stepIndex];
        if (!stepLink?.step) {
          throw new Error("Step not found");
        }

        // Проверяем, что шаг имеет тип PRACTICE
        if (stepLink.step.type !== StepType.PRACTICE) {
          throw new Error(`Step is not of type PRACTICE. Current type: ${stepLink.step.type}`);
        }

        return {
          stepTitle: stepLink.step.title,
          stepOrder: stepLink.order,
        };
      },
      {
        maxWait: 5000, // 5 секунд ожидания начала транзакции
        timeout: 10000, // 10 секунд таймаут транзакции (средняя операция)
      }
    );

    // Обновляем статус шага на COMPLETED (использует существующую функцию с транзакциями)
    await updateUserStepStatus(
      userId,
      safeInput.courseId,
      safeInput.dayOnCourseId,
      safeInput.stepIndex,
      TrainingStatus.COMPLETED,
      stepInfo.stepTitle,
      stepInfo.stepOrder,
    );

    // Инвалидируем кэш прогресса пользователя
    await invalidateUserProgressCache(userId, false);

    logger.success("Practice step marked as completed", {
      userId,
      courseId: safeInput.courseId,
      dayOnCourseId: safeInput.dayOnCourseId,
      stepIndex: safeInput.stepIndex,
    });

    return { success: true };
  } catch (error) {
    logger.error("Failed to mark practice step as completed", error as Error, {
      operation: 'mark_practice_step_completed_failed',
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
      }
    );

    // Возвращаем ошибку, но не прерываем выполнение на клиенте
    // Пользователь сможет отметить шаг, даже если серверное обновление не удалось
    return { success: false };
  }
}

