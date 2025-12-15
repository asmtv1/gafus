"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { calculateDayStatusFromStatuses } from "@shared/utils/trainingCalculations";

import type { ChecklistQuestion, TrainingDetail } from "@gafus/types";

import { getCurrentUserId } from "@/utils";
import { dayNumberSchema, trainingTypeSchema } from "../validation/schemas";

const courseTypeSchema = trainingTypeSchema;
const dayOrderSchema = dayNumberSchema;

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
              estimatedDurationSec: true,
                  videoUrl: true,
                  imageUrls: true,
                  pdfUrls: true,
                  type: true,
                  checklist: true,
                  requiresVideoReport: true,
                  requiresWrittenFeedback: true,
                  hasTestQuestions: true,
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

/** Создает UserTraining если его нет (идемпотентная операция) */
async function ensureUserTrainingExists(
  userId: string,
  dayOnCourseId: string,
): Promise<string> {
  try {
    const userTraining = await prisma.userTraining.upsert({
      where: {
        userId_dayOnCourseId: {
          userId,
          dayOnCourseId,
        },
      },
      create: {
        userId,
        dayOnCourseId,
        status: TrainingStatus.NOT_STARTED,
      },
      update: {}, // Ничего не обновляем, если запись уже существует
      select: { id: true },
    });
    return userTraining.id;
  } catch (error: unknown) {
    // Если race condition - другой запрос уже создал запись, просто получаем её
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const existing = await prisma.userTraining.findUnique({
        where: {
          userId_dayOnCourseId: {
            userId,
            dayOnCourseId,
          },
        },
        select: { id: true },
      });
      if (!existing?.id) {
        throw new Error("Failed to create or find UserTraining");
      }
      return existing.id;
    }
    throw error;
  }
}

