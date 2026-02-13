/**
 * Training Service
 * Сервис для работы с тренировками
 */
import { prisma, isPrismaUniqueConstraintError } from "@gafus/prisma";
import { TrainingStatus, calculateDayStatusFromStatuses } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";
import { checkCourseAccess, checkCourseAccessById } from "../course";
import { calculateCourseStatusFromDayStatuses } from "../../utils/training";
import { replacePersonalizationPlaceholders } from "../../utils/personalization";

import type { ChecklistQuestion, TrainingDetail, UserCoursePersonalization } from "@gafus/types";

const logger = createWebLogger("core-training");

// Типы дней, которые не нумеруются (не считаются тренировочными днями)
const NON_NUMBERED_DAY_TYPES = ["instructions", "introduction", "diagnostics", "summary"] as const;

type CourseWithDayLinks = {
  id: string;
  description: string | null;
  videoUrl: string | null;
  equipment: string | null;
  trainingLevel: string | null;
  isPersonalized?: boolean | null;
  userCourses?: {
    userDisplayName: string | null;
    userGender: string | null;
    petName: string | null;
    petGender: string | null;
    petNameGen: string | null;
    petNameDat: string | null;
    petNameAcc: string | null;
    petNameIns: string | null;
    petNamePre: string | null;
  }[];
  dayLinks: {
    id: string;
    order: number;
    day: {
      title: string;
      type: string;
      equipment: string;
      stepLinks: {
        id: string;
        order: number;
        step: {
          durationSec: number | null;
          estimatedDurationSec: number | null;
          type: string | null;
        };
      }[];
    };
    userTrainings: {
      status: string;
      steps: { stepOnDayId: string; status: string }[];
    }[];
  }[];
};

/**
 * Пересчитывает номер дня для отображения, исключая не-тренировочные типы дней
 */
function calculateDisplayDayNumber(
  dayLinks: { day: { type: string } }[],
  currentIndex: number,
): number | null {
  const currentDay = dayLinks[currentIndex];

  if (
    NON_NUMBERED_DAY_TYPES.includes(currentDay.day.type as (typeof NON_NUMBERED_DAY_TYPES)[number])
  ) {
    return null;
  }

  let displayNumber = 0;
  for (let i = 0; i <= currentIndex; i++) {
    if (
      !NON_NUMBERED_DAY_TYPES.includes(
        dayLinks[i].day.type as (typeof NON_NUMBERED_DAY_TYPES)[number],
      )
    ) {
      displayNumber++;
    }
  }

  return displayNumber;
}

function mapCourseToTrainingDays(firstCourse: CourseWithDayLinks) {
  const dayStatuses = firstCourse.dayLinks.map((link) => {
    const ut = link.userTrainings[0];
    const allStepStatuses: string[] = [];
    for (const stepLink of link.day.stepLinks) {
      const userStep = ut?.steps?.find(
        (s: { stepOnDayId: string }) => s.stepOnDayId === stepLink.id,
      );
      allStepStatuses.push(userStep?.status || TrainingStatus.NOT_STARTED);
    }
    const computed = calculateDayStatusFromStatuses(allStepStatuses);
    return {
      id: link.id,
      type: link.day.type,
      status: ut ? computed : TrainingStatus.NOT_STARTED,
    };
  });

  return firstCourse.dayLinks.map((link, index) => {
    const _displayDay = calculateDisplayDayNumber(firstCourse.dayLinks, index);
    const ut = link.userTrainings[0];

    const allStepStatuses: string[] = [];
    for (const stepLink of link.day.stepLinks) {
      const userStep = ut?.steps?.find(
        (s: { stepOnDayId: string }) => s.stepOnDayId === stepLink.id,
      );
      allStepStatuses.push(userStep?.status || TrainingStatus.NOT_STARTED);
    }

    const computed = calculateDayStatusFromStatuses(allStepStatuses);
    const userStatus = ut ? computed : TrainingStatus.NOT_STARTED;

    let isLocked = false;
    if (link.day.type === "summary") {
      const allOtherDaysCompleted = dayStatuses.every((dayStatus) => {
        if (dayStatus.id === link.id) return true;
        return dayStatus.status === TrainingStatus.COMPLETED;
      });
      isLocked = !allOtherDaysCompleted;
    }

    let trainingSeconds = 0;
    let theoryExamSeconds = 0;

    for (const sl of link.day.stepLinks) {
      const step = sl.step;
      if (step.type === "TRAINING") {
        trainingSeconds += step.durationSec ?? 0;
      } else if (step.type === "PRACTICE") {
        trainingSeconds += step.estimatedDurationSec ?? 0;
      } else if (step.type === "BREAK") {
        continue;
      } else if (step.type === "DIARY") {
        continue;
      } else {
        theoryExamSeconds += step.estimatedDurationSec ?? 0;
      }
    }

    const estimatedDuration = Math.ceil(trainingSeconds / 60);
    const theoryMinutes = Math.ceil(theoryExamSeconds / 60);

    return {
      trainingDayId: link.id,
      dayOnCourseId: link.id,
      title: link.day.title,
      type: link.day.type,
      courseId: firstCourse.id,
      userStatus,
      estimatedDuration,
      theoryMinutes,
      equipment: link.day.equipment || "",
      isLocked,
    };
  });
}

