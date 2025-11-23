import { prisma } from "@gafus/prisma";

import type { DetailedStepStats, StepStatisticsData, StepStats } from "../types";

export async function getStepStatistics(
  userId: string,
  isElevated: boolean,
): Promise<StepStatisticsData> {
  const whereCondition = isElevated ? {} : { authorId: userId };

  const steps = await prisma.step.findMany({
    where: whereCondition,
    orderBy: { createdAt: "desc" },
    include: {
      stepLinks: {
        include: {
          day: {
            include: {
              dayLinks: {
                include: {
                  course: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const stats: StepStats[] = steps.map((step) => {
    const dayIds = new Set(step.stepLinks.map((stepLink) => stepLink.dayId));
    const courseIds = new Set(
      step.stepLinks.flatMap((stepLink) =>
        stepLink.day.dayLinks.map((dayLink) => dayLink.courseId),
      ),
    );

    return {
      id: step.id,
      title: step.title,
      durationSec: step.durationSec,
      usedInDaysCount: dayIds.size,
      usedInCoursesCount: courseIds.size,
      totalUsers: 0,
      completedUsers: 0,
      inProgressUsers: 0,
      notStartedUsers: 0,
    };
  });

  return { steps: stats, totalSteps: stats.length };
}

export async function getDetailedStepStatistics(
  stepId: string,
  userId: string,
  isElevated: boolean,
): Promise<DetailedStepStats | null> {
  const step = await prisma.step.findFirst({
    where: { id: stepId, ...(isElevated ? {} : { authorId: userId }) },
    include: {
      stepLinks: {
        include: {
          day: {
            include: {
              dayLinks: {
                include: {
                  course: true,
                },
              },
            },
          },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!step) return null;

  const days = step.stepLinks.map((stepLink) => ({
    id: stepLink.day.id,
    title: stepLink.day.title,
    order: stepLink.order,
  }));
  const courses = Array.from(
    new Map(
      step.stepLinks.flatMap((stepLink) =>
        stepLink.day.dayLinks.map((dayLink) => [dayLink.course.id, dayLink.course]),
      ),
    ).values(),
  ).map((course) => ({ id: course.id, name: course.name }));

  const userSteps = await prisma.userStep.findMany({
    where: { stepOnDay: { stepId } },
    include: {
      userTraining: true,
    },
  });

  const totalUsers = new Set(userSteps.map((userStep) => userStep.userTraining.userId)).size;
  const completedUsers = new Set(
    userSteps
      .filter((userStep) => userStep.status === "COMPLETED")
      .map((userStep) => userStep.userTraining.userId),
  ).size;
  const inProgressUsers = new Set(
    userSteps
      .filter((userStep) => userStep.status === "IN_PROGRESS")
      .map((userStep) => userStep.userTraining.userId),
  ).size;
  const notStartedUsers = Math.max(0, totalUsers - completedUsers - inProgressUsers);
  const completionRate = totalUsers > 0 ? Math.round((completedUsers / totalUsers) * 100) : 0;

  const activityByDayOfWeek: Record<string, number> = {
    Понедельник: 0,
    Вторник: 0,
    Среда: 0,
    Четверг: 0,
    Пятница: 0,
    Суббота: 0,
    Воскресенье: 0,
  };
  const activityByHour: Record<string, number> = Object.fromEntries(
    Array.from({ length: 24 }, (_, hour) => [hour.toString(), 0]),
  );

  const months = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];
  const activityByMonth: Record<string, number> = Object.fromEntries(months.map((month) => [month, 0]));

  let totalCompletionTimeSec = 0;
  let completionCount = 0;
  userSteps.forEach((userStep) => {
    const created = new Date(userStep.createdAt);
    const updated = new Date(userStep.updatedAt);
    const dayOfWeek = created.toLocaleDateString("ru-RU", { weekday: "long" });
    const hour = created.getHours();
    const month = months[created.getMonth()];

    if (activityByDayOfWeek[dayOfWeek] !== undefined) {
      activityByDayOfWeek[dayOfWeek]++;
    }
    activityByHour[hour.toString()]++;
    activityByMonth[month]++;

    if (userStep.status === "COMPLETED") {
      totalCompletionTimeSec += Math.max(0, (updated.getTime() - created.getTime()) / 1000);
      completionCount++;
    }
  });

  const averageTimeToCompleteSec =
    completionCount > 0 ? Math.round(totalCompletionTimeSec / completionCount) : 0;

  return {
    id: step.id,
    title: step.title,
    durationSec: step.durationSec,
    usedInDaysCount: new Set(step.stepLinks.map((stepLink) => stepLink.dayId)).size,
    usedInCoursesCount: courses.length,
    totalUsers,
    completedUsers,
    inProgressUsers,
    notStartedUsers,
    days,
    courses,
    timeAnalytics: {
      activityByDayOfWeek,
      activityByHour,
      activityByMonth,
      averageTimeToCompleteSec,
    },
    completionRate,
  };
}

