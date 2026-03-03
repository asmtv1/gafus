/**
 * User Progress Service — централизованная логика получения прогресса пользователя по курсу.
 * Перенесено из web getUserProgress для соблюдения архитектуры (core = бизнес-логика).
 */

import { prisma, TrainingStatus as PrismaTrainingStatus } from "@gafus/prisma";
import { TrainingStatus, calculateDayStatusFromStatuses } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("core-user-progress");

export interface UserDayProgress {
  dayOrder: number;
  dayTitle: string;
  status: TrainingStatus;
  dayCompletedAt: Date | null;
  steps: {
    stepOrder: number;
    stepTitle: string;
    status: TrainingStatus;
    startedAt: Date | null;
    completedAt: Date | null;
  }[];
}

export interface UserDetailedProgress {
  userId: string;
  username: string;
  avatarUrl: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  days: UserDayProgress[];
}

/**
 * Получает детальный прогресс пользователя по курсу.
 * Синхронизирует статус UserCourse с реальным прогрессом (если !readOnly).
 */
export async function getDetailedUserProgress(
  userId: string,
  courseId: string,
  options?: { readOnly?: boolean },
): Promise<UserDetailedProgress | null> {
  const readOnly = options?.readOnly ?? false;
  try {
    const userProgress = await prisma.userCourse.findFirst({
      where: { courseId, userId },
      include: {
        user: {
          select: {
            username: true,
            profile: { select: { avatarUrl: true } },
          },
        },
      },
    });

    const courseDays = await prisma.dayOnCourse.findMany({
      where: { courseId },
      orderBy: { order: "asc" },
      include: {
        day: {
          select: {
            title: true,
            shareProgressAcrossCourses: true,
            stepLinks: {
              orderBy: { order: "asc" },
              include: { step: { select: { title: true } } },
            },
          },
        },
      },
    });
    const totalDaysInCourse = courseDays.length;

    const sharedDayIds = courseDays
      .filter((dl) => dl.day.shareProgressAcrossCourses)
      .map((dl) => dl.dayId);

    const sharedUserTrainings =
      sharedDayIds.length > 0
        ? await prisma.userTraining.findMany({
            where: {
              userId,
              status: TrainingStatus.COMPLETED,
              dayOnCourse: { dayId: { in: sharedDayIds } },
            },
            select: {
              status: true,
              updatedAt: true,
              steps: {
                select: {
                  stepOnDayId: true,
                  status: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
              dayOnCourse: { select: { dayId: true } },
            },
          })
        : [];

    const sharedTrainingByDayId = new Map(
      sharedUserTrainings.map((ut) => [ut.dayOnCourse.dayId, ut]),
    );

    let userInfo: { username: string; avatarUrl: string | null } | null = null;
    let startedAt: Date | null = null;
    let completedAt: Date | null = null;

    if (userProgress) {
      userInfo = {
        username: userProgress.user.username,
        avatarUrl: userProgress.user.profile?.avatarUrl ?? null,
      };
      startedAt = userProgress.startedAt;
      completedAt = userProgress.completedAt;

      const userTrainings = await prisma.userTraining.findMany({
        where: {
          userId,
          dayOnCourse: { courseId },
        },
        select: { id: true, status: true, dayOnCourseId: true },
      });

      const userTrainingIds = userTrainings.map((t) => t.id);

      const userSteps =
        userTrainingIds.length > 0
          ? await prisma.userStep.findMany({
              where: {
                userTrainingId: { in: userTrainingIds },
                status: {
                  in: [TrainingStatus.IN_PROGRESS, TrainingStatus.COMPLETED],
                },
              },
              select: { id: true, createdAt: true },
              orderBy: { createdAt: "asc" },
            })
          : [];

      const hasRealProgress = userSteps.length > 0;

      const updateCourseStatus = async (
        newStatus: TrainingStatus,
        newStartedAt: Date | null,
        newCompletedAt: Date | null = null,
      ): Promise<void> => {
        try {
          const updateData: {
            status: TrainingStatus;
            startedAt: Date | null;
            completedAt?: Date | null;
          } = { status: newStatus, startedAt: newStartedAt };
          if (newCompletedAt !== null) updateData.completedAt = newCompletedAt;

          await prisma.userCourse.update({
            where: {
              userId_courseId: { userId, courseId },
            },
            data: {
              ...updateData,
              status: updateData.status as PrismaTrainingStatus,
            },
          });
        } catch (err) {
          logger.error(
            `Failed to sync course status (${newStatus})`,
            err as Error,
            { operation: "sync_course_status_error", courseId, userId },
          );
        }
      };

      if (!readOnly) {
        if (userTrainings.length > 0) {
          const userTrainingCount = userTrainings.length;
          const completedDays = userTrainings.filter(
            (t) => t.status === TrainingStatus.COMPLETED,
          ).length;

          let virtualCompleted = 0;
          let virtualTrainingCount = 0;
          for (const dayLink of courseDays) {
            if (
              dayLink.day.shareProgressAcrossCourses &&
              !userTrainings.find((ut) => ut.dayOnCourseId === dayLink.id)
            ) {
              const sharedUt = sharedTrainingByDayId.get(dayLink.dayId);
              if (sharedUt?.status === TrainingStatus.COMPLETED) {
                virtualCompleted += 1;
                virtualTrainingCount += 1;
              }
            }
          }
          const effectiveTrainingCount = userTrainingCount + virtualTrainingCount;
          const effectiveCompletedDays = completedDays + virtualCompleted;

          if (
            effectiveTrainingCount === totalDaysInCourse &&
            effectiveCompletedDays === totalDaysInCourse &&
            totalDaysInCourse > 0 &&
            userProgress.status !== TrainingStatus.COMPLETED
          ) {
            completedAt = userProgress.completedAt ?? new Date();
            await updateCourseStatus(TrainingStatus.COMPLETED, startedAt, completedAt);
          } else if (
            userProgress.status === TrainingStatus.NOT_STARTED &&
            hasRealProgress
          ) {
            startedAt = userSteps[0]?.createdAt ?? new Date();
            await updateCourseStatus(TrainingStatus.IN_PROGRESS, startedAt);
          } else if (
            userProgress.status === TrainingStatus.IN_PROGRESS &&
            !hasRealProgress
          ) {
            startedAt = null;
            await updateCourseStatus(TrainingStatus.NOT_STARTED, null);
          } else if (
            userProgress.status === TrainingStatus.NOT_STARTED &&
            userProgress.startedAt &&
            !hasRealProgress
          ) {
            startedAt = null;
            await updateCourseStatus(TrainingStatus.NOT_STARTED, null);
          }
        } else {
          if (
            userProgress.status === TrainingStatus.IN_PROGRESS ||
            userProgress.startedAt
          ) {
            startedAt = null;
            await updateCourseStatus(TrainingStatus.NOT_STARTED, null);
          }
        }
      } else {
        if (userTrainings.length > 0) {
          const userTrainingCount = userTrainings.length;
          const completedDays = userTrainings.filter(
            (t) => t.status === TrainingStatus.COMPLETED,
          ).length;

          let virtualCompletedRO = 0;
          let virtualTrainingCountRO = 0;
          for (const dayLink of courseDays) {
            if (
              dayLink.day.shareProgressAcrossCourses &&
              !userTrainings.find((ut) => ut.dayOnCourseId === dayLink.id)
            ) {
              const sharedUt = sharedTrainingByDayId.get(dayLink.dayId);
              if (sharedUt?.status === TrainingStatus.COMPLETED) {
                virtualCompletedRO += 1;
                virtualTrainingCountRO += 1;
              }
            }
          }
          const effectiveTrainingCountRO = userTrainingCount + virtualTrainingCountRO;
          const effectiveCompletedDaysRO = completedDays + virtualCompletedRO;

          if (
            effectiveTrainingCountRO === totalDaysInCourse &&
            effectiveCompletedDaysRO === totalDaysInCourse &&
            totalDaysInCourse > 0
          ) {
            completedAt = userProgress.completedAt ?? null;
          } else if (hasRealProgress) {
            startedAt = userSteps[0]?.createdAt ?? userProgress.startedAt ?? null;
          } else {
            startedAt = null;
          }
        } else {
          startedAt = null;
        }
      }
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          username: true,
          profile: { select: { avatarUrl: true } },
        },
      });

      if (!user) return null;

      userInfo = {
        username: user.username,
        avatarUrl: user.profile?.avatarUrl ?? null,
      };

      const userTrainings = await prisma.userTraining.findMany({
        where: {
          userId,
          dayOnCourse: { courseId },
        },
        select: { createdAt: true, updatedAt: true, status: true },
        orderBy: { createdAt: "asc" },
      });

      if (userTrainings.length > 0) {
        startedAt = userTrainings[0].createdAt;
      }
    }

    if (!userInfo) return null;

    const userTrainingsForDays = await prisma.userTraining.findMany({
      where: {
        userId,
        dayOnCourse: { courseId },
      },
      include: {
        steps: { include: { stepOnDay: true } },
      },
    });

    const userTrainingMap = new Map<
      string,
      {
        dayOnCourseId: string;
        status: string;
        steps: { stepOnDayId: string; status: string; createdAt: Date; updatedAt: Date }[];
      }
    >(
      userTrainingsForDays.map((ut) => [
        ut.dayOnCourseId,
        {
          dayOnCourseId: ut.dayOnCourseId,
          status: ut.status,
          steps: ut.steps.map((s) => ({
            stepOnDayId: s.stepOnDayId,
            status: s.status,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          })),
        },
      ]),
    );

    for (const dayLink of courseDays) {
      if (dayLink.day.shareProgressAcrossCourses && !userTrainingMap.has(dayLink.id)) {
        const sharedUt = sharedTrainingByDayId.get(dayLink.dayId);
        if (sharedUt) {
          userTrainingMap.set(dayLink.id, {
            dayOnCourseId: dayLink.id,
            status: sharedUt.status,
            steps: sharedUt.steps.map((s) => ({
              stepOnDayId: s.stepOnDayId,
              status: s.status,
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
            })),
          });
        }
      }
    }

    const daysProgress = courseDays.map((dayLink) => {
      const userTraining = userTrainingMap.get(dayLink.id);

      const dayStatus = (() => {
        if (!userTraining) return TrainingStatus.NOT_STARTED;
        const allStepStatuses: string[] = [];
        for (const stepLink of dayLink.day.stepLinks) {
          const userStep = (userTraining.steps || []).find(
            (s) => s.stepOnDayId === stepLink.id,
          );
          allStepStatuses.push(userStep?.status ?? TrainingStatus.NOT_STARTED);
        }
        return calculateDayStatusFromStatuses(allStepStatuses);
      })();

      const stepsProgress = dayLink.day.stepLinks.map((stepLink) => {
        let stepStatus = TrainingStatus.NOT_STARTED;
        let stepStartedAt: Date | null = null;
        let stepCompletedAt: Date | null = null;

        if (userTraining?.steps) {
          const userStep = userTraining.steps.find((step) => step.stepOnDayId === stepLink.id);
          if (userStep) {
            const currentStatus = userStep.status as TrainingStatus;
            stepStatus = currentStatus;
            if (currentStatus === TrainingStatus.IN_PROGRESS) {
              stepStartedAt = userStep.createdAt;
            }
            stepCompletedAt =
              currentStatus === TrainingStatus.COMPLETED ? userStep.updatedAt : null;
          }
        }

        return {
          stepOrder: stepLink.order,
          stepTitle: stepLink.step.title,
          status: stepStatus,
          startedAt: stepStartedAt,
          completedAt: stepCompletedAt,
        };
      });

      let dayCompletedAt: Date | null = null;
      if (
        dayStatus === TrainingStatus.COMPLETED &&
        userTraining?.steps
      ) {
        const completedDates = userTraining.steps
          .filter((s) => (s.status as TrainingStatus) === TrainingStatus.COMPLETED)
          .map((s) => s.updatedAt)
          .filter(Boolean) as Date[];
        if (completedDates.length) {
          dayCompletedAt = new Date(Math.max(...completedDates.map((d) => d.getTime())));
        }
      }

      return {
        dayOrder: dayLink.order,
        dayTitle: dayLink.day.title,
        status: dayStatus,
        dayCompletedAt,
        steps: stepsProgress,
      };
    });

    return {
      userId,
      username: userInfo.username,
      avatarUrl: userInfo.avatarUrl,
      startedAt,
      completedAt,
      days: daysProgress,
    };
  } catch (error) {
    logger.error("Ошибка при получении прогресса пользователя", error as Error, {
      operation: "get_user_progress_error",
      courseId,
      userId,
    });
    return null;
  }
}
