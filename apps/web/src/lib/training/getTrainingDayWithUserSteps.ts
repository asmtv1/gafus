"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { getCurrentUserId } from "@/utils/getCurrentUserId";
import type { TrainingDetail } from "@gafus/types";

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
      course: {
        select: {
          description: true,
          duration: true,
          id: true,
        },
      },
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

    // Получаем статусы шагов пользователя из UserStep
    let userStepStatuses: Record<string, TrainingStatus> = {};

    if (userTraining) {
      const userSteps = await prisma.userStep.findMany({
        where: { userTrainingId: userTraining.id },
        select: { stepId: true, status: true },
      });

      // Map Prisma status to app TrainingStatus enum
      userStepStatuses = Object.fromEntries(
        userSteps.map(({ stepId, status }) => [
          stepId,
          TrainingStatus[status as keyof typeof TrainingStatus],
        ])
      );
    }

    const steps = trainingDay.steps.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      durationSec: step.durationSec,
      status: userStepStatuses[step.id] ?? TrainingStatus.NOT_STARTED,
    }));

    return {
      id: trainingDay.id,
      day: trainingDay.dayNumber,
      title: trainingDay.title,
      type: trainingDay.type,
      courseId: trainingDay.courseId,
      description: trainingDay.course?.description ?? "",
      duration: trainingDay.course?.duration ?? "",
      userStatus: userTraining
        ? TrainingStatus[userTraining.status as keyof typeof TrainingStatus]
        : TrainingStatus.NOT_STARTED,
      steps,
    };
  } catch (err) {
    console.error("Ошибка в getTrainingDayWithUserSteps:", err);
    throw new Error(
      "Не удалось загрузить тренировочный день с шагами и пользовательскими данными"
    );
  }
}
