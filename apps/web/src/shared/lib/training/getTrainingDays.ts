"use server";

import { unstable_cache } from "next/cache";
import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";

import { calculateDayStatusFromStatuses } from "@gafus/types";

import type { TrainingDetail } from "@gafus/types";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { optionalTrainingTypeSchema, optionalUserIdSchema } from "../validation/schemas";
import { checkCourseAccessById } from "@gafus/core/services/course";

// Создаем логгер для getTrainingDays
const logger = createWebLogger("web-get-training-days");

import { NON_NUMBERED_DAY_TYPES } from "./dayTypes";

type CourseWithDayLinks = {
  id: string;
  description: string | null;
  videoUrl: string | null;
  equipment: string | null;
  trainingLevel: string | null;
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
 * @param dayLinks - Массив всех дней курса
 * @param currentIndex - Индекс текущего дня в массиве
 * @returns Пересчитанный номер дня (начиная с 1) или null для не-тренировочных дней
 */
function calculateDisplayDayNumber(
  dayLinks: CourseWithDayLinks["dayLinks"],
  currentIndex: number,
): number | null {
  const currentDay = dayLinks[currentIndex];

  // Если текущий день - не-тренировочный тип, возвращаем null
  if (
    NON_NUMBERED_DAY_TYPES.includes(currentDay.day.type as (typeof NON_NUMBERED_DAY_TYPES)[number])
  ) {
    return null;
  }

  // Подсчитываем количество дней до текущего, исключая не-тренировочные типы
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
  // Предварительно вычисляем статусы всех дней для проверки блокировки summary
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

  return firstCourse.dayLinks.map(
    (
      link: {
        id: string;
        order: number;
        day: CourseWithDayLinks["dayLinks"][number]["day"];
        userTrainings: {
          status: string;
          steps: { stepOnDayId: string; status: string }[];
        }[];
      },
      index: number,
    ) => {
      // Пересчитываем номер дня, исключая "instructions"
      const displayDay = calculateDisplayDayNumber(firstCourse.dayLinks, index);
      const ut = link.userTrainings[0];

      // Создаем массив статусов для ВСЕХ шагов дня, заполняя недостающие как NOT_STARTED
      const allStepStatuses: string[] = [];
      for (const stepLink of link.day.stepLinks) {
        const userStep = ut?.steps?.find(
          (s: { stepOnDayId: string }) => s.stepOnDayId === stepLink.id,
        );
        allStepStatuses.push(userStep?.status || TrainingStatus.NOT_STARTED);
      }

      const computed = calculateDayStatusFromStatuses(allStepStatuses);
      const userStatus = ut ? computed : TrainingStatus.NOT_STARTED;

      // Проверяем блокировку для дня типа summary
      let isLocked = false;
      if (link.day.type === "summary") {
        // Проверяем, что все остальные дни (кроме summary) завершены
        const allOtherDaysCompleted = dayStatuses.every((dayStatus) => {
          if (dayStatus.id === link.id) {
            return true; // Пропускаем сам summary день
          }
          return dayStatus.status === TrainingStatus.COMPLETED;
        });
        isLocked = !allOtherDaysCompleted;
      }

      // Время дня для бейджа: учитываем ТОЛЬКО тренировочные шаги (таймеры)
      let trainingSeconds = 0;
      let theoryExamSeconds = 0;

      for (const sl of link.day.stepLinks) {
        const step = sl.step;
        if (step.type === "TRAINING") {
          trainingSeconds += step.durationSec ?? 0;
        } else if (step.type === "PRACTICE") {
          // PRACTICE учитывается в trainingSeconds через estimatedDurationSec
          trainingSeconds += step.estimatedDurationSec ?? 0;
        } else if (step.type === "BREAK") {
          // BREAK не учитывается в расчётах времени
          continue;
        } else if (step.type === "DIARY") {
          // DIARY не учитывается в расчётах времени
          continue;
        } else {
          // Все нетренировочные шаги считаем теорией/экзаменом
          theoryExamSeconds += step.estimatedDurationSec ?? 0;
        }
      }

      const estimatedDuration = Math.ceil(trainingSeconds / 60);
      const theoryMinutes = Math.ceil(theoryExamSeconds / 60);

      logger.info("getTrainingDays: day time debug", {
        operation: "get_training_days_time_debug",
        courseId: firstCourse.id,
        dayOrder: link.order,
        dayTitle: link.day.title,
        trainingSeconds,
        theoryExamSeconds,
        estimatedDuration,
        theoryMinutes,
      });

      return {
        trainingDayId: link.id,
        dayOnCourseId: link.id, // Используем ID дня в курсе
        title: link.day.title,
        type: link.day.type,
        courseId: firstCourse.id,
        userStatus,
        estimatedDuration,
        theoryMinutes,
        equipment: link.day.equipment || "",
        isLocked,
      };
    },
  );
}

export async function getTrainingDays(
  typeParam?: string,
  userId?: string,
): Promise<{
  trainingDays: (Pick<
    TrainingDetail,
    "trainingDayId" | "title" | "type" | "courseId" | "userStatus"
  > & {
    dayOnCourseId: string;
    estimatedDuration: number;
    theoryMinutes: number;
    equipment: string;
    isLocked: boolean;
  })[];
  courseDescription: string | null;
  courseId: string | null;
  courseVideoUrl: string | null;
  courseEquipment: string | null;
  courseTrainingLevel: string | null;
  courseIsPersonalized: boolean;
  userCoursePersonalization: import("@gafus/types").UserCoursePersonalization | null;
}> {
  try {
    // Если userId не передан, получаем его
    const safeUserId = optionalUserIdSchema.parse(userId);
    const currentUserId = safeUserId ?? (await getCurrentUserId());
    const safeType = optionalTrainingTypeSchema.parse(typeParam);

    if (!currentUserId) {
      logger.error(
        "getTrainingDays: userId is null or undefined",
        new Error("User not authenticated"),
        {
          operation: "get_training_days_user_not_authenticated",
        },
      );
      throw new Error("Пользователь не авторизован");
    }

    logger.info("getTrainingDays: userId and typeParam", {
      operation: "get_training_days_params",
      userId: currentUserId,
      typeParam: safeType,
    });

    // Оборачиваем в unstable_cache для корректной инвалидации через теги
    const cachedFunction = unstable_cache(
      async () => {
        const courseWhere = safeType ? { type: safeType } : {};

    const firstCourse = await prisma.course.findFirst({
      where: courseWhere,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        description: true,
        videoUrl: true,
        equipment: true,
        trainingLevel: true,
        isPrivate: true,
        isPaid: true,
        isPersonalized: true,
        userCourses: {
          where: { userId: currentUserId },
          take: 1,
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
                equipment: true, // Добавляем equipment
                stepLinks: {
                  select: {
                    id: true,
                    order: true,
                    step: {
                      // estimatedDurationSec ещё не проброшен в Prisma-типы,
                      // поэтому используем any только в select
                      select: {
                        durationSec: true,
                        estimatedDurationSec: true,
                        type: true,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      } as any,
                    },
                  },
                },
              },
            },
            userTrainings: {
              where: { userId: currentUserId },
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
      const hasAccess = await checkCourseAccessById(firstCourse.id, currentUserId);
      if (!hasAccess.hasAccess) {
        logger.warn("Попытка доступа к курсу без разрешения", {
          operation: "get_training_days_access_denied",
          courseId: firstCourse.id,
          userId: currentUserId,
        });
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
      },
      ["training-days", currentUserId, safeType ?? "all"],
      {
        revalidate: 300, // 5 минут - баланс между актуальностью и производительностью
        tags: ["training", "days", `user-${currentUserId}`],
      },
    );

    return await cachedFunction();
  } catch (error) {
    logger.error("Ошибка в getTrainingDays", error as Error, {
      operation: "get_training_days_error",
    });
    // Пробрасываем специфичную ошибку доступа
    if (error instanceof Error && error.message === "COURSE_ACCESS_DENIED") {
      throw error;
    }
    throw new Error("Не удалось загрузить Тренировки");
  }
}
