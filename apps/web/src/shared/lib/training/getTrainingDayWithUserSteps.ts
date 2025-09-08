"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { calculateDayStatusFromStatuses } from "@shared/utils/trainingCalculations";

import type { TrainingDetail } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

/** Находим день курса + userTraining */
async function findTrainingDayWithUserTraining(
  courseType: string,
  dayOrder: number,
  userId: string,
) {
  return prisma.dayOnCourse.findFirst({
    where: {
      order: dayOrder as number,
      course: { type: courseType },
    },
    select: {
      id: true, // dayOnCourseId
      courseId: true,
      course: {
        select: {
          duration: true,
        },
      },
      day: {
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          stepLinks: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              step: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  durationSec: true,
                  videoUrl: true,
                  imageUrls: true,
                  pdfUrls: true,
                },
              },
            },
          },
        },
      },
      userTrainings: {
        where: { userId },
        select: {
          id: true,
          status: true,
          currentStepIndex: true,
        },
        take: 1,
      },
    },
  });
}

/** Получаем детали дня + статусы шагов */
export async function getTrainingDayWithUserSteps(
  courseType: string,
  dayOrder: number,
): Promise<TrainingDetail | null> {
  const userId = await getCurrentUserId();
  const found = await findTrainingDayWithUserTraining(courseType, dayOrder, userId);
  if (!found) return null;

  const {
    courseId,
    course: { duration: courseDuration },
    day: { id: trainingDayId, title, description, type, stepLinks },
    userTrainings,
  } = found;

  const userTraining = userTrainings[0];
  const userTrainingId = userTraining?.id;

  // Получаем статусы UserStep для каждого stepOnDayId
  let stepStatuses: Record<string, TrainingStatus> = {};
  if (userTrainingId) {
    const userSteps = await prisma.userStep.findMany({
      where: { userTrainingId },
      select: { stepOnDayId: true, status: true },
    });
    stepStatuses = Object.fromEntries(
      userSteps.map(({ stepOnDayId, status }: { stepOnDayId: string; status: string }) => [
        stepOnDayId,
        TrainingStatus[status as keyof typeof TrainingStatus],
      ]),
    );
  }

  // Собираем финальный массив шагов
  const steps = stepLinks.map(
    ({
      id: stepOnDayId,
      step,
      order,
    }: {
      id: string;
      step: {
        id: string;
        title: string;
        description: string;
        durationSec: number;
        videoUrl: string | null;
        imageUrls: string[];
        pdfUrls: string[];
      };
      order: number;
    }) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      durationSec: step.durationSec,
      videoUrl: step.videoUrl ?? "",
      imageUrls: step.imageUrls,
      pdfUrls: step.pdfUrls,
      status: stepStatuses[stepOnDayId] ?? TrainingStatus.NOT_STARTED,
      order: order,
    }),
  );

  // Пересчитываем статус дня по статусам шагов (единая логика)
  // Создаем массив статусов для ВСЕХ шагов дня, заполняя недостающие как NOT_STARTED
  const stepStatusesArr: string[] = [];
  for (const stepLink of stepLinks) {
    const status = stepStatuses[stepLink.id] ?? TrainingStatus.NOT_STARTED;
    stepStatusesArr.push(status);
  }
  const dayUserStatus = calculateDayStatusFromStatuses(stepStatusesArr);

  return {
    trainingDayId,
    day: dayOrder,
    title,
    type,
    courseId,
    description: description ?? "",
    duration: courseDuration ?? "",
    userStatus: userTraining
      ? dayUserStatus
      : TrainingStatus.NOT_STARTED,
    steps,
  };
}
