import { prisma } from "@gafus/prisma";
import { assertNever, TrainingStatus } from "@gafus/types";

import type { DetailedCourseStats, StatisticsData, UserCourse } from "../types";

export async function getCourseStatistics(
  userId: string,
  isElevated: boolean,
): Promise<StatisticsData> {
  const coursesRaw = await prisma.course.findMany({
    where: isElevated ? {} : { authorId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        select: {
          username: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
      dayLinks: {
        include: {
          day: {
            include: {
              stepLinks: {
                include: {
                  step: true,
                },
                orderBy: { order: "asc" },
              },
            },
          },
        },
        orderBy: { order: "asc" },
      },
      userCourses: {
        include: {
          user: {
            include: { profile: true },
          },
        },
      },
      reviews: {
        include: {
          user: { include: { profile: true } },
        },
      },
    },
  });

  const courseIds = coursesRaw.map((course) => course.id);
  const trainingsRaw =
    courseIds.length === 0
      ? []
      : await prisma.userTraining.findMany({
          where: {
            dayOnCourse: {
              courseId: { in: courseIds },
            },
          },
          select: {
            userId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            dayOnCourse: {
              select: {
                courseId: true,
                order: true,
              },
            },
            user: {
              select: {
                username: true,
                profile: {
                  select: {
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        });

  const startedStepStatuses = [
    TrainingStatus.IN_PROGRESS,
    TrainingStatus.COMPLETED,
    TrainingStatus.RESET,
  ];
  const userStepsRaw =
    courseIds.length === 0
      ? []
      : await prisma.userStep.findMany({
          where: {
            userTraining: {
              dayOnCourse: {
                courseId: { in: courseIds },
              },
            },
            status: { in: startedStepStatuses },
          },
          select: {
            createdAt: true,
            userTraining: {
              select: {
                userId: true,
                dayOnCourse: {
                  select: { courseId: true },
                },
              },
            },
          },
        });

  const startedStepsByCourse = groupStartedStepsByCourse(
    userStepsRaw.map((step) => ({
      courseId: step.userTraining.dayOnCourse.courseId,
      userId: step.userTraining.userId,
      startedAt: step.createdAt,
    })),
  );

  const trainingsByCourse = groupTrainingRecordsByCourse(
    trainingsRaw.map((training) => ({
      courseId: training.dayOnCourse.courseId,
      userId: training.userId,
      status: training.status as TrainingStatus,
      createdAt: training.createdAt,
      updatedAt: training.updatedAt,
      dayOrder: training.dayOnCourse.order,
      user: training.user
        ? {
            username: training.user.username,
            profile: { avatarUrl: training.user.profile?.avatarUrl ?? null },
          }
        : undefined,
    })),
  );

  const courses = coursesRaw.map((course) => {
    const totalDays = course.dayLinks.length;
    const courseTrainings = trainingsByCourse.get(course.id);
    const startedSteps = startedStepsByCourse.get(course.id);
    const mergedUsers = mergeUserCourses(
      course.userCourses,
      courseTrainings,
      totalDays,
      startedSteps,
    );

    return {
      id: course.id,
      name: course.name,
      logoImg: course.logoImg,
      avgRating: course.avgRating,
      isPrivate: course.isPrivate,
      isPaid: course.isPaid ?? false,
      isPersonalized: (course as { isPersonalized?: boolean }).isPersonalized ?? false,
      totalUsers: mergedUsers.totalUsers,
      completedUsers: mergedUsers.completedUsers,
      inProgressUsers: mergedUsers.inProgressUsers,
      notStartedUsers: mergedUsers.notStartedUsers,
      trainingLevel: course.trainingLevel,
      author: course.author
        ? {
            username: course.author.username,
            fullName: course.author.profile?.fullName ?? null,
          }
        : undefined,
      reviews: course.reviews.map((r) => ({
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        user: {
          username: r.user.username,
          profile: { avatarUrl: r.user.profile?.avatarUrl ?? null },
        },
      })),
      userCourses: mergedUsers.userCourses,
    };
  });

  const totalCourses = courses.length;
  const totalDays = coursesRaw.reduce((sum, course) => sum + course.dayLinks.length, 0);

  return {
    courses,
    totalCourses,
    totalDays,
  };
}

export async function getDetailedCourseStatistics(
  courseId: string,
  userId: string,
  isElevated: boolean,
): Promise<DetailedCourseStats | null> {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      ...(isElevated ? {} : { authorId: userId }),
    },
    include: {
      dayLinks: {
        include: {
          day: {
            include: {
              stepLinks: {
                include: {
                  step: true,
                },
                orderBy: { order: "asc" },
              },
            },
          },
        },
        orderBy: { order: "asc" },
      },
      userCourses: {
        include: {
          user: {
            include: {
              profile: true,
            },
          },
        },
      },
      reviews: {
        include: {
          user: {
            include: {
              profile: true,
            },
          },
        },
      },
      favoritedBy: true,
      author: {
        select: {
          username: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
    },
  });

  if (!course) return null;

  const userTrainings = await prisma.userTraining.findMany({
    where: {
      dayOnCourse: {
        courseId,
      },
    },
    include: {
      user: {
        include: {
          profile: true,
        },
      },
      dayOnCourse: {
        include: {
          day: true,
        },
      },
      steps: {
        include: {
          stepOnDay: {
            include: {
              step: true,
            },
          },
        },
      },
    },
  });

  const dayAnalytics = await Promise.all(
    course.dayLinks.map(async (dayLink) => {
      const dayTrainings = userTrainings.filter((ut) => ut.dayOnCourseId === dayLink.id);
      const totalSteps = dayLink.day.stepLinks.length;
      const completedSteps = dayTrainings.reduce((sum, training) => {
        return sum + training.steps.filter((step) => step.status === "COMPLETED").length;
      }, 0);
      const totalStepAttempts = dayTrainings.reduce((sum, training) => {
        return sum + training.steps.length;
      }, 0);

      const completionRate = totalStepAttempts > 0 ? (completedSteps / totalStepAttempts) * 100 : 0;
      const stepTimes = dayTrainings.flatMap((training) =>
        training.steps.map((step) => {
          const createdAt = new Date(step.createdAt);
          const updatedAt = new Date(step.updatedAt);
          return step.status === "COMPLETED"
            ? (updatedAt.getTime() - createdAt.getTime()) / 1000
            : 0;
        }),
      );
      const averageTimePerStep =
        stepTimes.length > 0
          ? stepTimes.reduce((sum, time) => sum + time, 0) / stepTimes.length
          : 0;
      const difficultyScore = Math.max(0, 100 - completionRate);

      return {
        dayId: dayLink.day.id,
        dayTitle: dayLink.day.title,
        dayOrder: dayLink.order,
        totalSteps,
        completedSteps,
        completionRate: Math.round(completionRate),
        averageTimePerStep: Math.round(averageTimePerStep),
        difficultyScore: Math.round(difficultyScore),
      };
    }),
  );

  const timeAnalytics = await getTimeAnalytics(courseId);
  const socialAnalytics = await getSocialAnalytics(course);

  const totalDays = course.dayLinks.length;
  const trainingMapForCourse = groupTrainingRecordsByCourse(
    userTrainings.map((training) => ({
      courseId,
      userId: training.userId,
      status: training.status as TrainingStatus,
      createdAt: training.createdAt,
      updatedAt: training.updatedAt,
      dayOrder: training.dayOnCourse.order,
      user: training.user
        ? {
            username: training.user.username,
            profile: { avatarUrl: training.user.profile?.avatarUrl ?? null },
          }
        : undefined,
    })),
  ).get(courseId);

  const startedStepStatuses = [
    TrainingStatus.IN_PROGRESS,
    TrainingStatus.COMPLETED,
    TrainingStatus.RESET,
  ];
  const startedStepsByCourse = groupStartedStepsByCourse(
    userTrainings.flatMap((training) =>
      training.steps
        .filter((step) => startedStepStatuses.includes(step.status as TrainingStatus))
        .map((step) => ({
          courseId,
          userId: training.userId,
          startedAt: step.createdAt,
        })),
    ),
  );
  const startedSteps = startedStepsByCourse.get(courseId);

  const mergedUsers = mergeUserCourses(
    course.userCourses,
    trainingMapForCourse,
    totalDays,
    startedSteps,
  );

  const progressAnalytics = await getProgressAnalytics(courseId, mergedUsers.userCourses);

  return {
    id: course.id,
    name: course.name,
    logoImg: course.logoImg,
    isPrivate: course.isPrivate,
    isPaid: course.isPaid ?? false,
    isPersonalized: (course as { isPersonalized?: boolean }).isPersonalized ?? false,
    avgRating: course.avgRating,
    totalUsers: mergedUsers.totalUsers,
    completedUsers: mergedUsers.completedUsers,
    inProgressUsers: mergedUsers.inProgressUsers,
    notStartedUsers: mergedUsers.notStartedUsers,
    trainingLevel: course.trainingLevel,
    author: course.author
      ? {
          username: course.author.username,
          fullName: course.author.profile?.fullName ?? null,
        }
      : undefined,
    reviews: course.reviews.map((r) => ({
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      user: {
        username: r.user.username,
        profile: { avatarUrl: r.user.profile?.avatarUrl ?? null },
      },
    })),
    userCourses: mergedUsers.userCourses,
    dayAnalytics,
    timeAnalytics,
    progressAnalytics,
    socialAnalytics,
  };
}

type TrainingRecordWithCourse = {
  courseId: string;
  userId: string;
  status: TrainingStatus;
  createdAt: Date;
  updatedAt: Date;
  dayOrder: number;
  user?: {
    username: string;
    profile: { avatarUrl: string | null } | null;
  };
};

type TrainingSummary = {
  trainings: {
    status: TrainingStatus;
    dayOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }[];
  user?: {
    username: string;
    profile: { avatarUrl: string | null } | null;
  };
};

type StartedStepRecord = {
  courseId: string;
  userId: string;
  startedAt: Date;
};

type StartedStepSummary = {
  startedAt: Date;
};

function groupTrainingRecordsByCourse(
  records: TrainingRecordWithCourse[],
): Map<string, Map<string, TrainingSummary>> {
  const result = new Map<string, Map<string, TrainingSummary>>();

  records.forEach((record) => {
    const courseId = record.courseId;
    const userId = record.userId;
    if (!result.has(courseId)) {
      result.set(courseId, new Map());
    }
    const courseMap = result.get(courseId)!;
    if (!courseMap.has(userId)) {
      courseMap.set(userId, { trainings: [], user: record.user });
    }
    const summary = courseMap.get(userId)!;
    summary.trainings.push({
      status: record.status,
      dayOrder: record.dayOrder,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
    if (!summary.user && record.user) {
      summary.user = record.user;
    }
  });

  return result;
}

function groupStartedStepsByCourse(
  records: StartedStepRecord[],
): Map<string, Map<string, StartedStepSummary>> {
  const result = new Map<string, Map<string, StartedStepSummary>>();

  records.forEach((record) => {
    if (!result.has(record.courseId)) {
      result.set(record.courseId, new Map());
    }
    const courseMap = result.get(record.courseId)!;
    const existing = courseMap.get(record.userId);
    if (!existing || record.startedAt < existing.startedAt) {
      courseMap.set(record.userId, { startedAt: record.startedAt });
    }
  });

  return result;
}

function mergeUserCourses(
  courseUserCourses: {
    userId: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    user: { username: string; profile: { avatarUrl: string | null } | null };
  }[],
  trainingSummaryMap: Map<string, TrainingSummary> | undefined,
  totalDays: number,
  startedStepsMap: Map<string, StartedStepSummary> | undefined,
): {
  userCourses: UserCourse[];
  totalUsers: number;
  completedUsers: number;
  inProgressUsers: number;
  notStartedUsers: number;
} {
  const merged = new Map<string, UserCourse>();
  const getStartedAtFromSteps = (userId: string) => startedStepsMap?.get(userId)?.startedAt ?? null;
  const hasStartedStep = (userId: string) => Boolean(startedStepsMap?.has(userId));

  // Добавляем пользователей из courseUserCourses, но только тех, кто начал хотя бы один шаг
  courseUserCourses.forEach((uc) => {
    if (!hasStartedStep(uc.userId)) {
      return;
    }

    const summary = trainingSummaryMap?.get(uc.userId);
    const startedAt = getStartedAtFromSteps(uc.userId);
    const progress = summary
      ? computeStatusFromTrainings(summary, totalDays, startedAt)
      : {
          status: TrainingStatus.IN_PROGRESS,
          startedAt,
          completedAt: null,
        };

    let status = uc.status as TrainingStatus;
    if (getStatusPriority(progress.status) > getStatusPriority(status)) {
      status = progress.status;
    }

    merged.set(uc.userId, {
      userId: uc.userId,
      status,
      startedAt: startedAt ?? uc.startedAt,
      completedAt: uc.completedAt ?? progress.completedAt,
      user: {
        username: uc.user.username,
        profile: { avatarUrl: uc.user.profile?.avatarUrl ?? null },
      },
    });
  });

  // Обновляем/добавляем пользователей на основе тренировок при наличии начатого шага
  if (trainingSummaryMap) {
    trainingSummaryMap.forEach((summary, userId) => {
      if (summary.trainings.length === 0) {
        return;
      }
      if (!hasStartedStep(userId)) {
        return;
      }
      const startedAt = getStartedAtFromSteps(userId);
      const { status, completedAt } = computeStatusFromTrainings(summary, totalDays, startedAt);
      if (status === TrainingStatus.NOT_STARTED) {
        return;
      }
      const existing = merged.get(userId);
      if (existing) {
        if (getStatusPriority(status) > getStatusPriority(existing.status)) {
          existing.status = status;
        }
        if (!existing.startedAt && startedAt) {
          existing.startedAt = startedAt;
        }
        if (!existing.completedAt && completedAt) {
          existing.completedAt = completedAt;
        }
      } else {
        merged.set(userId, {
          userId,
          status,
          startedAt,
          completedAt,
          user: {
            username: summary.user?.username ?? "Неизвестно",
            profile: { avatarUrl: summary.user?.profile?.avatarUrl ?? null },
          },
        });
      }
    });
  }

  // Финальная фильтрация: оставляем только пользователей с фактом начала шага
  const userCourses = Array.from(merged.values()).filter(
    (uc) => uc.status !== TrainingStatus.NOT_STARTED,
  );

  return {
    userCourses,
    totalUsers: userCourses.length,
    completedUsers: userCourses.filter((uc) => uc.status === TrainingStatus.COMPLETED).length,
    inProgressUsers: userCourses.filter((uc) => uc.status === TrainingStatus.IN_PROGRESS).length,
    notStartedUsers: userCourses.filter((uc) => uc.status === TrainingStatus.NOT_STARTED).length,
  };
}

function computeStatusFromTrainings(
  summary: TrainingSummary,
  totalDays: number,
  startedAt: Date | null,
): {
  status: TrainingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
} {
  const trainings = summary.trainings;
  const completedDays = trainings.filter((t) => t.status === TrainingStatus.COMPLETED).length;
  const isCourseCompleted =
    totalDays > 0 && completedDays === totalDays && trainings.length === totalDays;

  let status = TrainingStatus.NOT_STARTED;
  if (isCourseCompleted) {
    status = TrainingStatus.COMPLETED;
  } else if (startedAt) {
    status = TrainingStatus.IN_PROGRESS;
  }

  const completedAt =
    status === TrainingStatus.COMPLETED
      ? trainings.reduce(
          (latest, current) => (current.updatedAt > latest ? current.updatedAt : latest),
          trainings[0].updatedAt,
        )
      : null;

  return { status, startedAt, completedAt };
}

function getStatusPriority(status: TrainingStatus): number {
  switch (status) {
    case TrainingStatus.COMPLETED:
      return 2;
    case TrainingStatus.IN_PROGRESS:
    case TrainingStatus.PAUSED:
      return 1;
    case TrainingStatus.RESET:
      return 0.5;
    case TrainingStatus.NOT_STARTED:
      return 0;
    default:
      return assertNever(status);
  }
}

async function getTimeAnalytics(courseId: string) {
  const activityByDayOfWeek: Record<string, number> = {
    Понедельник: 0,
    Вторник: 0,
    Среда: 0,
    Четверг: 0,
    Пятница: 0,
    Суббота: 0,
    Воскресенье: 0,
  };

  const activityByHour: Record<string, number> = {};
  for (let i = 0; i < 24; i++) {
    activityByHour[i.toString()] = 0;
  }

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
  const activityByMonth: Record<string, number> = {};
  months.forEach((month) => {
    activityByMonth[month] = 0;
  });

  const userActivities = await prisma.userStep.findMany({
    where: {
      userTraining: {
        dayOnCourse: {
          courseId,
        },
      },
    },
    include: {
      userTraining: {
        include: {
          user: true,
        },
      },
    },
  });

  userActivities.forEach((activity) => {
    const date = new Date(activity.createdAt);
    const dayOfWeek = date.toLocaleDateString("ru-RU", { weekday: "long" });
    const hour = date.getHours();
    const month = months[date.getMonth()];

    if (activityByDayOfWeek[dayOfWeek] !== undefined) {
      activityByDayOfWeek[dayOfWeek]++;
    }
    activityByHour[hour.toString()]++;
    activityByMonth[month]++;
  });

  const userSessions = await prisma.userTraining.findMany({
    where: {
      dayOnCourse: {
        courseId,
      },
    },
    select: {
      userId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let totalTimeBetweenSessions = 0;
  let sessionCount = 0;
  const userSessionsMap = new Map<string, { userId: string; createdAt: Date; updatedAt: Date }[]>();

  userSessions.forEach((session) => {
    if (!userSessionsMap.has(session.userId)) {
      userSessionsMap.set(session.userId, []);
    }
    userSessionsMap.get(session.userId)!.push(session);
  });

  userSessionsMap.forEach((sessions) => {
    for (let i = 1; i < sessions.length; i++) {
      const prevSession = new Date(sessions[i - 1].updatedAt);
      const currentSession = new Date(sessions[i].createdAt);
      const timeDiff = (currentSession.getTime() - prevSession.getTime()) / (1000 * 60 * 60);
      totalTimeBetweenSessions += timeDiff;
      sessionCount++;
    }
  });

  const averageTimeBetweenSessions = sessionCount > 0 ? totalTimeBetweenSessions / sessionCount : 0;

  return {
    activityByDayOfWeek,
    activityByHour,
    activityByMonth,
    averageTimeBetweenSessions: Math.round(averageTimeBetweenSessions),
  };
}

async function getProgressAnalytics(
  courseId: string,
  userCourses: {
    status: string;
    startedAt: string | Date | null;
    completedAt: string | Date | null;
    userId: string;
  }[],
) {
  const completedCourses = userCourses.filter(
    (uc) => uc.status === "COMPLETED" && uc.startedAt && uc.completedAt,
  );
  const averageCompletionTime =
    completedCourses.length > 0
      ? completedCourses.reduce((total, uc) => {
          if (!uc.startedAt || !uc.completedAt) return total;
          const startDate = new Date(uc.startedAt);
          const endDate = new Date(uc.completedAt);
          return total + (endDate.getTime() - startDate.getTime());
        }, 0) /
        completedCourses.length /
        (1000 * 60 * 60 * 24)
      : 0;

  const dropoutPoints = await getDropoutPoints(courseId);

  const repeatUsers = userCourses.filter((uc) => {
    const userCourseCount = userCourses.filter((uc2) => uc2.userId === uc.userId).length;
    return userCourseCount > 1;
  }).length;

  const achievements = [
    {
      type: "Первое занятие",
      count: userCourses.filter((uc) => uc.status !== "NOT_STARTED").length,
    },
    {
      type: "Завершение курса",
      count: userCourses.filter((uc) => uc.status === "COMPLETED").length,
    },
    {
      type: "Быстрое прохождение",
      count: completedCourses.filter((uc) => {
        if (!uc.startedAt || !uc.completedAt) return false;
        const startDate = new Date(uc.startedAt);
        const endDate = new Date(uc.completedAt);
        const days = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        return days <= 7;
      }).length,
    },
  ];

  return {
    averageCompletionTime: Math.round(averageCompletionTime * 10) / 10,
    dropoutPoints,
    repeatUsers,
    achievements,
  };
}

async function getDropoutPoints(courseId: string) {
  const userTrainings = await prisma.userTraining.findMany({
    where: {
      dayOnCourse: {
        courseId,
      },
    },
    include: {
      dayOnCourse: {
        include: {
          day: true,
        },
      },
    },
    orderBy: {
      dayOnCourse: {
        order: "asc",
      },
    },
  });

  const dayStats = new Map<number, { total: number; completed: number }>();
  userTrainings.forEach((training) => {
    const dayOrder = training.dayOnCourse.order;
    if (!dayStats.has(dayOrder)) {
      dayStats.set(dayOrder, { total: 0, completed: 0 });
    }
    const stats = dayStats.get(dayOrder)!;
    stats.total++;
    if (training.status === "COMPLETED") {
      stats.completed++;
    }
  });

  const dropoutPoints: { dayOrder: number; dropoutRate: number }[] = [];
  let cumulativeUsers = 0;
  let cumulativeCompleted = 0;

  Array.from(dayStats.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([dayOrder, stats]) => {
      cumulativeUsers += stats.total;
      cumulativeCompleted += stats.completed;

      const dropoutRate =
        cumulativeUsers > 0 ? ((cumulativeUsers - cumulativeCompleted) / cumulativeUsers) * 100 : 0;
      dropoutPoints.push({
        dayOrder,
        dropoutRate: Math.round(dropoutRate),
      });
    });

  return dropoutPoints;
}

async function getSocialAnalytics(course: {
  reviews: { rating: number | null }[];
  favoritedBy: unknown[];
  userCourses: { status: string }[];
}) {
  const ratingDistribution: Record<string, number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };

  course.reviews.forEach((review) => {
    if (review.rating) {
      const rating = Math.floor(review.rating).toString();
      ratingDistribution[rating]++;
    }
  });

  const reviewSentiment = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };

  course.reviews.forEach((review) => {
    if (review.rating) {
      if (review.rating >= 4) {
        reviewSentiment.positive++;
      } else if (review.rating >= 3) {
        reviewSentiment.neutral++;
      } else {
        reviewSentiment.negative++;
      }
    }
  });

  const favoriteCount = course.favoritedBy.length;
  const recommendationEffectiveness =
    course.userCourses.length > 0
      ? (course.userCourses.filter((uc) => uc.status === "COMPLETED").length /
          course.userCourses.length) *
        100
      : 0;

  return {
    ratingDistribution,
    reviewSentiment,
    favoriteCount,
    recommendationEffectiveness: Math.round(recommendationEffectiveness),
  };
}
