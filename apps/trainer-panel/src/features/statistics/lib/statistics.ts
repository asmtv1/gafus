import { prisma } from "@gafus/prisma";

import type { DetailedCourseStats, StatisticsData, TrainingStatus } from "@shared/types/statistics";

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

  const courses = coursesRaw.map((course) => {
    const totalUsers = course.userCourses.length;
    const completedUsers = course.userCourses.filter((uc) => uc.status === "COMPLETED").length;
    const inProgressUsers = course.userCourses.filter((uc) => uc.status === "IN_PROGRESS").length;
    const notStartedUsers = course.userCourses.filter((uc) => uc.status === "NOT_STARTED").length;

    return {
      id: course.id,
      name: course.name,
      logoImg: course.logoImg,
      avgRating: course.avgRating,
      isPrivate: course.isPrivate,
      totalUsers,
      completedUsers,
      inProgressUsers,
      notStartedUsers,
      trainingLevel: course.trainingLevel,
      reviews: course.reviews.map((r) => ({
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        user: {
          username: r.user.username,
          profile: { avatarUrl: r.user.profile?.avatarUrl ?? null },
        },
      })),
      userCourses: course.userCourses.map((uc) => ({
        userId: uc.userId,
        status: uc.status as unknown as TrainingStatus,
        startedAt: uc.startedAt,
        completedAt: uc.completedAt,
        user: {
          username: uc.user.username,
          profile: { avatarUrl: uc.user.profile?.avatarUrl ?? null },
        },
      })),
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
  // Проверяем права доступа
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
    },
  });

  if (!course) return null;

  // Получаем данные о тренировках пользователей
  const userTrainings = await prisma.userTraining.findMany({
    where: {
      dayOnCourse: {
        courseId: courseId,
      },
    },
    include: {
      user: true,
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

  // Аналитика по дням
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

      // Вычисляем среднее время на шаг (в секундах)
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

      // Оценка сложности дня (обратная зависимость от процента завершения)
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

  // Временная аналитика
  const timeAnalytics = await getTimeAnalytics(courseId);

  // Прогресс и достижения
  const progressAnalytics = await getProgressAnalytics(courseId, course.userCourses);

  // Социальная аналитика
  const socialAnalytics = await getSocialAnalytics(course);

  return {
    id: course.id,
    name: course.name,
    logoImg: course.logoImg,
    isPrivate: course.isPrivate,
    avgRating: course.avgRating,
    totalUsers: course.userCourses.length,
    completedUsers: course.userCourses.filter((uc) => uc.status === "COMPLETED").length,
    inProgressUsers: course.userCourses.filter((uc) => uc.status === "IN_PROGRESS").length,
    notStartedUsers: course.userCourses.filter((uc) => uc.status === "NOT_STARTED").length,
    trainingLevel: course.trainingLevel,
    reviews: course.reviews.map((r) => ({
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      user: {
        username: r.user.username,
        profile: { avatarUrl: r.user.profile?.avatarUrl ?? null },
      },
    })),
    userCourses: course.userCourses.map((uc) => ({
      userId: uc.userId,
      status: uc.status as unknown as TrainingStatus,
      startedAt: uc.startedAt,
      completedAt: uc.completedAt,
      user: {
        username: uc.user.username,
        profile: { avatarUrl: uc.user.profile?.avatarUrl ?? null },
      },
    })),
    dayAnalytics,
    timeAnalytics,
    progressAnalytics,
    socialAnalytics,
  };
}

async function getTimeAnalytics(courseId: string) {
  // Активность по дням недели
  const activityByDayOfWeek: Record<string, number> = {
    Понедельник: 0,
    Вторник: 0,
    Среда: 0,
    Четверг: 0,
    Пятница: 0,
    Суббота: 0,
    Воскресенье: 0,
  };

  // Активность по часам
  const activityByHour: Record<string, number> = {};
  for (let i = 0; i < 24; i++) {
    activityByHour[i.toString()] = 0;
  }

  // Активность по месяцам
  const activityByMonth: Record<string, number> = {};
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
  months.forEach((month) => {
    activityByMonth[month] = 0;
  });

  // Получаем все активности пользователей по курсу
  const userActivities = await prisma.userStep.findMany({
    where: {
      userTraining: {
        dayOnCourse: {
          courseId: courseId,
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

  // Анализируем временные паттерны
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

  // Вычисляем среднее время между занятиями
  const userSessions = await prisma.userTraining.findMany({
    where: {
      dayOnCourse: {
        courseId: courseId,
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

  // Группируем по пользователям и вычисляем интервалы
  const userSessionsMap = new Map<string, typeof userSessions>();
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
      const timeDiff = (currentSession.getTime() - prevSession.getTime()) / (1000 * 60 * 60); // в часах
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
  // Среднее время завершения курса
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
        (1000 * 60 * 60 * 24) // в днях
      : 0;

  // Точки отсева
  const dropoutPoints = await getDropoutPoints(courseId);

  // Повторные прохождения
  const repeatUsers = userCourses.filter((uc) => {
    const userCourseCount = userCourses.filter((uc2) => uc2.userId === uc.userId).length;
    return userCourseCount > 1;
  }).length;

  // Достижения (пока заглушка, можно расширить)
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
        return days <= 7; // Быстрое прохождение за неделю
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
        courseId: courseId,
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

  // Группируем по дням
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

  // Вычисляем процент отсева для каждого дня
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
  // Распределение рейтингов
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

  // Анализ тональности отзывов (упрощенная версия)
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

  // Количество добавлений в избранное
  const favoriteCount = course.favoritedBy.length;

  // Эффективность рекомендаций (заглушка)
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
