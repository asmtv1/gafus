/**
 * Training Service
 * Сервис для работы с тренировками
 */
import type { TrainingStatus as PrismaTrainingStatus } from "@gafus/prisma";
import { prisma, isPrismaUniqueConstraintError } from "@gafus/prisma";
import { TrainingStatus, calculateDayStatusFromStatuses } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";
import { checkCourseAccess, checkCourseAccessById } from "../course";
import { hasActiveGafusCourseStepAccess } from "../contentAccess";
import {
  getPremiumOrRewardedAccess,
  requirePremiumOrRewardedUnlock,
  SubscriptionOrCreditsRequiredError,
  type MonetizedAccessPlatform,
  type RewardedTargetInput,
} from "../rewardedCredits";
import { calculateCourseStatusFromDayStatuses } from "../../utils/training";
import { replacePersonalizationPlaceholders } from "../../utils/personalization";
import { getTrainingDayContent } from "./trainingDayContent";

import type {
  ChecklistQuestion,
  TrainingDetail,
  TrainingStep,
  UserCoursePersonalization,
} from "@gafus/types";

const logger = createWebLogger("core-training");

// Типы дней, которые не нумеруются (не считаются тренировочными днями)
const NON_NUMBERED_DAY_TYPES = ["instructions", "introduction", "diagnostics", "summary"] as const;
const REWARDED_MONETIZED_STEP_TYPES = [
  "TRAINING",
  "PRACTICE",
  "THEORY",
  "EXAMINATION",
  "SURVEY",
] as const;

function isRewardedMonetizedStepType(
  stepType: TrainingStep["type"] | string | null | undefined,
): boolean {
  return REWARDED_MONETIZED_STEP_TYPES.includes(
    stepType as (typeof REWARDED_MONETIZED_STEP_TYPES)[number],
  );
}

function isSubscriptionOrCreditsRequiredError(error: unknown): boolean {
  return (
    error instanceof SubscriptionOrCreditsRequiredError ||
    (error instanceof Error && error.name === "SubscriptionOrCreditsRequiredError")
  );
}

async function getCourseRewardedPolicy(courseType: string): Promise<{
  isPaid: boolean;
  isPrivate: boolean;
} | null> {
  return prisma.course.findFirst({
    where: { type: courseType },
    select: { isPaid: true, isPrivate: true },
  });
}

async function courseAllowsTrainingDetails(
  courseType: string | undefined,
  userId: string | undefined,
): Promise<boolean> {
  if (!courseType) return true;
  const accessCheck = await checkCourseAccess(courseType, userId);
  if (accessCheck.hasAccess) return true;
  const course = await getCourseRewardedPolicy(courseType);
  return Boolean(course && !course.isPaid && !course.isPrivate);
}

async function shouldApplyRewardedStepAccess(courseType: string | undefined): Promise<boolean> {
  if (!courseType) return true;
  const course = await getCourseRewardedPolicy(courseType);
  return Boolean(course && !course.isPrivate);
}

