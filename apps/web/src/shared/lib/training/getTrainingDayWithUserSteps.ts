"use server";

import { prisma, isPrismaUniqueConstraintError } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { calculateDayStatusFromStatuses } from "@gafus/types";

import type { ChecklistQuestion, TrainingDetail } from "@gafus/types";

import { getCurrentUserId } from "@/utils";
import { dayIdSchema, trainingTypeSchema } from "../validation/schemas";
import { NON_NUMBERED_DAY_TYPES } from "./dayTypes";
import { checkCourseAccess } from "@shared/services/course/courseService";

const courseTypeSchema = trainingTypeSchema;

/**
 * Пересчитывает номер дня для отображения, исключая не-тренировочные типы дней
 * @param dayLinks - Массив всех дней курса
 * @param currentIndex - Индекс текущего дня в массиве
 * @returns Пересчитанный номер дня (начиная с 1) или null для не-тренировочных дней
 */
function calculateDisplayDayNumber(
  dayLinks: { day: { type: string } }[],
  currentIndex: number,
): number | null {
  const currentDay = dayLinks[currentIndex];
  
  // Если текущий день - не-тренировочный тип, возвращаем null
  if (NON_NUMBERED_DAY_TYPES.includes(currentDay.day.type as (typeof NON_NUMBERED_DAY_TYPES)[number])) {
    return null;
  }
  
  // Подсчитываем количество дней до текущего, исключая не-тренировочные типы
  let displayNumber = 0;
  for (let i = 0; i <= currentIndex; i++) {
    if (!NON_NUMBERED_DAY_TYPES.includes(dayLinks[i].day.type as (typeof NON_NUMBERED_DAY_TYPES)[number])) {
      displayNumber++;
    }
  }
  
  return displayNumber;
}

/** Находим день курса + userTraining по ID дня */
async function findTrainingDayWithUserTraining(
  courseType: string,
  dayOnCourseId: string,
  userId: string,
) {
  // Проверяем доступ к курсу перед запросом к БД
  const accessCheck = await checkCourseAccess(courseType);
  if (!accessCheck.hasAccess) {
    return null;
  }

  // Используем ID дня для прямого поиска в БД
  return prisma.dayOnCourse.findFirst({
    where: {
      id: dayOnCourseId,
      course: { type: courseType },
    },
    select: {
      id: true, // dayOnCourseId
      order: true,
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
  dayOnCourseId: string,
  options?: { createIfMissing?: boolean },
): Promise<TrainingDetail | null> {
  const safeCourseType = courseTypeSchema.parse(courseType);
  const safeDayId = dayIdSchema.parse(dayOnCourseId);
  const userId = await getCurrentUserId();
  const found = await findTrainingDayWithUserTraining(safeCourseType, safeDayId, userId);
  if (!found) return null;

  const {
    id: foundDayOnCourseId,
    order: physicalOrder,
    courseId,
    course: { duration: courseDuration },
    day: { id: trainingDayId, title, description, type, stepLinks },
    userTrainings,
  } = found;

  // Используем foundDayOnCourseId (ID из DayOnCourse) для всех операций
  // Это правильный ID, который должен использоваться вместо параметра dayOnCourseId
  const correctDayOnCourseId = foundDayOnCourseId;

  // Пересчитываем номер дня для отображения
  const allDays = await prisma.dayOnCourse.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    select: {
      order: true,
      day: {
        select: {
          type: true,
        },
      },
    },
  });

  const currentDayIndex = allDays.findIndex((d) => d.order === physicalOrder);
  const displayDayNumber = calculateDisplayDayNumber(allDays, currentDayIndex) ?? physicalOrder;

  const userTraining = userTrainings[0];
  let userTrainingId = userTraining?.id;

  // Создаем UserTraining только если явно указано (для компонента страницы)
  if (!userTrainingId && options?.createIfMissing) {
    userTrainingId = await ensureUserTrainingExists(userId, foundDayOnCourseId);
  }
  
  // Если UserTraining всё ещё нет - возвращаем базовую структуру без статусов
  if (!userTrainingId) {
    const steps = stepLinks.map(({ step, order }) => ({
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
      dayOnCourseId: correctDayOnCourseId, // Используем правильный ID из DayOnCourse
      displayDayNumber,
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
    try {
      const newUserSteps = await prisma.$transaction(
        async (tx) => {
          const promises = missingStepOnDayIds.map((stepOnDayId) =>
            tx.userStep.create({
              data: {
                userTrainingId,
                stepOnDayId,
                status: TrainingStatus.NOT_STARTED,
              },
              select: { id: true, stepOnDayId: true, status: true, paused: true, remainingSec: true },
            })
          );
          return await Promise.all(promises);
        },
        {
          maxWait: 5000, // 5 секунд ожидания начала транзакции
          timeout: 10000, // 10 секунд таймаут транзакции (средняя операция)
        }
      );

      userSteps = [...userSteps, ...(newUserSteps as UserStepWithPause[])];
    } catch (creationError) {
      if (isPrismaUniqueConstraintError(creationError)) {
        // При race condition другой запрос уже создал нужные шаги
        const refreshedSteps = (await prisma.userStep.findMany({
          where: { userTrainingId },
          select: { id: true, stepOnDayId: true, status: true, paused: true, remainingSec: true },
        })) as UserStepWithPause[];
        userSteps = refreshedSteps;
      } else {
        throw creationError;
      }
    }
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
    dayOnCourseId: correctDayOnCourseId, // Используем правильный ID из DayOnCourse
    displayDayNumber: displayDayNumber, // Опциональное поле для отображения номера дня
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
