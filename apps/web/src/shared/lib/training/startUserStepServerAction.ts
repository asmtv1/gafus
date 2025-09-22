"use server";

import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { createStepNotificationsForUserStep } from "@shared/lib/StepNotification/createStepNotification";
import { z } from "zod";

import { TrainingStatus } from "@gafus/types";
import { updateUserStepStatus } from "./updateUserStepStatus";
import { invalidateUserProgressCache } from "../actions/invalidateCoursesCache";

import { getCurrentUserId } from "@/utils";
import { courseIdSchema, dayNumberSchema, stepIndexSchema } from "../validation/schemas";

const startStepSchema = z.object({
  courseId: courseIdSchema,
  day: dayNumberSchema,
  stepIndex: stepIndexSchema,
  status: z.nativeEnum(TrainingStatus, {
    errorMap: () => ({ message: "Некорректный статус шага" }),
  }),
  durationSec: z.number().min(0, "Продолжительность должна быть неотрицательной"),
});

export async function startUserStepServerAction(
  courseId: string,
  day: number,
  stepIndex: number,
  status: TrainingStatus,
  durationSec: number,
): Promise<{ success: boolean }> {
  const safeInput = startStepSchema.parse({ courseId, day, stepIndex, status, durationSec });
  try {
    const userId = await getCurrentUserId();

    // Получаем информацию о шаге для уведомления в транзакции

    const stepInfo = await prisma.$transaction(
      async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
        const dayOnCourse = await tx.dayOnCourse.findFirst({
          where: { courseId: safeInput.courseId, order: safeInput.day },
          include: {
            day: {
              include: {
                stepLinks: {
                  include: { step: true },
                  orderBy: { order: "asc" },
                },
              },
            },
            course: true,
          },
        });

        if (!dayOnCourse?.day) {
          throw new Error("DayOnCourse or day not found");
        }

        // Берём шаг по индексу массива (stepIndex — это 0-based индекс в UI)
        const stepLink = dayOnCourse.day.stepLinks[safeInput.stepIndex];
        if (!stepLink?.step) {
          throw new Error("Step not found");
        }

        return {
          step: stepLink.step,
          stepTitle: stepLink.step.title,
          stepOrder: stepLink.order,
          trainingUrl: `/trainings/${safeInput.courseId}/${safeInput.day}`,
        };
      },
    );

    // Обновляем статус шага (это уже использует транзакции)

    await updateUserStepStatus(
      userId,
      safeInput.courseId,
      safeInput.day,
      safeInput.stepIndex,
      safeInput.status,
      stepInfo.stepTitle,
      stepInfo.stepOrder,
    );

    // Устанавливаем статус курса в IN_PROGRESS при первом шаге
    if (safeInput.status === TrainingStatus.IN_PROGRESS) {
      try {
        await prisma.userCourse.upsert({
          where: {
            userId_courseId: {
              userId,
              courseId: safeInput.courseId,
            },
          },
          update: {
            status: TrainingStatus.IN_PROGRESS,
            startedAt: new Date(),
          },
          create: {
            userId,
            courseId: safeInput.courseId,
            status: TrainingStatus.IN_PROGRESS,
            startedAt: new Date(),
          },
        });
      } catch (courseError) {
        console.error("Failed to update course status:", courseError);
        // Не прерываем выполнение, если обновление курса не удалось
      }
    }

    // Создаем уведомления при старте шага (для push-уведомлений по завершении)

    try {
      await createStepNotificationsForUserStep({
        userId,
        day: safeInput.day,
        stepIndex: safeInput.stepIndex,
        stepTitle: stepInfo.stepTitle,
        durationSec: safeInput.durationSec,
        maybeUrl: stepInfo.trainingUrl,
      });
    } catch (notificationError) {
      console.error("❌ Failed to create step notifications:", notificationError);
      // Не прерываем выполнение, если уведомления не создались
    }

    // Инвалидируем кэш прогресса пользователя при начале шага
    const cacheResult = await invalidateUserProgressCache(userId, false);
    
    if (cacheResult.skipped) {
      console.warn(`[Cache] Cache invalidation skipped for user ${userId} - offline mode`);
    }

    return { success: true };
  } catch (error) {
    console.error("💥 startUserStepServerAction failed:", error);

    await reportErrorToDashboard({
      message:
        error instanceof Error ? error.message : "Unknown error in startUserStepServerAction",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "startUserStepServerAction",
        courseId: safeInput.courseId,
        day: safeInput.day,
        stepIndex: safeInput.stepIndex,
        status: safeInput.status,
        durationSec: safeInput.durationSec,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["training", "step-start", "server-action", "transaction"],
    });

    throw new Error("Что-то пошло не так при запуске шага тренировки");
  }
}