function redactLockedTrainingStep(step: TrainingStep, target: RewardedTargetInput): TrainingStep {
  return {
    ...step,
    description: "",
    videoUrl: "",
    imageUrls: [],
    pdfUrls: [],
    checklist: null,
    surveySlug: null,
    locked: true,
    monetizationTarget: {
      targetType: "COURSE_STEP",
      targetId: target.targetId,
    },
  };
}

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
    dayId: string;
    order: number;
    day: {
      title: string;
      type: string;
      equipment: string;
      showCoursePathExport: boolean;
      shareProgressAcrossCourses?: boolean;
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

function mapCourseToTrainingDays(
  firstCourse: CourseWithDayLinks,
  sharedTrainingByDayId: Map<
    string,
    { status: string; steps: { stepOnDayId: string; status: string }[] }
  >,
  _courseId: string,
) {
  const dayStatuses = firstCourse.dayLinks.map((link) => {
    const ut = link.userTrainings[0];
    let statusSource = ut;
    if (!ut && link.day.shareProgressAcrossCourses) {
      const sharedUt = sharedTrainingByDayId.get(link.dayId);
      if (sharedUt) statusSource = sharedUt;
    }

    // Array.find used the first matching row even for duplicate stepOnDayId.
    const statusByStepId = new Map<string, string>();
    for (const step of statusSource?.steps ?? []) {
      if (!statusByStepId.has(step.stepOnDayId)) {
        statusByStepId.set(step.stepOnDayId, step.status);
      }
    }
    const allStepStatuses = link.day.stepLinks.map(
      (stepLink) => statusByStepId.get(stepLink.id) || TrainingStatus.NOT_STARTED,
    );
    return {
      id: link.id,
      type: link.day.type,
      status: statusSource
        ? calculateDayStatusFromStatuses(allStepStatuses)
        : TrainingStatus.NOT_STARTED,
    };
  });

  // Summary excludes EVERY incomplete day with its own link.id, even
  // anomalous duplicates; aggregate once instead of an every per summary.
  const incompleteByLinkId = new Map<string, number>();
  let incompleteTotal = 0;
  for (const dayStatus of dayStatuses) {
    if (dayStatus.status !== TrainingStatus.COMPLETED) {
      incompleteTotal++;
      incompleteByLinkId.set(dayStatus.id, (incompleteByLinkId.get(dayStatus.id) ?? 0) + 1);
    }
  }

  return firstCourse.dayLinks.map((link, index) => {
    const userStatus = dayStatuses[index].status;

    let isLocked = false;
    if (link.day.type === "summary") {
      isLocked = incompleteTotal > (incompleteByLinkId.get(link.id) ?? 0);
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
      showCoursePathExport: link.day.showCoursePathExport ?? false,
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
    showCoursePathExport: boolean;
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
            dayId: true,
            order: true,
            day: {
              select: {
                title: true,
                type: true,
                equipment: true,
                showCoursePathExport: true,
                shareProgressAcrossCourses: true,
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

    const sharedDayIds = (
      firstCourse.dayLinks as { dayId: string; day: { shareProgressAcrossCourses?: boolean } }[]
    )
      .filter((dl) => dl.day?.shareProgressAcrossCourses)
      .map((dl) => dl.dayId);

    const sharedUserTrainings =
      sharedDayIds.length > 0
        ? await prisma.userTraining.findMany({
            where: {
              userId,
              status: TrainingStatus.COMPLETED,
              dayOnCourse: {
                dayId: { in: sharedDayIds },
                courseId: { not: firstCourse.id },
              },
            },
            select: {
              status: true,
              steps: {
                select: {
                  stepOnDayId: true,
                  status: true,
                },
              },
              dayOnCourse: { select: { dayId: true } },
            },
          })
        : [];

    const sharedTrainingByDayId = new Map(
      sharedUserTrainings.map((ut) => [ut.dayOnCourse.dayId, ut]),
    );

    // Проверяем доступ к приватному или платному курсу
    if (firstCourse.isPrivate || firstCourse.isPaid) {
      const hasAccess = await checkCourseAccessById(firstCourse.id, userId);
      if (!hasAccess.hasAccess) {
        throw new Error("COURSE_ACCESS_DENIED");
      }
    }

    const trainingDays = mapCourseToTrainingDays(
      firstCourse as unknown as CourseWithDayLinks,
      sharedTrainingByDayId,
      firstCourse.id,
    );
    const uc = firstCourse.userCourses?.[0];
    const hasPersonalization =
      uc?.userDisplayName != null && String(uc.userDisplayName).trim() !== "";
    const userCoursePersonalization = hasPersonalization
      ? {
          userDisplayName: String(uc!.userDisplayName).trim(),
          userGender: (uc!.userGender === "female" ? "female" : "male") as "male" | "female",
          petName: String(uc!.petName ?? "").trim(),
          petGender: (uc!.petGender === "female" || uc!.petGender === "male"
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
  options?: { createIfMissing?: boolean; allowPaywalledPreview?: boolean },
): Promise<TrainingDetail | null> {
  // Проверяем доступ к курсу
  if (!(await courseAllowsTrainingDetails(courseType, userId))) {
    if (!options?.allowPaywalledPreview) return null;
    const policy = await getCourseRewardedPolicy(courseType);
    if (!policy || policy.isPrivate || !policy.isPaid) return null;
  }
  // Only shared, user-independent content is read here. Access was checked above.
  const found = await getTrainingDayContent(courseType, dayOnCourseId);
  if (!found) return null;

  // Entitlement, progress and personalization are deliberately never part of
  // the shared content read; these queries must stay fresh for every viewer.
  const [userCourse, userTraining] = userId
    ? await Promise.all([
        prisma.userCourse.findUnique({
          where: { userId_courseId: { userId, courseId: found.courseId } },
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
        }),
        prisma.userTraining.findUnique({
          where: { userId_dayOnCourseId: { userId, dayOnCourseId: found.id } },
          select: { id: true, status: true, currentStepIndex: true },
        }),
      ])
    : [null, null];

  const {
    id: foundDayOnCourseId,
    order: physicalOrder,
    courseId,
    course: { duration: courseDuration, isPersonalized },
    day: { id: trainingDayId, title, description, type, stepLinks, showCoursePathExport },
  } = found;

  const hasPersonalization =
    userCourse?.userDisplayName != null && String(userCourse.userDisplayName).trim() !== "";
  const requiresPersonalization = Boolean(isPersonalized) && !hasPersonalization;

  if (requiresPersonalization && !options?.allowPaywalledPreview) {
    throw new Error("PERSONALIZATION_REQUIRED");
  }

  const personalization =
    isPersonalized && hasPersonalization
      ? {
          userDisplayName: String(userCourse!.userDisplayName).trim(),
          userGender: (userCourse!.userGender === "female" ? "female" : "male") as
            | "male"
            | "female",
          petName: String(userCourse!.petName ?? "").trim(),
          petGender: (userCourse!.petGender === "female" || userCourse!.petGender === "male"
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

  let userTrainingId = userTraining?.id;

  if (!userTrainingId && options?.createIfMissing && userId && !options?.allowPaywalledPreview) {
    userTrainingId = await ensureUserTrainingExists(userId, foundDayOnCourseId);
  }

  if (!userTrainingId) {
    type StepLinkItem = (typeof stepLinks)[number];
    const steps = stepLinks.map(({ step, order }: StepLinkItem) => ({
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
      type: step.type as
        | "TRAINING"
        | "EXAMINATION"
        | "THEORY"
        | "BREAK"
        | "PRACTICE"
        | "DIARY"
        | "SURVEY"
        | undefined,
      checklist: step.checklist,
      requiresVideoReport: step.requiresVideoReport,
      requiresWrittenFeedback: step.requiresWrittenFeedback,
      hasTestQuestions: step.hasTestQuestions,
      surveySlug: step.surveySlug,
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
      showCoursePathExport: showCoursePathExport ?? false,
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

  // Explicit read-only GET must never backfill UserStep rows.
  // Omitted createIfMissing preserves the legacy existing-training backfill.
  const existingStepOnDayIds = new Set(userSteps.map((us) => us.stepOnDayId));
  const allStepOnDayIds = stepLinks.map((link: { id: string }) => link.id);
  const missingStepOnDayIds = allStepOnDayIds.filter((id: string) => !existingStepOnDayIds.has(id));

  if (
    missingStepOnDayIds.length > 0 &&
    options?.createIfMissing !== false &&
    !options?.allowPaywalledPreview
  ) {
    try {
      const newUserSteps = await prisma.$transaction(
        async (tx) => {
          const promises = missingStepOnDayIds.map((stepOnDayId: string) =>
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

  type StepLinkItem = (typeof stepLinks)[number];
  const steps = stepLinks.map(({ id: stepOnDayId, step, order }: StepLinkItem) => ({
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
    type: step.type as
      | "TRAINING"
      | "EXAMINATION"
      | "THEORY"
      | "BREAK"
      | "PRACTICE"
      | "DIARY"
      | "SURVEY"
      | undefined,
    checklist: Array.isArray(step.checklist)
      ? (step.checklist as unknown as ChecklistQuestion[])
      : null,
    requiresVideoReport: step.requiresVideoReport,
    requiresWrittenFeedback: step.requiresWrittenFeedback,
    hasTestQuestions: step.hasTestQuestions,
    surveySlug: step.surveySlug,
    userStepId: userStepIds[stepOnDayId],
  }));

  const stepStatusesArr = stepLinks.map(
    (stepLink: StepLinkItem) => stepStatuses[stepLink.id] ?? TrainingStatus.NOT_STARTED,
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
    showCoursePathExport: showCoursePathExport ?? false,
  };
}

export async function resolveCourseStepRewardedTarget(input: {
  userId: string;
  courseType?: string;
  dayOnCourseId: string;
  stepIndex: number;
}): Promise<RewardedTargetInput | null> {
  if (!(await shouldApplyRewardedStepAccess(input.courseType))) {
    throw new Error("COURSE_ACCESS_DENIED");
  }

  const found = await prisma.dayOnCourse.findFirst({
    where: {
      id: input.dayOnCourseId,
      ...(input.courseType ? { course: { type: input.courseType } } : {}),
    },
    select: {
      day: {
        select: {
          stepLinks: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              step: {
                select: {
                  type: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!found?.day) {
    throw new Error("DayOnCourse or day not found");
  }

  const stepLink = found.day.stepLinks[input.stepIndex];
  if (!stepLink?.step) {
    throw new Error("Step not found");
  }

  if (!isRewardedMonetizedStepType(stepLink.step.type)) {
    return null;
  }

  return {
    targetType: "COURSE_STEP",
    targetId: stepLink.id,
  };
}

export async function getTrainingDayWithMonetizedSteps(
  userId: string,
  courseType: string,
  dayOnCourseId: string,
  options: { platform: MonetizedAccessPlatform; createIfMissing?: boolean },
): Promise<TrainingDetail | null> {
  const policy = await getCourseRewardedPolicy(courseType);
  if (!policy) return null;
  const fullAccess = (await checkCourseAccess(courseType, userId)).hasAccess;
  if (policy.isPrivate && !fullAccess) return null;
  const preview = policy.isPaid && !fullAccess;
  const detail = await getTrainingDayWithUserSteps(userId, courseType, dayOnCourseId, {
    createIfMissing: options.createIfMissing && !preview,
    allowPaywalledPreview: preview,
  });
  if (!detail) return null;
  if (fullAccess || !policy.isPaid) {
    return { ...detail, steps: detail.steps.map((step) => ({ ...step, locked: false })) };
  }

  const steps = await Promise.all(
    detail.steps.map(async (step, stepIndex) => {
      const target = isRewardedMonetizedStepType(step.type)
        ? await resolveCourseStepRewardedTarget({ userId, courseType, dayOnCourseId, stepIndex })
        : null;
      // BREAK / DIARY are not monetized steps and remain available.
      if (!target) return { ...step, locked: false };
      if (
        await hasActiveGafusCourseStepAccess({
          userId,
          dayOnCourseId,
          stepOnDayId: target.targetId,
        })
      ) {
        return {
          ...step,
          locked: false,
          monetizationTarget: { targetType: "COURSE_STEP" as const, targetId: target.targetId },
        };
      }
      try {
        await getPremiumOrRewardedAccess({ userId, platform: options.platform, target });
        return {
          ...step,
          locked: false,
          monetizationTarget: { targetType: "COURSE_STEP" as const, targetId: target.targetId },
        };
      } catch (error) {
        if (isSubscriptionOrCreditsRequiredError(error))
          return redactLockedTrainingStep(step, target);
        throw error;
      }
    }),
  );
  return { ...detail, description: "", showCoursePathExport: false, steps };
}

export async function requireCourseStepPremiumOrRewardedUnlock(input: {
  userId: string;
  platform: MonetizedAccessPlatform;
  courseType?: string;
  dayOnCourseId: string;
  stepIndex: number;
}) {
  if (input.courseType) {
    const coursePolicy = await getCourseRewardedPolicy(input.courseType);
    if (coursePolicy?.isPrivate) {
      const accessCheck = await checkCourseAccess(input.courseType, input.userId);
      if (!accessCheck.hasAccess) throw new Error("COURSE_ACCESS_DENIED");
      return null;
    }
    if (coursePolicy && !coursePolicy.isPaid) return null;
    if (coursePolicy?.isPaid && (await checkCourseAccess(input.courseType, input.userId)).hasAccess)
      return null;
  }
  const target = await resolveCourseStepRewardedTarget(input);
  if (!target) return null;
  if (
    await hasActiveGafusCourseStepAccess({
      userId: input.userId,
      dayOnCourseId: input.dayOnCourseId,
      stepOnDayId: target.targetId,
    })
  )
    return null;

  return requirePremiumOrRewardedUnlock({
    userId: input.userId,
    platform: input.platform,
    target,
  });
}

/**
 * Authorizes a mutation of a course step against the course that actually owns
 * the supplied day. `courseId` from an HTTP request is only an assertion and
 * must never determine the entitlement being checked.
 */
export async function requireCourseStepOperationAccess(input: {
  userId: string;
  platform: MonetizedAccessPlatform;
  dayOnCourseId: string;
  stepIndex: number;
  expectedCourseId?: string;
  expectedStepOnDayId?: string;
  expectedStepId?: string;
}): Promise<{ courseId: string; courseType: string }> {
  const dayOnCourse = await prisma.dayOnCourse.findUnique({
    where: { id: input.dayOnCourseId },
    select: {
      course: { select: { id: true, type: true, isPaid: true, isPrivate: true } },
      day: {
        select: {
          stepLinks: {
            orderBy: { order: "asc" },
            select: { id: true, stepId: true, step: { select: { type: true } } },
          },
        },
      },
    },
  });

  if (!dayOnCourse?.day) throw new Error("DayOnCourse or day not found");
  if (input.expectedCourseId && input.expectedCourseId !== dayOnCourse.course.id) {
    throw new Error("COURSE_DAY_MISMATCH");
  }

  const stepLink = input.expectedStepOnDayId
    ? dayOnCourse.day.stepLinks.find((link) => link.id === input.expectedStepOnDayId)
    : dayOnCourse.day.stepLinks[input.stepIndex];
  if (input.expectedStepOnDayId && (!stepLink || stepLink.stepId !== input.expectedStepId)) {
    throw new Error("STALE_STEP_BINDING");
  }
  if (!stepLink) throw new Error("Step not found");

  const access = await checkCourseAccessById(dayOnCourse.course.id, input.userId);
  if (dayOnCourse.course.isPrivate) {
    if (!access.hasAccess) throw new Error("COURSE_ACCESS_DENIED");
  } else if (!access.hasAccess) {
    // BREAK and DIARY are free even inside a paid public course. This
    // includes mutations that record their completion, not only page reads.
    if (!dayOnCourse.course.isPaid) throw new Error("COURSE_ACCESS_DENIED");
    if (stepLink.step.type === "BREAK" || stepLink.step.type === "DIARY") {
      return { courseId: dayOnCourse.course.id, courseType: dayOnCourse.course.type };
    }
    if (!isRewardedMonetizedStepType(stepLink.step.type))
      throw new Error("COURSE_ACCESS_DENIED");
    const target = { targetType: "COURSE_STEP" as const, targetId: stepLink.id };
    const gafus = await hasActiveGafusCourseStepAccess({
      userId: input.userId,
      dayOnCourseId: input.dayOnCourseId,
      stepOnDayId: stepLink.id,
    });
    if (!gafus)
      await requirePremiumOrRewardedUnlock({
        userId: input.userId,
        platform: input.platform,
        target,
      });
  }
  return { courseId: dayOnCourse.course.id, courseType: dayOnCourse.course.type };
}

/** Операция над шагом тренировки (дискриминант по type). */
export type StepOperation =
  | { type: "start"; remainingSec?: number }
  | { type: "pause"; remainingSec: number }
  | { type: "resume" }
  | { type: "reset" }
  | { type: "complete" };

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const THEORY_STEP_TYPES = ["THEORY", "DIARY"] as const;

/**
 * Валидирует, что шаг по индексу — THEORY или DIARY (для step/complete/theory).
 */
export async function validateTheoryStepForCompletion(
  dayOnCourseId: string,
  stepIndex: number,
  binding?: { expectedStepOnDayId: string; expectedStepId: string },
): Promise<{ valid: boolean; error?: string; code?: string }> {
  const dayOnCourse = await prisma.dayOnCourse.findUnique({
    where: { id: dayOnCourseId },
    include: {
      day: {
        include: {
          stepLinks: {
            orderBy: { order: "asc" },
            include: { step: true },
          },
        },
      },
    },
  });

  if (!dayOnCourse?.day) {
    return { valid: false, error: "День не найден", code: "NOT_FOUND" };
  }

  const stepLink = binding
    ? dayOnCourse.day.stepLinks.find((link) => link.id === binding.expectedStepOnDayId)
    : dayOnCourse.day.stepLinks[stepIndex];
  if (binding && (!stepLink || stepLink.stepId !== binding.expectedStepId)) {
    return { valid: false, error: "Состав дня изменился", code: "STALE_STEP_BINDING" };
  }
  if (!stepLink?.step) {
    return { valid: false, error: "Шаг не найден", code: "NOT_FOUND" };
  }

  if (!THEORY_STEP_TYPES.includes(stepLink.step.type as (typeof THEORY_STEP_TYPES)[number])) {
    return {
      valid: false,
      error: "Шаг не является теоретическим или дневником",
      code: "INVALID_STEP_TYPE",
    };
  }

  return { valid: true };
}

/**
 * Возвращает тип курса по dayOnCourseId (для URL в push-уведомлениях).
 */
export async function getCourseTypeByDayOnCourseId(dayOnCourseId: string): Promise<string | null> {
  const dayOnCourse = await prisma.dayOnCourse.findUnique({
    where: { id: dayOnCourseId },
    select: { course: { select: { type: true } } },
  });
  return dayOnCourse?.course?.type ?? null;
}

/**
 * Возвращает информацию о шаге по индексу дня.
 */
export async function getStepInfoByIndex(
  dayOnCourseId: string,
  stepIndex: number,
): Promise<{ stepTitle: string; stepOrder: number; stepType: string } | null> {
  const dayOnCourse = await prisma.dayOnCourse.findUnique({
    where: { id: dayOnCourseId },
    include: {
      day: {
        include: {
          stepLinks: {
            orderBy: { order: "asc" },
            include: { step: true },
          },
        },
      },
    },
  });
  const stepLink = dayOnCourse?.day?.stepLinks[stepIndex];
  if (!stepLink?.step) return null;
  return {
    stepTitle: stepLink.step.title ?? "",
    stepOrder: stepLink.order,
    stepType: stepLink.step.type,
  };
}

/**
 * Валидирует тип шага и возвращает stepTitle/stepOrder (для mark*Completed).
 */
export async function validateStepTypeAndGetInfo(
  dayOnCourseId: string,
  stepIndex: number,
  allowedTypes: string[],
): Promise<{
  valid: boolean;
  error?: string;
  stepTitle?: string;
  stepOrder?: number;
}> {
  const info = await getStepInfoByIndex(dayOnCourseId, stepIndex);
  if (!info) {
    return { valid: false, error: "Шаг не найден" };
  }
  if (!allowedTypes.includes(info.stepType)) {
    return {
      valid: false,
      error: `Шаг не соответствует типу. Ожидалось: ${allowedTypes.join(", ")}. Текущий: ${info.stepType}`,
      stepTitle: info.stepTitle,
      stepOrder: info.stepOrder,
    };
  }
  return {
    valid: true,
    stepTitle: info.stepTitle,
    stepOrder: info.stepOrder,
  };
}

/**
 * Проверяет доступ пользователя к дню курса.
 * Для дня типа "summary" требует завершения всех остальных дней курса.
 */
export async function checkDayAccess(
  userId: string,
  dayOnCourseId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const dayOnCourse = await prisma.dayOnCourse.findUnique({
    where: { id: dayOnCourseId },
    select: {
      id: true,
      courseId: true,
      day: {
        select: {
          type: true,
          stepLinks: { select: { id: true } },
        },
      },
    },
  });

  if (!dayOnCourse) {
    return { allowed: false, reason: "День не найден" };
  }

  if (dayOnCourse.day.type !== "summary") {
    return { allowed: true };
  }

  const allDays = await prisma.dayOnCourse.findMany({
    where: { courseId: dayOnCourse.courseId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      day: {
        select: {
          type: true,
          stepLinks: { select: { id: true } },
        },
      },
    },
  });

  const userTrainings = await prisma.userTraining.findMany({
    where: {
      userId,
      dayOnCourseId: { in: allDays.map((d) => d.id) },
    },
    select: {
      dayOnCourseId: true,
      steps: { select: { stepOnDayId: true, status: true } },
    },
  });

  const userTrainingMap = new Map(userTrainings.map((ut) => [ut.dayOnCourseId, ut.steps]));

  for (const day of allDays) {
    if (day.id === dayOnCourseId) continue;
    const userSteps = userTrainingMap.get(day.id) || [];
    const stepStatuses: string[] = day.day.stepLinks.map((sl) => {
      const us = userSteps.find((s) => s.stepOnDayId === sl.id);
      return us?.status ?? TrainingStatus.NOT_STARTED;
    });
    const dayStatus = calculateDayStatusFromStatuses(stepStatuses);
    if (dayStatus !== TrainingStatus.COMPLETED) {
      return { allowed: false, reason: "Необходимо завершить все остальные дни курса" };
    }
  }
  return { allowed: true };
}

/**
 * Обновляет шаг и пересчитывает статус дня в одной транзакции.
 * Логика перенесена из web (updateUserStepStatus); API (mobile) подстраивается под неё.
 *
 * @returns courseId и allCompleted для последующего syncUserCourseStatusFromDays / checkAndCompleteCourse
 * @throws Error "DayOnCourse or day not found" | "Step not found" | "INVALID_STATE: ..."
 */
export type StepOccurrenceBinding = {
  expectedStepOnDayId: string;
  expectedStepId: string;
  expectedCourseId: string;
};

export async function updateStepAndDay(
  userId: string,
  dayOnCourseId: string,
  stepIndex: number,
  operation: StepOperation,
  binding?: StepOccurrenceBinding,
): Promise<{
  courseId: string;
  allCompleted: boolean;
  stepJustCompleted: boolean;
  stepJustStarted: boolean;
  stepOnDayId: string;
  stepId: string;
}> {
  return prisma.$transaction(
    (tx: Tx) => applyStepAndDayTx(tx, userId, dayOnCourseId, stepIndex, operation, binding),
    { timeout: 10000 },
  );
}

/** Transaction-aware mutation for new-only OFF021; legacy wrapper unchanged. */
export async function applyStepAndDayTx(
  tx: Tx,
  userId: string,
  dayOnCourseId: string,
  stepIndex: number,
  operation: StepOperation,
  binding?: StepOccurrenceBinding,
): Promise<{
  courseId: string;
  allCompleted: boolean;
  stepJustCompleted: boolean;
  stepJustStarted: boolean;
  stepOnDayId: string;
  stepId: string;
}> {
  // Serialize concurrent opted-in mutations by the SAME authenticated actor
  // BEFORE reading shared day/occurrence or upserting UserTraining/UserStep.
  // PostgreSQL's NO KEY UPDATE lock conflicts with another such actor lock,
  // but remains compatible with child FK KEY SHARE; it does not lock other
  // learners or course authors. Without it two real HTTP starts can race on
  // UserTraining(userId,dayOnCourseId) and leak Prisma P2002 as HTTP 500.
  // Unbound/legacy Native semantics are deliberately unchanged.
  if (binding) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
  }
  // Only the opt-in Web protocol locks the actual day and occurrence inside
  // this transaction. Legacy Native/index callers retain their exact path.
  // FOR SHARE conflicts with trainer UPDATE/DELETE/MOVE of this occurrence.
  if (binding) {
    const dayRows = await tx.$queryRaw<{ dayId: string; courseId: string }[]>`
      SELECT "dayId", "courseId" FROM "DayOnCourse"
      WHERE "id" = ${dayOnCourseId} FOR SHARE
    `;
    if (dayRows.length !== 1 || dayRows[0].courseId !== binding.expectedCourseId) {
      throw new Error("STALE_STEP_BINDING");
    }
    const occurrenceRows = await tx.$queryRaw<{ dayId: string; stepId: string }[]>`
      SELECT "dayId", "stepId" FROM "StepOnDay"
      WHERE "id" = ${binding.expectedStepOnDayId} FOR SHARE
    `;
    if (
      occurrenceRows.length !== 1 ||
      occurrenceRows[0].dayId !== dayRows[0].dayId ||
      occurrenceRows[0].stepId !== binding.expectedStepId
    ) {
      throw new Error("STALE_STEP_BINDING");
    }
  }
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
  const stepLink = binding
    ? stepLinks.find((link) => link.id === binding.expectedStepOnDayId)
    : stepLinks[stepIndex];

  if (binding && (!stepLink || stepLink.stepId !== binding.expectedStepId)) {
    throw new Error("STALE_STEP_BINDING");
  }
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
    select: { id: true, status: true, paused: true },
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
  let stepJustStarted = false;

  switch (operation.type) {
    case "start": {
      const remainingSec = operation.remainingSec ?? 0;
      if (binding && existingStep?.status === TrainingStatus.IN_PROGRESS) {
        // A retried bound start must not reset the original running countdown.
        if (existingStep.paused) throw new Error("INVALID_STATE: use resume for paused step");
      } else if (existingStep) {
        const result = await tx.userStep.updateMany({
          where: {
            id: existingStep.id,
            status: {
              in: binding
                ? [TrainingStatus.NOT_STARTED, TrainingStatus.RESET]
                : [TrainingStatus.NOT_STARTED, TrainingStatus.RESET, TrainingStatus.IN_PROGRESS],
            },
          },
          data: {
            status: TrainingStatus.IN_PROGRESS,
            paused: false,
            remainingSec,
            updatedAt: new Date(),
          },
        });
        stepJustStarted = result.count > 0;
        if (result.count === 0) {
          // A second concurrent start may have just won the transition.
          const latest = binding
            ? await tx.userStep.findUnique({
                where: { id: existingStep.id },
                select: { status: true, paused: true },
              })
            : null;
          if (latest?.status !== TrainingStatus.IN_PROGRESS || latest.paused)
            throw new Error("INVALID_STATE: cannot start completed");
        }
      } else {
        try {
          await tx.userStep.create({
            data: {
              userTrainingId: userTraining.id,
              stepOnDayId,
              status: TrainingStatus.IN_PROGRESS,
              paused: false,
              remainingSec,
            },
          });
          stepJustStarted = true;
        } catch (error) {
          if (!isPrismaUniqueConstraintError(error)) throw error;
          const result = await tx.userStep.updateMany({
            where: {
              userTrainingId: userTraining.id,
              stepOnDayId,
              status: {
                in: [TrainingStatus.NOT_STARTED, TrainingStatus.RESET, TrainingStatus.IN_PROGRESS],
              },
            },
            data: { status: TrainingStatus.IN_PROGRESS, paused: false, remainingSec,
              updatedAt: new Date() },
          });
          if (result.count === 0) throw new Error("INVALID_STATE: cannot start completed");
          stepJustStarted = true;
        }
      }
      break;
    }
    case "pause": {
      const result = await tx.userStep.updateMany({
        where: { id: existingStep!.id, status: TrainingStatus.IN_PROGRESS, paused: false },
        data: { paused: true, remainingSec: operation.remainingSec,
          updatedAt: new Date() },
      });
      if (result.count === 0) throw new Error("INVALID_STATE: cannot pause step");
      break;
    }
    case "resume": {
      const result = await tx.userStep.updateMany({
        where: { id: existingStep!.id, status: TrainingStatus.IN_PROGRESS, paused: true },
        data: { paused: false, updatedAt: new Date() },
      });
      if (result.count === 0) throw new Error("INVALID_STATE: cannot resume step");
      break;
    }
    case "reset": {
      const result = await tx.userStep.updateMany({
        where: {
          id: existingStep!.id,
          status: { in: [TrainingStatus.IN_PROGRESS, TrainingStatus.COMPLETED] },
        },
        data: { status: TrainingStatus.RESET, paused: false, remainingSec: null,
          updatedAt: new Date() },
      });
      if (result.count === 0) throw new Error("INVALID_STATE: cannot reset step");
      break;
    }
    case "complete":
      if (existingStep) {
        const result = await tx.userStep.updateMany({
          where: {
            id: existingStep.id,
            status: { not: TrainingStatus.COMPLETED },
          },
          data: { status: TrainingStatus.COMPLETED, paused: false, remainingSec: null,
            updatedAt: new Date() },
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
              data: { status: TrainingStatus.COMPLETED, paused: false, remainingSec: null,
            updatedAt: new Date() },
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
  for (const stepOnDayId of stepOnDayIds) {
    const us = userSteps.find((s) => s.stepOnDayId === stepOnDayId);
    allStepStatuses.push(us?.status ?? TrainingStatus.NOT_STARTED);
  }

  const correctedDayStatus = calculateDayStatusFromStatuses(allStepStatuses);
  const allCompleted = correctedDayStatus === TrainingStatus.COMPLETED;

  const firstNotCompletedIndex = allStepStatuses.findIndex(
    (status) => status !== TrainingStatus.COMPLETED,
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

  // Bound NORMAL step notification = durable transactional enqueue intent.
  // The SQL row commits atomically with the first UserStep transition, BEFORE
  // the Hono handler attempts BullMQ (and survives a process crash there).
  // Do not create any notification for Daily / legacy Native / duplicate start
  // / users without an actual persisted push subscription.
  if (binding && operation.type === "start" && stepJustStarted) {
    const subscriptions = await tx.pushSubscription.findMany({
      where: { userId }, select: { endpoint: true, keys: true },
    });
    if (subscriptions.length > 0) {
      const existing = await tx.stepNotification.findFirst({
        where: { userId, dayOnCourseId, stepOnDayId, type: "step", sent: false },
        select: { id: true },
      });
      if (!existing) {
        const seconds = Math.max(0, Math.floor(operation.remainingSec ?? 0));
        const notificationCourse = await tx.course.findUnique({
          where: { id: dayOnCourse.courseId }, select: { type: true },
        });
        if (!notificationCourse) throw new Error("STALE_STEP_BINDING");
        await tx.stepNotification.create({
          data: {
            userId,
            day: dayOnCourse.order ?? 0,
            stepIndex: stepLinks.findIndex((link) => link.id === stepOnDayId),
            dayOnCourseId,
            stepOnDayId,
            originalStepId: stepLink.stepId,
            endTs: Math.floor(Date.now() / 1000) + seconds,
            stepTitle: stepLink.step.title || null,
            url: `/trainings/${notificationCourse.type}/${dayOnCourseId}`,
            type: "step",
            subscription: {
              subscriptions: subscriptions.map((sub) => ({
                endpoint: sub.endpoint, keys: sub.keys ?? {},
              })),
              count: subscriptions.length,
            },
          },
          select: { id: true },
        });
      }
    }
  }

  return {
    courseId: dayOnCourse.courseId,
    allCompleted,
    stepJustCompleted,
    stepJustStarted,
    stepOnDayId,
    stepId: stepLink.stepId,
  };
}

/**
 * Пересчитывает статус курса по статусам дней (UserTraining) и обновляет UserCourse.
 * Вызывать после любого обновления шага/дня (в т.ч. RESET).
 */
export async function syncUserCourseStatusFromDays(
  userId: string,
  courseId: string,
): Promise<void> {
  return syncUserCourseStatusFromDaysTx(prisma, userId, courseId);
}

/** Same SQL transaction course reconciliation for new-only OFF021. */
export async function syncUserCourseStatusFromDaysTx(
  tx: Pick<Tx, "dayOnCourse" | "userTraining" | "userCourse">,
  userId: string,
  courseId: string,
): Promise<void> {
  const days = await tx.dayOnCourse.findMany({
    where: { courseId },
    select: { id: true },
    orderBy: { order: "asc" },
  });
  if (days.length === 0) return;

  const userTrainings = await tx.userTraining.findMany({
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

  const existing = await tx.userCourse.findUnique({
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

  await tx.userCourse.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: {
      ...updateData,
      status: updateData.status as PrismaTrainingStatus,
    },
    create: {
      userId,
      courseId,
      status: newStatus as PrismaTrainingStatus,
      startedAt: updateData.startedAt ?? null,
      completedAt: updateData.completedAt ?? null,
    },
  });
}
