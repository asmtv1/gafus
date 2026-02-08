"use client";

import {
  calculateAchievements as calculateAchievementsFromCore,
  type AchievementStats,
} from "@gafus/core/services/achievements";
import { createWebLogger } from "@gafus/logger";
import type {
  AchievementData,
  AchievementCalculationParams,
  AchievementCalculationResult,
  UserWithTrainings,
  CourseWithProgressData,
} from "@gafus/types";
import { calculateCurrentStreak, calculateLongestStreak } from "./calculateStreaks";

// Создаем логгер для calculate-achievements
const logger = createWebLogger("web-calculate-achievements");

/**
 * Вычисляет статистику пользователя на основе его курсов
 */
function calculateUserStatistics(user: UserWithTrainings): AchievementStats {
  const courses = user?.courses || [];

  const totalCourses = courses.length;
  const completedCourses = courses.filter((course) => course.completedAt).length;
  const inProgressCourses = courses.filter(
    (course) => course.startedAt && !course.completedAt,
  ).length;

  const totalCompletedDays = courses.reduce(
    (sum, course) => sum + (course.completedDays?.length || 0),
    0,
  );

  const totalDays = courses.reduce((sum, course) => sum + (course.totalDays || 0), 0);

  const overallProgress = totalDays > 0 ? Math.round((totalCompletedDays / totalDays) * 100) : 0;

  // Вычисляем время обучения (примерная оценка)
  const totalTrainingTime = courses.reduce((sum, course) => {
    const completedDays = course.completedDays?.length || 0;
    const estimatedMinutesPerDay = 30; // Примерно 30 минут в день
    return sum + completedDays * estimatedMinutesPerDay;
  }, 0);

  // Средний прогресс по курсам
  const averageCourseProgress =
    totalCourses > 0
      ? Math.round(
          courses.reduce((sum, course) => {
            const courseProgress =
              course.totalDays > 0
                ? ((course.completedDays?.length || 0) / course.totalDays) * 100
                : 0;
            return sum + courseProgress;
          }, 0) / totalCourses,
        )
      : 0;

  // Вычисляем серии (упрощенная версия для старого API)
  // В новой версии используются реальные даты из БД через calculateAchievementsFromStores
  const longestStreak = Math.min(completedCourses * 2, 30);
  const currentStreak = Math.min(inProgressCourses, 7);

  return {
    totalCourses,
    completedCourses,
    inProgressCourses,
    totalCompletedDays,
    totalDays,
    overallProgress,
    totalTrainingTime,
    averageCourseProgress,
    longestStreak,
    currentStreak,
  };
}

/**
 * Основная функция для вычисления достижений
 */
export async function calculateAchievementsData(
  params: AchievementCalculationParams,
): Promise<AchievementCalculationResult> {
  const { user } = params;

  const statistics = calculateUserStatistics(user);
  const achievements = calculateAchievementsFromCore(statistics);

  return {
    achievements,
    statistics,
  };
}

/**
 * Вычисляет статистику достижений из данных stores
 */
