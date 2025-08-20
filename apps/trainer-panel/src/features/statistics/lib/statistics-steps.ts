import { prisma } from "@gafus/prisma";

export interface StepStats {
  id: string;
  title: string;
  durationSec: number;
  usedInDaysCount: number;
  usedInCoursesCount: number;
  totalUsers: number;
  completedUsers: number;
  inProgressUsers: number;
  notStartedUsers: number;
}

export interface DetailedStepStats extends StepStats {
  days: { id: string; title: string; order: number }[];
  courses: { id: string; name: string }[];
  timeAnalytics: {
    activityByDayOfWeek: Record<string, number>;
    activityByHour: Record<string, number>;
    activityByMonth: Record<string, number>;
    averageTimeToCompleteSec: number;
  };
  completionRate: number;
}

export async function getStepStatistics(userId: string, isElevated: boolean) {
  const steps = await prisma.step.findMany({
    where: isElevated ? {} : { authorId: userId },
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

  const stats: StepStats[] = steps.map((step: { id: string; title: string; durationSec: number; stepLinks: { dayId: string; day: { dayLinks: { courseId: string }[] } }[] }) => {
    const dayIds = new Set(step.stepLinks.map((sl: { dayId: string }) => sl.dayId));
    const courseIds = new Set(
      step.stepLinks.flatMap((sl) => sl.day.dayLinks.map((dl) => dl.courseId)),
    );

    // Пользовательская статистика по шагу через UserStep
    // Для упрощения вычислим позже на детальной странице, а здесь дадим заглушки 0
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

  const days = step.stepLinks.map((sl) => ({
    id: sl.day.id,
    title: sl.day.title,
    order: sl.order,
  }));
  const courses = Array.from(
    new Map(
      step.stepLinks.flatMap((sl) => sl.day.dayLinks.map((dl) => [dl.course.id, dl.course])),
    ).values(),
  ).map((c) => ({ id: c.id, name: c.name }));

  // Собираем userSteps по этому шагу
  const userSteps = await prisma.userStep.findMany({
    where: { stepOnDay: { stepId } },
    include: {
      userTraining: true,
    },
  });

  const totalUsers = new Set(userSteps.map((us) => us.userTraining.userId)).size;
  const completedUsers = new Set(
    userSteps.filter((us) => us.status === "COMPLETED").map((us) => us.userTraining.userId),
  ).size;
  const inProgressUsers = new Set(
    userSteps.filter((us) => us.status === "IN_PROGRESS").map((us) => us.userTraining.userId),
  ).size;
  const notStartedUsers = Math.max(0, totalUsers - completedUsers - inProgressUsers);

  const completionRate = totalUsers > 0 ? Math.round((completedUsers / totalUsers) * 100) : 0;

  // Временная аналитика
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
    Array.from({ length: 24 }, (_, i) => [i.toString(), 0]),
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
  const activityByMonth: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));

  let totalCompletionTimeSec = 0;
  let completionCount = 0;
  userSteps.forEach((us) => {
    const created = new Date(us.createdAt);
    const updated = new Date(us.updatedAt);
    const dayOfWeek = created.toLocaleDateString("ru-RU", { weekday: "long" });
    const hour = created.getHours();
    const month = months[created.getMonth()];
    if (activityByDayOfWeek[dayOfWeek] !== undefined) activityByDayOfWeek[dayOfWeek]++;
    activityByHour[hour.toString()]++;
    activityByMonth[month]++;
    if (us.status === "COMPLETED") {
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
    usedInDaysCount: new Set(step.stepLinks.map((sl) => sl.dayId)).size,
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