/** Получаем детали дня + статусы шагов (read-only для metadata) */
export async function getTrainingDayWithUserSteps(
  courseType: string,
  dayOrder: number,
  options?: { createIfMissing?: boolean },
): Promise<TrainingDetail | null> {
  const safeCourseType = courseTypeSchema.parse(courseType);
  const safeDayOrder = dayOrderSchema.parse(dayOrder);
  const userId = await getCurrentUserId();
  const found = await findTrainingDayWithUserTraining(safeCourseType, safeDayOrder, userId);
  if (!found) return null;

  const {
    courseId,
    course: { duration: courseDuration },
    day: { id: trainingDayId, title, description, type, stepLinks },
    userTrainings,
  } = found;

  const userTraining = userTrainings[0];
  let userTrainingId = userTraining?.id;

  // Создаем UserTraining только если явно указано (для компонента страницы)
  if (!userTrainingId && options?.createIfMissing) {
    userTrainingId = await ensureUserTrainingExists(userId, found.id);
  }
  
  // Если UserTraining всё ещё нет - возвращаем базовую структуру без статусов
  if (!userTrainingId) {
    const steps = stepLinks.map(({ id: stepOnDayId, step, order }) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      durationSec: step.durationSec ?? 0,
      estimatedDurationSec: step.estimatedDurationSec ?? null,
      videoUrl: step.videoUrl ?? "",
      imageUrls: step.imageUrls,
      pdfUrls: step.pdfUrls,
      status: TrainingStatus.NOT_STARTED,
      order: order,
      isPausedOnServer: false,
      remainingSecOnServer: undefined,
      type: step.type as "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE" | undefined,
      checklist: step.checklist,
      requiresVideoReport: step.requiresVideoReport,
      requiresWrittenFeedback: step.requiresWrittenFeedback,
      hasTestQuestions: step.hasTestQuestions,
      userStepId: undefined,
    }));

    return {
      trainingDayId,
      day: safeDayOrder,
      title,
      type,
      courseId,
      description: description ?? "",
      duration: courseDuration ?? "",
      userStatus: TrainingStatus.NOT_STARTED,
      steps,
    };
  }

  // Получаем статусы UserStep для каждого stepOnDayId
  let stepStatuses: Record<string, TrainingStatus> = {};
  let pausedByStepId: Record<string, boolean> = {};
  let remainingByStepId: Record<string, number | undefined> = {};
  let userStepIds: Record<string, string> = {};
  
  // Обратная совместимость: если колонок paused/remainingSec ещё нет в БД/клиенте, не падаем
  type UserStepWithPause = { id: string; stepOnDayId: string; status: string; paused?: boolean; remainingSec?: number | null };
  let withPause = false;
  let userSteps: UserStepWithPause[] = [];
  try {
    const res = (await (prisma as unknown as { userStep: { findMany: (args: unknown) => Promise<unknown> } }).userStep.findMany({
      where: { userTrainingId },
      select: { id: true, stepOnDayId: true, status: true, paused: true, remainingSec: true },
    })) as unknown;
    userSteps = res as UserStepWithPause[];
    withPause = true;
  } catch {
    const res = (await prisma.userStep.findMany({
      where: { userTrainingId },
      select: { id: true, stepOnDayId: true, status: true },
    })) as unknown as { id: string; stepOnDayId: string; status: string }[];
    userSteps = res;
    withPause = false;
  }

  // Создаем недостающие UserStep записи для всех шагов дня
  // Это необходимо для экзаменационных шагов, которым нужен userStepId для сохранения результатов
  const existingStepOnDayIds = new Set(userSteps.map(us => us.stepOnDayId));
  const allStepOnDayIds = stepLinks.map(link => link.id);
  const missingStepOnDayIds = allStepOnDayIds.filter(id => !existingStepOnDayIds.has(id));

  if (missingStepOnDayIds.length > 0) {
    // Создаем недостающие UserStep записи
    const newUserSteps = await prisma.$transaction(
      missingStepOnDayIds.map(stepOnDayId =>
        prisma.userStep.create({
          data: {
            userTrainingId,
            stepOnDayId,
            status: TrainingStatus.NOT_STARTED,
          },
          select: { id: true, stepOnDayId: true, status: true, paused: true, remainingSec: true },
        })
      )
    );

    // Добавляем новые записи к существующим
    userSteps = [...userSteps, ...newUserSteps as UserStepWithPause[]];
  }

  stepStatuses = Object.fromEntries(
    userSteps.map((record) => [
      record.stepOnDayId,
      TrainingStatus[(record.status as string) as keyof typeof TrainingStatus],
    ]),
  );

  userStepIds = Object.fromEntries(
    userSteps.map((record) => [record.stepOnDayId, record.id]),
  );

  if (withPause) {
    pausedByStepId = Object.fromEntries(
      userSteps.map((record) => [record.stepOnDayId, Boolean(record.paused)]),
    );
    remainingByStepId = Object.fromEntries(
      userSteps.map((record) => [record.stepOnDayId, record.remainingSec ?? undefined]),
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
        durationSec: number | null;
        estimatedDurationSec: number | null;
        videoUrl: string | null;
        imageUrls: string[];
        pdfUrls: string[];
        type: string | null;
        checklist: unknown;
        requiresVideoReport: boolean;
        requiresWrittenFeedback: boolean;
        hasTestQuestions: boolean;
      };
      order: number;
    }) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      durationSec: step.durationSec ?? 0,
      estimatedDurationSec: step.estimatedDurationSec ?? null,
      videoUrl: step.videoUrl ?? "",
      imageUrls: step.imageUrls,
      pdfUrls: step.pdfUrls,
      status: stepStatuses[stepOnDayId] ?? TrainingStatus.NOT_STARTED,
      order: order,
      // Серверные поля паузы
      isPausedOnServer: pausedByStepId[stepOnDayId] ?? false,
      remainingSecOnServer: remainingByStepId[stepOnDayId] ?? undefined,
      // Новые поля для типов экзамена
      type: step.type as "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE" | undefined,
      checklist: Array.isArray(step.checklist)
        ? (step.checklist as ChecklistQuestion[])
        : null,
      requiresVideoReport: step.requiresVideoReport,
      requiresWrittenFeedback: step.requiresWrittenFeedback,
      hasTestQuestions: step.hasTestQuestions,
      // ID пользовательского шага для экзаменов
      userStepId: userStepIds[stepOnDayId],
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
    day: safeDayOrder,
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
