"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { getCurrentUserId } from "@/utils/getCurrentUserId";
import { checkAndCompleteCourse } from "../user/userCourses";

async function findOrCreateUserTraining(userId: string, trainingDayId: number) {
  return (
    (await prisma.userTraining.findFirst({
      where: { userId, trainingDayId },
      select: { id: true },
    })) ??
    (await prisma.userTraining.create({
      data: { userId, trainingDayId },
      select: { id: true },
    }))
  );
}

async function findOrCreateUserStep(
  userTrainingId: string,
  step: { id: string; title: string; durationSec: number },
  status: TrainingStatus
) {
  const existing = await prisma.userStep.findFirst({
    where: { userTrainingId, stepId: step.id },
  });

  if (existing) {
    await prisma.userStep.update({
      where: { id: existing.id },
      data: { status },
    });
  } else {
    await prisma.userStep.create({
      data: {
        title: step.title,
        durationSec: step.durationSec,
        userTrainingId,
        stepId: step.id,
        status,
      },
    });
  }
}

async function updateUserTrainingStatus(
  userTrainingId: string,
  trainingDayStepsCount: number,
  courseId: number
) {
  const userSteps = await prisma.userStep.findMany({
    where: { userTrainingId },
  });

  const allCompleted =
    userSteps.length === trainingDayStepsCount &&
    userSteps.every((s) => s.status === TrainingStatus.COMPLETED);

  const nextCurrentStepIndex = allCompleted
    ? trainingDayStepsCount
    : userSteps.findIndex((s) => s.status !== TrainingStatus.COMPLETED);

  await prisma.userTraining.update({
    where: { id: userTrainingId },
    data: {
      status: allCompleted
        ? TrainingStatus.COMPLETED
        : TrainingStatus.IN_PROGRESS,
      currentStepIndex: nextCurrentStepIndex,
    },
  });

  if (allCompleted) {
    await checkAndCompleteCourse(courseId);
  }
}

export async function updateUserStepStatus(
  userId: string,
  courseType: string,
  day: number,
  stepIndex: number,
  status: TrainingStatus
): Promise<{ success: boolean }> {
  try {
    const trainingDay = await prisma.trainingDay.findFirst({
      where: { type: courseType, dayNumber: day },
      include: { steps: true },
    });

    if (!trainingDay) throw new Error("Training Day not found");

    const userTraining = await findOrCreateUserTraining(userId, trainingDay.id);
    const step = trainingDay.steps[stepIndex];
    if (!step) throw new Error("Step not found");

    await findOrCreateUserStep(userTraining.id, step, status);
    await updateUserTrainingStatus(
      userTraining.id,
      trainingDay.steps.length,
      trainingDay.courseId
    );

    // Обновляем startedAt у курса, если это первый шаг и он начат
    if (stepIndex === 0 && status === TrainingStatus.IN_PROGRESS) {
      await prisma.userCourse.updateMany({
        where: { userId, courseId: trainingDay.courseId, startedAt: null },
        data: { startedAt: new Date() },
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Ошибка в updateUserStepStatus:", error);
    throw new Error(
      "Ошибка при обновлении шага тренировки. Попробуйте перезагрузить страницу."
    );
  }
}

export async function updateStepStatusServerAction(
  courseType: string,
  day: number,
  stepIndex: number,
  status: TrainingStatus
): Promise<{ success: boolean }> {
  const userId = await getCurrentUserId();
  return updateUserStepStatus(userId, courseType, day, stepIndex, status);
}
