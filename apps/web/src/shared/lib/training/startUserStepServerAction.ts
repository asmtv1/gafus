"use server";

import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { createStepNotificationsForUserStep } from "@shared/lib/StepNotification/createStepNotification";

import { updateUserStepStatus } from "./updateUserStepStatus";

import type { TrainingStatus } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

export async function startUserStepServerAction(
  courseId: string,
  day: number,
  stepIndex: number,
  status: TrainingStatus,
  durationSec: number,
): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();

    // Получаем информацию о шаге для уведомления в транзакции

    const stepInfo = await prisma.$transaction(async (tx) => {
      const dayOnCourse = await tx.dayOnCourse.findFirst({
        where: { courseId, order: day },
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
      const stepLink = dayOnCourse.day.stepLinks[stepIndex];
      if (!stepLink?.step) {
        throw new Error("Step not found");
      }

      return {
        step: stepLink.step,
        stepTitle: stepLink.step.title,
        stepOrder: stepLink.order,
        trainingUrl: `/trainings/${courseId}/${day}`,
      };
    });

    // Обновляем статус шага (это уже использует транзакции)

    await updateUserStepStatus(
      userId,
      courseId,
      day,
      stepIndex,
      status,
      stepInfo.stepTitle,
      stepInfo.stepOrder,
    );

    // Создаем уведомления (это внешний сервис, не должен быть в транзакции)

    try {
      await createStepNotificationsForUserStep({
        userId,
        day,
        stepIndex,
        stepTitle: stepInfo.stepTitle,
        durationSec,
        maybeUrl: stepInfo.trainingUrl,
      });
    } catch (notificationError) {
      console.error("❌ Failed to create step notifications:", notificationError);
      // Не прерываем выполнение, если уведомления не создались
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
        courseId,
        day,
        stepIndex,
        status,
        durationSec,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["training", "step-start", "server-action", "transaction"],
    });

    throw new Error("Что-то пошло не так при запуске шага тренировки");
  }
}