/**
 * Получить дни тренировок курса
 */
export async function getTrainingDays(
  userId: string,
  courseType?: string,
): Promise<{
  trainingDays: {
    trainingDayId: string;
    dayOnCourseId: string;
    title: string;
    type: string;
    courseId: string;
    userStatus: TrainingStatus;
    estimatedDuration: number;
    theoryMinutes: number;
    equipment: string;
    isLocked: boolean;
  }[];
  courseDescription: string | null;
  courseId: string | null;
  courseVideoUrl: string | null;
  courseEquipment: string | null;
  courseTrainingLevel: string | null;
  courseIsPersonalized: boolean;
  userCoursePersonalization: UserCoursePersonalization | null;
}> {
  try {
    const courseWhere = courseType ? { type: courseType } : {};

    const firstCourse = await prisma.course.findFirst({
      where: courseWhere,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        description: true,
        videoUrl: true,
        equipment: true,
        trainingLevel: true,
        isPersonalized: true,
        isPrivate: true,
        isPaid: true,
        userCourses: {
          where: { userId },
          select: {
            userDisplayName: true,
            userGender: true,
            petName: true,
            petGender: true,
            petNameGen: true,
            petNameDat: true,
            petNameAcc: true,
            petNameIns: true,
            petNamePre: true,
          },
          take: 1,
        },
        dayLinks: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            day: {
              select: {
                title: true,
                type: true,
                equipment: true,
                stepLinks: {
                  select: {
                    id: true,
                    order: true,
                    step: {
                      select: {
                        durationSec: true,
                        estimatedDurationSec: true,
                        type: true,
                      },
                    },
                  },
                },
              },
            },
            userTrainings: {
              where: { userId },
              select: {
                status: true,
                steps: {
                  select: {
                    stepOnDayId: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!firstCourse) {
      return {
        trainingDays: [],
        courseDescription: null,
        courseId: null,
        courseVideoUrl: null,
        courseEquipment: null,
        courseTrainingLevel: null,
        courseIsPersonalized: false,
        userCoursePersonalization: null,
      };
    }

    // Проверяем доступ к приватному или платному курсу
    if (firstCourse.isPrivate || firstCourse.isPaid) {
      const hasAccess = await checkCourseAccessById(firstCourse.id, userId);
      if (!hasAccess.hasAccess) {
        throw new Error("COURSE_ACCESS_DENIED");
      }
    }

    const trainingDays = mapCourseToTrainingDays(firstCourse as unknown as CourseWithDayLinks);
    const uc = firstCourse.userCourses?.[0];
    const hasPersonalization =
      uc?.userDisplayName != null && String(uc.userDisplayName).trim() !== "";
    const userCoursePersonalization = hasPersonalization
      ? {
          userDisplayName: String(uc!.userDisplayName).trim(),
          userGender: (uc!.userGender === "female" ? "female" : "male") as "male" | "female",
          petName: String(uc!.petName ?? "").trim(),
          petGender:
            (uc!.petGender === "female" || uc!.petGender === "male"
              ? uc!.petGender
              : null) as "male" | "female" | null,
          petNameGen: uc!.petNameGen?.trim() ?? null,
          petNameDat: uc!.petNameDat?.trim() ?? null,
          petNameAcc: uc!.petNameAcc?.trim() ?? null,
          petNameIns: uc!.petNameIns?.trim() ?? null,
          petNamePre: uc!.petNamePre?.trim() ?? null,
        }
      : null;

    return {
      trainingDays,
      courseDescription: firstCourse.description,
      courseId: firstCourse.id,
      courseVideoUrl: firstCourse.videoUrl,
      courseEquipment: firstCourse.equipment,
      courseTrainingLevel: firstCourse.trainingLevel,
      courseIsPersonalized: firstCourse.isPersonalized ?? false,
      userCoursePersonalization,
    };
  } catch (error) {
    logger.error("Ошибка в getTrainingDays", error as Error);
    if (error instanceof Error && error.message === "COURSE_ACCESS_DENIED") {
      throw error;
    }
    throw new Error("Не удалось загрузить Тренировки");
  }
}

/** Создает UserTraining если его нет (идемпотентная операция) */
async function ensureUserTrainingExists(userId: string, dayOnCourseId: string): Promise<string> {
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
      update: {},
      select: { id: true },
    });
    return userTraining.id;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
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

/**
 * Получить детали дня тренировки с шагами пользователя
 */
export async function getTrainingDayWithUserSteps(
  userId: string | undefined,
  courseType: string,
  dayOnCourseId: string,
  options?: { createIfMissing?: boolean },
): Promise<TrainingDetail | null> {
  // Проверяем доступ к курсу
  const accessCheck = await checkCourseAccess(courseType, userId);
  if (!accessCheck.hasAccess) {
    return null;
  }
  const userIdForQuery = userId ?? "";

  const found = await prisma.dayOnCourse.findFirst({
    where: {
      id: dayOnCourseId,
      course: { type: courseType },
    },
    select: {
      id: true,
      order: true,
      courseId: true,
      course: {
        select: {
          duration: true,
          isPersonalized: true,
          userCourses: {
            where: { userId: userIdForQuery },
            select: {
              userDisplayName: true,
              userGender: true,
              petName: true,
              petGender: true,
              petNameGen: true,
              petNameDat: true,
              petNameAcc: true,
              petNameIns: true,
              petNamePre: true,
            },
            take: 1,
          },
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
        where: { userId: userIdForQuery },
        select: {
          id: true,
          status: true,
          currentStepIndex: true,
        },
        take: 1,
      },
    },
  });

  if (!found) return null;

  const {
    id: foundDayOnCourseId,
    order: physicalOrder,
    courseId,
    course: { duration: courseDuration, isPersonalized, userCourses },
    day: { id: trainingDayId, title, description, type, stepLinks },
    userTrainings,
  } = found;

  const userCourse = userCourses[0] ?? null;
  const hasPersonalization =
    userCourse?.userDisplayName != null && String(userCourse.userDisplayName).trim() !== "";
  const requiresPersonalization = Boolean(isPersonalized) && !hasPersonalization;

  if (requiresPersonalization) {
    throw new Error("PERSONALIZATION_REQUIRED");
  }

  const personalization =
    isPersonalized && hasPersonalization
      ? {
          userDisplayName: String(userCourse!.userDisplayName).trim(),
          userGender:
            (userCourse!.userGender === "female" ? "female" : "male") as "male" | "female",
          petName: String(userCourse!.petName ?? "").trim(),
          petGender:
            (userCourse!.petGender === "female" || userCourse!.petGender === "male"
              ? userCourse!.petGender
              : null) as "male" | "female" | null,
          petNameGen: userCourse!.petNameGen?.trim() ?? null,
          petNameDat: userCourse!.petNameDat?.trim() ?? null,
          petNameAcc: userCourse!.petNameAcc?.trim() ?? null,
          petNameIns: userCourse!.petNameIns?.trim() ?? null,
          petNamePre: userCourse!.petNamePre?.trim() ?? null,
        }
      : null;
  const applyPlaceholders = (text: string): string =>
    personalization ? replacePersonalizationPlaceholders(text, personalization) : text;

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

  if (!userTrainingId && options?.createIfMissing && userId) {
    userTrainingId = await ensureUserTrainingExists(userId, foundDayOnCourseId);
  }

  if (!userTrainingId) {
    const steps = stepLinks.map(({ step, order }) => ({
      id: step.id,
      title: applyPlaceholders(step.title),
      description: applyPlaceholders(step.description),
      durationSec: step.durationSec ?? 0,
      estimatedDurationSec: step.estimatedDurationSec ?? null,
      videoUrl: step.videoUrl ?? "",
      imageUrls: step.imageUrls,
      pdfUrls: step.pdfUrls,
      status: TrainingStatus.NOT_STARTED,
      order: order,
      isPausedOnServer: false,
      remainingSecOnServer: undefined,
      type: step.type as "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE" | "DIARY" | undefined,
      checklist: step.checklist,
      requiresVideoReport: step.requiresVideoReport,
      requiresWrittenFeedback: step.requiresWrittenFeedback,
      hasTestQuestions: step.hasTestQuestions,
      userStepId: undefined,
    }));

    return {
      trainingDayId,
      dayOnCourseId: foundDayOnCourseId,
      displayDayNumber,
      title: applyPlaceholders(title),
      type,
      courseId,
      description: applyPlaceholders(description ?? ""),
      duration: courseDuration ?? "",
      userStatus: TrainingStatus.NOT_STARTED,
      steps,
    };
  }

  // Получаем статусы UserStep
  type UserStepWithPause = {
    id: string;
    stepOnDayId: string;
    status: string;
    paused?: boolean;
    remainingSec?: number | null;
  };
  let userSteps: UserStepWithPause[] = [];

  try {
    userSteps = (await prisma.userStep.findMany({
      where: { userTrainingId },
      select: { id: true, stepOnDayId: true, status: true, paused: true, remainingSec: true },
    })) as UserStepWithPause[];
  } catch {
    userSteps = (await prisma.userStep.findMany({
      where: { userTrainingId },
      select: { id: true, stepOnDayId: true, status: true },
    })) as UserStepWithPause[];
  }

  // Создаем недостающие UserStep записи
  const existingStepOnDayIds = new Set(userSteps.map((us) => us.stepOnDayId));
  const allStepOnDayIds = stepLinks.map((link) => link.id);
  const missingStepOnDayIds = allStepOnDayIds.filter((id) => !existingStepOnDayIds.has(id));

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
              select: {
                id: true,
                stepOnDayId: true,
                status: true,
                paused: true,
                remainingSec: true,
              },
            }),
          );
          return await Promise.all(promises);
        },
        { maxWait: 5000, timeout: 10000 },
      );

      userSteps = [...userSteps, ...(newUserSteps as UserStepWithPause[])];
    } catch (creationError) {
      if (isPrismaUniqueConstraintError(creationError)) {
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

  const stepStatuses = Object.fromEntries(
    userSteps.map((record) => [
      record.stepOnDayId,
      TrainingStatus[record.status as string as keyof typeof TrainingStatus],
    ]),
  );

  const userStepIds = Object.fromEntries(
    userSteps.map((record) => [record.stepOnDayId, record.id]),
  );

  const pausedByStepId = Object.fromEntries(
    userSteps.map((record) => [record.stepOnDayId, Boolean(record.paused)]),
  );

  const remainingByStepId = Object.fromEntries(
    userSteps.map((record) => [record.stepOnDayId, record.remainingSec ?? undefined]),
  );

  const steps = stepLinks.map(({ id: stepOnDayId, step, order }) => ({
    id: step.id,
    title: applyPlaceholders(step.title),
    description: applyPlaceholders(step.description),
    durationSec: step.durationSec ?? 0,
    estimatedDurationSec: step.estimatedDurationSec ?? null,
    videoUrl: step.videoUrl ?? "",
    imageUrls: step.imageUrls,
    pdfUrls: step.pdfUrls,
    status: stepStatuses[stepOnDayId] ?? TrainingStatus.NOT_STARTED,
    order: order,
    isPausedOnServer: pausedByStepId[stepOnDayId] ?? false,
    remainingSecOnServer: remainingByStepId[stepOnDayId] ?? undefined,
    type: step.type as "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE" | "DIARY" | undefined,
    checklist: Array.isArray(step.checklist)
      ? (step.checklist as unknown as ChecklistQuestion[])
      : null,
    requiresVideoReport: step.requiresVideoReport,
    requiresWrittenFeedback: step.requiresWrittenFeedback,
    hasTestQuestions: step.hasTestQuestions,
    userStepId: userStepIds[stepOnDayId],
  }));

  const stepStatusesArr = stepLinks.map(
    (stepLink) => stepStatuses[stepLink.id] ?? TrainingStatus.NOT_STARTED,
  );
  const dayUserStatus = calculateDayStatusFromStatuses(stepStatusesArr);

  return {
    trainingDayId,
    dayOnCourseId: foundDayOnCourseId,
    displayDayNumber,
    title: applyPlaceholders(title),
    type,
    courseId,
    description: applyPlaceholders(description ?? ""),
    duration: courseDuration ?? "",
    userStatus: userTraining ? dayUserStatus : TrainingStatus.NOT_STARTED,
    steps,
  };
}

/** Операция над шагом тренировки (дискриминант по type). */
export type StepOperation =
  | { type: "start"; remainingSec?: number }
  | { type: "pause"; remainingSec: number }
  | { type: "resume" }
  | { type: "reset" }
  | { type: "complete" };

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Обновляет шаг и пересчитывает статус дня в одной транзакции.
 * Логика перенесена из web (updateUserStepStatus); API (mobile) подстраивается под неё.
 *
 * @returns courseId и allCompleted для последующего syncUserCourseStatusFromDays / checkAndCompleteCourse
 * @throws Error "DayOnCourse or day not found" | "Step not found" | "INVALID_STATE: ..."
 */
export async function updateStepAndDay(
  userId: string,
  dayOnCourseId: string,
  stepIndex: number,
  operation: StepOperation,
): Promise<{ courseId: string; allCompleted: boolean; stepJustCompleted: boolean }> {
  return prisma.$transaction(
    async (tx: Tx) => {
      const dayOnCourse = await tx.dayOnCourse.findUnique({
        where: { id: dayOnCourseId },
        include: {
          day: {
            include: {
              stepLinks: { orderBy: { order: "asc" as const }, include: { step: true } },
            },
          },
        },
      });

      if (!dayOnCourse || !dayOnCourse.day) {
        throw new Error("DayOnCourse or day not found");
      }

      const trainingDay = dayOnCourse.day;
      const stepLinks = trainingDay.stepLinks;
      const stepLink = stepLinks[stepIndex];

      if (!stepLink) {
        throw new Error("Step not found");
      }

      const stepOnDayId = stepLink.id;

      const userTraining = await tx.userTraining.upsert({
        where: {
          userId_dayOnCourseId: { userId, dayOnCourseId },
        },
        create: {
          userId,
          dayOnCourseId,
          status: TrainingStatus.NOT_STARTED,
        },
        update: {},
        select: { id: true },
      });

      const existingStep = await tx.userStep.findFirst({
        where: { userTrainingId: userTraining.id, stepOnDayId },
        select: { id: true, status: true },
      });

      if (operation.type === "pause" || operation.type === "resume" || operation.type === "reset") {
        if (!existingStep) {
          throw new Error("Step not found");
        }
      }

      if (operation.type === "reset") {
        const currentStatus = existingStep?.status as string;
        if (currentStatus === TrainingStatus.NOT_STARTED) {
          throw new Error("INVALID_STATE: cannot reset not started");
        }
        // COMPLETED и IN_PROGRESS/PAUSED разрешаем сбрасывать — пользователь может перепройти шаг
      }

      let stepJustCompleted = false;

      switch (operation.type) {
        case "start": {
          const remainingSec = operation.remainingSec ?? 0;
          if (existingStep) {
            await tx.userStep.update({
              where: { id: existingStep.id },
              data: {
                status: TrainingStatus.IN_PROGRESS,
                paused: false,
                remainingSec,
              },
            });
          } else {
            await tx.userStep.create({
              data: {
                userTrainingId: userTraining.id,
                stepOnDayId,
                status: TrainingStatus.IN_PROGRESS,
                paused: false,
                remainingSec,
              },
            });
          }
          break;
        }
        case "pause":
          await tx.userStep.update({
            where: { id: existingStep!.id },
            data: { paused: true, remainingSec: operation.remainingSec },
          });
          break;
        case "resume":
          await tx.userStep.update({
            where: { id: existingStep!.id },
            data: { paused: false },
          });
          break;
        case "reset":
          await tx.userStep.update({
            where: { id: existingStep!.id },
            data: { status: TrainingStatus.RESET, paused: false, remainingSec: null },
          });
          break;
        case "complete":
          if (existingStep) {
            const result = await tx.userStep.updateMany({
              where: {
                id: existingStep.id,
                status: { not: TrainingStatus.COMPLETED },
              },
              data: { status: TrainingStatus.COMPLETED },
            });
            stepJustCompleted = result.count > 0;
          } else {
            try {
              await tx.userStep.create({
                data: {
                  userTrainingId: userTraining.id,
                  stepOnDayId,
                  status: TrainingStatus.COMPLETED,
                },
              });
              stepJustCompleted = true;
            } catch (error) {
              if (isPrismaUniqueConstraintError(error)) {
                const result = await tx.userStep.updateMany({
                  where: {
                    userTrainingId: userTraining.id,
                    stepOnDayId,
                    status: { not: TrainingStatus.COMPLETED },
                  },
                  data: { status: TrainingStatus.COMPLETED },
                });
                stepJustCompleted = result.count > 0;
              } else {
                throw error;
              }
            }
          }
          break;
      }

      const stepOnDayIds = stepLinks.map((l) => l.id);
      const userSteps = await tx.userStep.findMany({
        where: { userTrainingId: userTraining.id },
        orderBy: { id: "asc" },
      });

      const allStepStatuses: string[] = [];
      for (let i = 0; i < stepOnDayIds.length; i++) {
        const us = userSteps.find((s) => s.stepOnDayId === stepOnDayIds[i]);
        allStepStatuses.push(us?.status ?? TrainingStatus.NOT_STARTED);
      }

      const correctedDayStatus = calculateDayStatusFromStatuses(allStepStatuses);
      const allCompleted = correctedDayStatus === TrainingStatus.COMPLETED;

      const firstNotCompletedIndex = userSteps.findIndex(
        (s) => s.status !== TrainingStatus.COMPLETED,
      );
      const nextCurrentStepIndex = allCompleted
        ? stepOnDayIds.length - 1
        : firstNotCompletedIndex === -1
          ? 0
          : firstNotCompletedIndex;

      const dayStatus =
        correctedDayStatus === TrainingStatus.COMPLETED
          ? TrainingStatus.COMPLETED
          : correctedDayStatus === TrainingStatus.RESET
            ? TrainingStatus.RESET
            : correctedDayStatus === TrainingStatus.NOT_STARTED
              ? TrainingStatus.NOT_STARTED
              : TrainingStatus.IN_PROGRESS;

      await tx.userTraining.update({
        where: { id: userTraining.id },
        data: {
          status: dayStatus,
          currentStepIndex: nextCurrentStepIndex,
        },
      });

      return { courseId: dayOnCourse.courseId, allCompleted, stepJustCompleted };
    },
    { timeout: 10000 },
  );
}

/**
 * Пересчитывает статус курса по статусам дней (UserTraining) и обновляет UserCourse.
 * Вызывать после любого обновления шага/дня (в т.ч. RESET).
 */
export async function syncUserCourseStatusFromDays(
  userId: string,
  courseId: string,
): Promise<void> {
  const days = await prisma.dayOnCourse.findMany({
    where: { courseId },
    select: { id: true },
    orderBy: { order: "asc" },
  });
  if (days.length === 0) return;

  const userTrainings = await prisma.userTraining.findMany({
    where: {
      userId,
      dayOnCourseId: { in: days.map((d) => d.id) },
    },
    select: { dayOnCourseId: true, status: true },
  });
  const statusByDay = new Map(userTrainings.map((ut) => [ut.dayOnCourseId, ut.status]));
  const dayStatuses = days.map(
    (d) => (statusByDay.get(d.id) as TrainingStatus) ?? TrainingStatus.NOT_STARTED,
  );
  const newStatus = calculateCourseStatusFromDayStatuses(dayStatuses, days.length);

  const existing = await prisma.userCourse.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { status: true, startedAt: true, completedAt: true },
  });

  const updateData: {
    status: TrainingStatus;
    startedAt?: Date;
    completedAt?: Date;
  } = { status: newStatus };
  if (
    (newStatus === TrainingStatus.IN_PROGRESS || newStatus === TrainingStatus.COMPLETED) &&
    !existing?.startedAt
  ) {
    updateData.startedAt = new Date();
  }
  if (newStatus === TrainingStatus.COMPLETED && existing && !existing.completedAt) {
    updateData.completedAt = new Date();
  }

  await prisma.userCourse.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: updateData,
    create: {
      userId,
      courseId,
      status: newStatus,
      startedAt: updateData.startedAt ?? null,
      completedAt: updateData.completedAt ?? null,
    },
  });
}
