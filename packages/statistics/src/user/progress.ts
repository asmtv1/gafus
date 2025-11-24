import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { z } from "zod";

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

const userCourseProgressSchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
  userId: z.string().min(1, "userId обязателен"),
});

function calculateDayStatusFromStatuses(stepStatuses: string[]): TrainingStatus {
  if (stepStatuses.length === 0) {
    return TrainingStatus.NOT_STARTED;
  }

  const allCompleted = stepStatuses.every((status) => status === TrainingStatus.COMPLETED);
  if (allCompleted) {
    return TrainingStatus.COMPLETED;
  }

  const hasInProgress = stepStatuses.some((status) => status === TrainingStatus.IN_PROGRESS);
  const hasCompleted = stepStatuses.some((status) => status === TrainingStatus.COMPLETED);

  if (hasInProgress || hasCompleted) {
    return TrainingStatus.IN_PROGRESS;
  }

  return TrainingStatus.NOT_STARTED;
}

export async function getUserProgress(
  courseId: string,
  userId: string,
): Promise<UserDetailedProgress | null> {
  const { courseId: safeCourseId, userId: safeUserId } = userCourseProgressSchema.parse({
    courseId,
    userId,
  });

  const user = await prisma.user.findUnique({
    where: { id: safeUserId },
    select: {
      username: true,
      profile: {
        select: {
          avatarUrl: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const userInfo = {
    username: user.username,
    avatarUrl: user.profile?.avatarUrl || null,
  };

  const userCourse = await prisma.userCourse.findFirst({
    where: {
      courseId: safeCourseId,
      userId: safeUserId,
    },
    select: {
      startedAt: true,
      completedAt: true,
    },
  });

  let startedAt: Date | null = userCourse?.startedAt || null;
  const completedAt: Date | null = userCourse?.completedAt || null;

  if (!userCourse) {
    const userTrainings = await prisma.userTraining.findMany({
      where: {
        userId: safeUserId,
        dayOnCourse: {
          courseId: safeCourseId,
        },
      },
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (userTrainings.length > 0) {
      startedAt = userTrainings[0].createdAt;
    }
  }

  const courseDays = await prisma.dayOnCourse.findMany({
    where: { courseId: safeCourseId },
    orderBy: { order: "asc" },
    include: {
      day: {
        include: {
          stepLinks: {
            orderBy: { order: "asc" },
            include: {
              step: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const userTrainings = await prisma.userTraining.findMany({
    where: {
      userId: safeUserId,
      dayOnCourse: {
        courseId: safeCourseId,
      },
    },
    include: {
      steps: {
        include: {
          stepOnDay: true,
        },
      },
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
    userTrainings.map((ut) => [
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

  const daysProgress = courseDays.map((dayLink) => {
    const userTraining = userTrainingMap.get(dayLink.id);

    const dayStatus = (() => {
      if (!userTraining) return TrainingStatus.NOT_STARTED;

      const allStepStatuses: string[] = [];
      for (const stepLink of dayLink.day.stepLinks) {
        const userStep = (userTraining.steps || []).find(
          (s) => s.stepOnDayId === stepLink.id,
        );
        allStepStatuses.push(userStep?.status || TrainingStatus.NOT_STARTED);
      }

      return calculateDayStatusFromStatuses(allStepStatuses);
    })();

    const stepsProgress = dayLink.day.stepLinks.map((stepLink) => {
      let stepStatus = TrainingStatus.NOT_STARTED;
      let stepStartedAt: Date | null = null;
      let stepCompletedAt: Date | null = null;

      if (userTraining && userTraining.steps) {
        const userStep = userTraining.steps.find((step) => step.stepOnDayId === stepLink.id);
        if (userStep) {
          const currentStatus = userStep.status as TrainingStatus;
          stepStatus = currentStatus;
          // Для шагов в процессе используем createdAt как дату начала
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
    if (dayStatus === TrainingStatus.COMPLETED && userTraining && userTraining.steps) {
      const completedDates = userTraining.steps
        .filter((s) => (s.status as TrainingStatus) === TrainingStatus.COMPLETED)
        .map((s) => s.updatedAt)
        .filter(Boolean) as Date[];
      if (completedDates.length) {
        const maxTs = Math.max(...completedDates.map((d) => new Date(d).getTime()));
        dayCompletedAt = new Date(maxTs);
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
    userId: safeUserId,
    username: userInfo.username,
    avatarUrl: userInfo.avatarUrl,
    startedAt,
    completedAt,
    days: daysProgress,
  };
}