export function calculateAchievementsFromStores(
  courses: CourseWithProgressData[],
  stepStates: Record<
    string,
    { status: string; isFinished: boolean; timeLeft: number; isPaused: boolean }
  >,
  getStepKey: (courseId: string, dayOnCourseId: string, stepIndex: number) => string,
  cachedTrainingData?: Record<
    string,
    {
      trainingDays: {
        dayOnCourseId: string;
        title: string;
        type: string;
        courseId: string;
        userStatus: string;
      }[];
      courseDescription: string | null;
      courseId: string | null;
      courseVideoUrl: string | null;
    }
  >,
  trainingDates?: Date[],
): AchievementData {
  // Фильтруем курсы, которые не в статусе NOT_STARTED
  const activeCourses = courses.filter((course) => course.userStatus !== "NOT_STARTED");

  const totalCourses = activeCourses.length;
  const completedCourses = activeCourses.filter(
    (course) => course.userStatus === "COMPLETED",
  ).length;
  const inProgressCourses = activeCourses.filter(
    (course) => course.userStatus === "IN_PROGRESS",
  ).length;

  // Подсчитываем завершенные дни и шаги
  let totalCompletedDays = 0;
  let totalDays = 0;
  let _totalCompletedSteps = 0;
  let _totalSteps = 0;

  activeCourses.forEach((course) => {
    // Подсчитываем дни
    const courseDays = course.dayLinks?.length || 0;
    totalDays += courseDays;

    // Подсчитываем завершенные дни из кэша trainingStore
    if (course.userStatus === "COMPLETED") {
      totalCompletedDays += courseDays;
    } else if (cachedTrainingData && cachedTrainingData[course.id]) {
      // Используем данные из trainingStore для точного подсчета
      const courseTrainingData = cachedTrainingData[course.id];
      const completedDaysFromCache = courseTrainingData.trainingDays.filter(
        (day) => day.userStatus === "COMPLETED",
      ).length;
      totalCompletedDays += completedDaysFromCache;
    } else {
      // Fallback: для незавершенных курсов считаем примерное количество завершенных дней
      totalCompletedDays += Math.floor(courseDays * 0.3); // Примерно 30% завершено
    }

    // Подсчитываем шаги
    if (course.dayLinks) {
      course.dayLinks.forEach((dayLink, dayIndex) => {
        if (dayLink.day?.stepLinks) {
          const daySteps = dayLink.day.stepLinks.length;
          _totalSteps += daySteps;

          // Подсчитываем завершенные шаги из stepStore
          // Находим dayOnCourseId из кэшированных данных по индексу
          const cachedDay = cachedTrainingData?.[course.id]?.trainingDays?.[dayIndex];
          const dayOnCourseId = cachedDay?.dayOnCourseId || `${course.id}-day-${dayIndex}`;
          dayLink.day.stepLinks.forEach((stepLink, stepIndex) => {
            const stepKey = getStepKey(course.id, dayOnCourseId, stepIndex);
            const stepState = stepStates[stepKey];
            if (stepState && stepState.status === "COMPLETED") {
              _totalCompletedSteps++;
            }
          });
        }
      });
    }
  });

  const overallProgress = totalDays > 0 ? Math.round((totalCompletedDays / totalDays) * 100) : 0;

  // Вычисляем время обучения (примерная оценка)
  const totalTrainingTime = totalCompletedDays * 30; // 30 минут в день

  // Средний прогресс по курсам
  const averageCourseProgress =
    totalCourses > 0
      ? Math.round(
          activeCourses.reduce((sum, course) => {
            const courseProgress = course.dayLinks?.length
              ? Math.round((totalCompletedDays / totalDays) * 100)
              : 0;
            return sum + courseProgress;
          }, 0) / totalCourses,
        )
      : 0;

  // Подсчет серий на основе реальных дат занятий
  let longestStreak = 0;
  let currentStreak = 0;

  if (trainingDates && trainingDates.length > 0) {
    // Используем реальные даты для правильного подсчета серий
    // Обрабатываем как Date[], так и string[] (после сериализации через клиент-сервер)
    longestStreak = calculateLongestStreak(trainingDates as Date[] | string[]);
    currentStreak = calculateCurrentStreak(trainingDates as Date[] | string[]);
  } else {
    // Fallback: упрощенная оценка, если даты еще не загружены
    longestStreak = Math.min(completedCourses * 2, 30);
    currentStreak = Math.min(inProgressCourses, 7);
  }

  const stats: AchievementStats = {
    totalCourses,
    completedCourses,
    inProgressCourses,
    totalCompletedDays,
    totalDays,
    overallProgress,
    totalTrainingTime,
    averageCourseProgress,
    longestStreak,
    currentStreak,
  };

  const achievements = calculateAchievementsFromCore(stats);

  return {
    ...stats,
    achievements,
    lastUpdated: new Date(),
    version: "1.0.0",
  };
}

/**
 * Создает финальные данные достижений для SWR
 */
export async function createAchievementData(user: UserWithTrainings): Promise<AchievementData> {
  // Добавляем логирование для отладки
  if (process.env.NODE_ENV === "development") {
    logger.info("[createAchievementData] User data:", {
      hasUser: !!user,
      hasCourses: !!user?.courses,
      coursesLength: user?.courses?.length,
      coursesData: user?.courses?.map((c) => ({
        courseId: c.courseId,
        courseName: c.courseName,
        completedAt: !!c.completedAt,
        completedDaysLength: c.completedDays?.length,
        totalDays: c.totalDays,
      })),
    });
  }

  const result = await calculateAchievementsData({ user });

  const achievementData = {
    ...result.statistics,
    achievements: result.achievements,
    lastUpdated: new Date(),
    version: "1.0.0",
  };

  // Добавляем логирование результата
  if (process.env.NODE_ENV === "development") {
    logger.info("[createAchievementData] Result:", {
      totalCourses: achievementData.totalCourses,
      completedCourses: achievementData.completedCourses,
      totalCompletedDays: achievementData.totalCompletedDays,
      totalDays: achievementData.totalDays,
      overallProgress: achievementData.overallProgress,
      achievementsLength: achievementData.achievements.length,
      operation: "info",
    });
  }

  return achievementData;
}
