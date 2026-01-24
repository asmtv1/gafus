/**
 * Сбор данных пользователя для персонализации сообщений
 */

import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";
import type { UserData } from "./reengagement-types";

const logger = createWorkerLogger("user-data-collector");

/**
 * Собрать полные данные о пользователе для персонализации
 */
export async function collectUserData(userId: string): Promise<UserData | null> {
  try {
    // 1. Получить основную информацию
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        profile: {
          select: {
            fullName: true,
          },
        },
        pets: {
          select: {
            name: true,
          },
          take: 1,
        },
      },
    });

    if (!user) {
      logger.warn("Пользователь не найден", { userId });
      return null;
    }

    // 2. Получить завершенные курсы с оценками
    const userCourses = await prisma.userCourse.findMany({
      where: {
        userId,
        status: "COMPLETED",
        completedAt: {
          not: null,
        },
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        completedAt: "desc",
      },
    });

    // 3. Получить оценки курсов
    const courseReviews = await prisma.courseReview.findMany({
      where: {
        userId,
        rating: {
          not: null,
        },
      },
      select: {
        courseId: true,
        rating: true,
      },
    });

    // Создать мапу оценок
    const ratingsMap = new Map<string, number>();
    courseReviews.forEach((review) => {
      if (review.rating) {
        ratingsMap.set(review.courseId, review.rating);
      }
    });

    // Собрать данные о завершенных курсах
    const completedCourses = userCourses.map((uc) => ({
      id: uc.course.id,
      name: uc.course.name,
      rating: ratingsMap.get(uc.courseId) || 0,
    }));

    // 4. Подсчитать общее количество завершенных шагов
    const totalSteps = await prisma.userStep.count({
      where: {
        userTraining: {
          userId,
        },
        status: "COMPLETED",
      },
    });

    // 5. Получить последний активный курс
    const lastActiveCourse = await prisma.userCourse.findFirst({
      where: {
        userId,
        status: "IN_PROGRESS",
      },
      include: {
        course: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // 6. Получить статистику платформы (кешируемые данные)
    const platformStats = (await getPlatformStats()) || undefined;

    // Имя собаки (первая из списка)
    const dogName = user.pets[0]?.name;

    return {
      userId: user.id,
      username: user.username,
      dogName,
      completedCourses,
      totalSteps,
      lastCourse: lastActiveCourse?.course.name,
      platformStats,
    };
  } catch (error) {
    logger.error("Ошибка сбора данных пользователя", error as Error, { userId });
    return null;
  }
}

/**
 * Получить статистику платформы (для social proof)
 * Кешируется на 1 час
 */
let platformStatsCache: {
  data: { weeklyCompletions: number; activeTodayUsers: number } | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

const CACHE_TTL = 60 * 60 * 1000; // 1 час

async function getPlatformStats() {
  const now = Date.now();

  // Проверяем кеш
  if (platformStatsCache.data && now - platformStatsCache.timestamp < CACHE_TTL) {
    return platformStatsCache.data;
  }

  try {
    // Количество завершений за последние 7 дней
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const weeklyCompletions = await prisma.userStep.count({
      where: {
        status: "COMPLETED",
        updatedAt: {
          gte: weekStart,
        },
      },
    });

    // Активные пользователи сегодня (завершили хотя бы 1 шаг)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const activeTodayUsers = await prisma.userStep.groupBy({
      by: ["userTrainingId"],
      where: {
        status: "COMPLETED",
        updatedAt: {
          gte: todayStart,
        },
      },
    });

    const stats = {
      weeklyCompletions,
      activeTodayUsers: activeTodayUsers.length,
    };

    // Обновляем кеш
    platformStatsCache = {
      data: stats,
      timestamp: now,
    };

    return stats;
  } catch (error) {
    logger.error("Ошибка получения статистики платформы", error as Error);
    return null;
  }
}

/**
 * Получить лучший курс пользователя (по оценке)
 */
export async function getBestRatedCourse(userId: string): Promise<{
  id: string;
  name: string;
  rating: number;
} | null> {
  try {
    const bestCourse = await prisma.courseReview.findFirst({
      where: {
        userId,
        rating: {
          not: null,
          gte: 4, // Минимум 4 звезды
        },
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        rating: "desc",
      },
    });

    if (!bestCourse || !bestCourse.rating) {
      return null;
    }

    return {
      id: bestCourse.course.id,
      name: bestCourse.course.name,
      rating: bestCourse.rating,
    };
  } catch (error) {
    logger.error("Ошибка получения лучшего курса", error as Error, { userId });
    return null;
  }
}
