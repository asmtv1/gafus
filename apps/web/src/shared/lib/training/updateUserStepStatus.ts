"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";

import { checkAndCompleteCourse } from "../user/userCourses";

import { getCurrentUserId } from "@/utils";

// Вспомогательные функции для работы с транзакциями
async function findOrCreateUserTrainingWithTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  dayOnCourseId: string,
) {
  return (
    (await tx.userTraining.findFirst({
      where: { userId, dayOnCourseId },
      select: { id: true },
    })) ??
    (await tx.userTraining.create({
      data: { userId, dayOnCourseId },
      select: { id: true },
    }))
  );
}

async function findOrCreateUserStepWithTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userTrainingId: string,
  stepOnDayId: string,
  status: TrainingStatus,
) {
  const existing = await tx.userStep.findFirst({
    where: { userTrainingId, stepOnDayId },
  });

  if (existing) {
    await tx.userStep.update({
      where: { id: existing.id },
      data: { status },
    });
  } else {
    await tx.userStep.create({
      data: {
        userTrainingId,
        stepOnDayId,
        status,
      },
    });
  }
}

async function updateUserTrainingStatusWithTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userTrainingId: string,
  trainingDayStepsCount: number,
  courseId: string,
) {
  const userSteps = await tx.userStep.findMany({
    where: { userTrainingId },
    orderBy: { id: "asc" },
  });

  // Проверяем, что у пользователя есть записи для всех шагов дня
  // и все они завершены
  const allCompleted =
    userSteps.length === trainingDayStepsCount &&
    userSteps.every((step: { status: string }) => step.status === "COMPLETED");

  // Индекс текущего шага вычисляем по порядку в дне (0..n-1)
  const firstNotCompletedIndex = userSteps.findIndex(
    (s: { status: string }) => s.status !== TrainingStatus.COMPLETED,
  );
  const nextCurrentStepIndex = allCompleted
    ? trainingDayStepsCount - 1
    : firstNotCompletedIndex === -1
      ? 0
      : firstNotCompletedIndex;

  // Добавляем логирование для отладки
  await tx.userTraining.update({
    where: { id: userTrainingId },
    data: {
      status: allCompleted ? TrainingStatus.COMPLETED : TrainingStatus.IN_PROGRESS,
      currentStepIndex: nextCurrentStepIndex,
    },
  });

  // Возвращаем информацию о завершении для последующей обработки
  return { allCompleted, courseId };
}

export async function updateUserStepStatus(
  userId: string,
  courseId: string,
  day: number,
  stepIndex: number,
  status: TrainingStatus,
  stepTitle?: string,
  stepOrder?: number,
): Promise<{ success: boolean }> {
  try {
    // ВСЕ операции выполняются в одной транзакции
    const result = await prisma.$transaction(
      async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
        // 1. Получаем данные о дне
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
          },
        });

        if (!dayOnCourse) {
          throw new Error("DayOnCourse not found");
        }

        const trainingDay = dayOnCourse.day;
        if (!trainingDay) {
          console.error("Training Day not found", { dayOnCourse });
          throw new Error("Training Day not found");
        }

        // 2. Создаем/находим UserTraining
        const userTraining = await findOrCreateUserTrainingWithTx(tx, userId, dayOnCourse.id);

        // 3. Ищем шаг строго по индексу массива (UI передает 0-based индекс)
        const stepLink = trainingDay.stepLinks[stepIndex];

        if (!stepLink) {
          console.error("Step not found by index after ordering", {
            stepIndex,
            stepOrder,
            total: trainingDay.stepLinks.length,
            orders: trainingDay.stepLinks.map((s: { order: number }) => s.order),
          });
          throw new Error("Step not found");
        }

        // 4. Создаем/обновляем UserStep
        await findOrCreateUserStepWithTx(tx, userTraining.id, stepLink.id, status);

        // 5. Обновляем статус дня
        const { allCompleted } = await updateUserTrainingStatusWithTx(
          tx,
          userTraining.id,
          trainingDay.stepLinks.length,
          dayOnCourse.id,
        );

        return {
          success: true,
          allCompleted,
          courseId: dayOnCourse.courseId,
          stepTitle: stepLink.step?.title ?? "Шаг",
          trainingUrl: `/trainings/${dayOnCourse.courseId}/${day}`,
        };
      },
    );

    // После успешного завершения транзакции выполняем операции, которые не должны быть в транзакции
    if (result.allCompleted) {
      // Проверяем завершение курса только если день действительно завершен
      // и у пользователя есть записи для всех шагов дня
      try {
        await checkAndCompleteCourse(result.courseId);
      } catch (courseError) {
        console.error("Failed to check course completion:", courseError);
        // Не прерываем выполнение, если проверка курса не удалась
      }
    }

    return { success: true };
  } catch (error) {
    console.error("❌ Error in updateUserStepStatus:", error);

    // Отправляем ошибку в dashboard для мониторинга
    try {
      await reportErrorToDashboard({
        message: error instanceof Error ? error.message : String(error),
        appName: "web",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "updateUserStepStatus",
          userId,
          courseId,
          day,
          stepIndex,
          status,
          stepTitle,
          stepOrder,
        },
        tags: ["training", "step-update", "server-action"],
      });
    } catch (reportError) {
      console.error("Failed to report error to dashboard:", reportError);
    }

    return { success: false };
  }
}

export async function updateStepStatusServerAction(
  courseId: string,
  day: number,
  stepIndex: number,
  status: TrainingStatus,
  stepTitle?: string,
  stepOrder?: number,
): Promise<{ success: boolean }> {
  const userId = await getCurrentUserId();
  return updateUserStepStatus(userId, courseId, day, stepIndex, status, stepTitle, stepOrder);
}
