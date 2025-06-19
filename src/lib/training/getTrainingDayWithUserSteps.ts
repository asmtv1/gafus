"use server";

import { prisma } from "@/shared/prisma";
import { TrainingStatus } from "@prisma/client";
import { getCurrentUserId } from "@/utils/getCurrentUserId";
import type { TrainingDetail } from "@/types/training";

/** Получить тренировочный день с шагами и пользовательскими данными */
async function findTrainingDayWithUserTraining(
  courseType: string,
  day: number,
  userId: string
) {
  return prisma.trainingDay.findFirst({
    where: {
      type: courseType,
      dayNumber: day,
    },
    include: {
      steps: true,
      course: true,
      userTrainings: {
        where: { userId },
        select: {
          id: true,
          currentStepIndex: true,
          status: true,
        },
        take: 1,
      },
    },
  });
}

/** Получить тренировочный день со статусами шагов для текущего пользователя */
export async function getTrainingDayWithUserSteps(
  courseType: string,
  day: number
): Promise<TrainingDetail | null> {
  try {
    const userId = await getCurrentUserId();
    const trainingDay = await findTrainingDayWithUserTraining(
      courseType,
      day,
      userId
    );

    if (!trainingDay) return null;

    const userTraining = trainingDay.userTrainings[0];

    // --- Ключевая часть: тянем статусы шагов из UserStep! ---
    let userStepStatuses: Record<string, TrainingStatus> = {};

    if (userTraining) {
      const userSteps = await prisma.userStep.findMany({
        where: { userTrainingId: userTraining.id },
        select: { stepId: true, status: true },
      });
      userStepStatuses = Object.fromEntries(
        userSteps.map((us) => [us.stepId, us.status])
      );
    }

    const steps = trainingDay.steps.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      durationSec: step.durationSec,
      status: userStepStatuses[step.id] || TrainingStatus.NOT_STARTED,
    }));

    return {
      id: trainingDay.id,
      day: trainingDay.dayNumber,
      title: trainingDay.title,
      type: trainingDay.type,
      courseId: trainingDay.courseId,
      description: trainingDay.course?.description ?? "",
      duration: trainingDay.course?.duration ?? "",
      userStatus: userTraining?.status ?? TrainingStatus.NOT_STARTED,
      steps,
    };
  } catch (err) {
    console.error("Ошибка в getTrainingDayWithUserSteps:", err);
    throw new Error(
      "Не удалось загрузить тренировочный день с шагами и пользовательскими данными"
    );
  }
}
