"use client";

import { createWebLogger } from "@gafus/logger";
import type { 
  Achievement, 
  AchievementData, 
  AchievementCalculationParams, 
  AchievementCalculationResult,
  UserWithTrainings,
  CourseWithProgressData
} from "@gafus/types";

// Создаем логгер для calculate-achievements
const logger = createWebLogger('web-calculate-achievements');

// Тип для статистики достижений
interface AchievementStats {
  totalCourses: number;
  completedCourses: number;
  inProgressCourses: number;
  totalCompletedDays: number;
  totalDays: number;
  overallProgress: number;
  totalTrainingTime: number;
  averageCourseProgress: number;
  longestStreak: number;
  currentStreak: number;
}

// Конфигурация достижений
const ACHIEVEMENTS_CONFIG = [
  // Курсы
  {
    id: "first-course",
    title: "Первый шаг",
    description: "Начните свой первый курс",
    icon: "🎯",
    category: "courses" as const,
    condition: (stats: AchievementStats) => stats.totalCourses >= 1,
  },
  {
    id: "course-completer",
    title: "Завершитель",
    description: "Завершите свой первый курс",
    icon: "🏆",
    category: "courses" as const,
    condition: (stats: AchievementStats) => stats.completedCourses >= 1,
  },
  {
    id: "course-master",
    title: "Мастер курсов",
    description: "Завершите 5 курсов",
    icon: "👑",
    category: "courses" as const,
    condition: (stats: AchievementStats) => stats.completedCourses >= 5,
  },
  {
    id: "course-expert",
    title: "Эксперт",
    description: "Завершите 10 курсов",
    icon: "🎓",
    category: "courses" as const,
    condition: (stats: AchievementStats) => stats.completedCourses >= 10,
  },
  
  // Прогресс
  {
    id: "progress-starter",
    title: "Начинающий",
    description: "Достигните 25% общего прогресса",
    icon: "📈",
    category: "progress" as const,
    condition: (stats: AchievementStats) => stats.overallProgress >= 25,
  },
  {
    id: "progress-achiever",
    title: "Достигающий",
    description: "Достигните 50% общего прогресса",
    icon: "📊",
    category: "progress" as const,
    condition: (stats: AchievementStats) => stats.overallProgress >= 50,
  },
  {
    id: "progress-master",
    title: "Мастер прогресса",
    description: "Достигните 75% общего прогресса",
    icon: "📋",
    category: "progress" as const,
    condition: (stats: AchievementStats) => stats.overallProgress >= 75,
  },
  {
    id: "progress-perfectionist",
    title: "Перфекционист",
    description: "Достигните 100% общего прогресса",
    icon: "💯",
    category: "progress" as const,
    condition: (stats: AchievementStats) => stats.overallProgress >= 100,
  },
  
  // Серии
  {
    id: "streak-3",
    title: "Трехдневная серия",
    description: "Занимайтесь 3 дня подряд",
    icon: "🔥",
    category: "streak" as const,
    condition: (stats: AchievementStats) => stats.currentStreak >= 3,
  },
  {
    id: "streak-7",
    title: "Недельная серия",
    description: "Занимайтесь 7 дней подряд",
    icon: "⚡",
    category: "streak" as const,
    condition: (stats: AchievementStats) => stats.currentStreak >= 7,
  },
  {
    id: "streak-30",
    title: "Месячная серия",
    description: "Занимайтесь 30 дней подряд",
    icon: "🌟",
    category: "streak" as const,
    condition: (stats: AchievementStats) => stats.currentStreak >= 30,
  },
  
  // Специальные
  {
    id: "early-bird",
    title: "Ранняя пташка",
    description: "Завершите курс за 1 день",
    icon: "🐦",
    category: "special" as const,
    condition: (stats: AchievementStats) => stats.completedCourses >= 1 && stats.averageCourseProgress >= 100,
  },
  {
    id: "dedicated-learner",
    title: "Преданный ученик",
    description: "Потратьте 100 часов на обучение",
    icon: "⏰",
    category: "special" as const,
    condition: (stats: AchievementStats) => stats.totalTrainingTime >= 6000, // 100 часов в минутах
  },
] as const;

/**
 * Вычисляет статистику пользователя на основе его курсов
 */
function calculateUserStatistics(user: UserWithTrainings): AchievementStats {
  const courses = user?.courses || [];
  
  const totalCourses = courses.length;
  const completedCourses = courses.filter(course => course.completedAt).length;
  const inProgressCourses = courses.filter(
    course => course.startedAt && !course.completedAt
  ).length;
  
  const totalCompletedDays = courses.reduce(
    (sum, course) => sum + (course.completedDays?.length || 0),
    0
  );
  
  const totalDays = courses.reduce(
    (sum, course) => sum + (course.totalDays || 0),
    0
  );
  
  const overallProgress = totalDays > 0 
    ? Math.round((totalCompletedDays / totalDays) * 100) 
    : 0;
  
  // Вычисляем время обучения (примерная оценка)
  const totalTrainingTime = courses.reduce((sum, course) => {
    const completedDays = course.completedDays?.length || 0;
    const estimatedMinutesPerDay = 30; // Примерно 30 минут в день
    return sum + (completedDays * estimatedMinutesPerDay);
  }, 0);
  
  // Средний прогресс по курсам
  const averageCourseProgress = totalCourses > 0
    ? Math.round(courses.reduce((sum, course) => {
        const courseProgress = course.totalDays > 0 
          ? ((course.completedDays?.length || 0) / course.totalDays) * 100
          : 0;
        return sum + courseProgress;
      }, 0) / totalCourses)
    : 0;
  
  // Вычисляем серии (упрощенная версия)
  const longestStreak = calculateLongestStreak(courses);
  const currentStreak = calculateCurrentStreak(courses);
  
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
 * Вычисляет самую длинную серию занятий
 */
function calculateLongestStreak(courses: UserWithTrainings['courses']): number {
  // Упрощенная реализация - в реальном приложении нужно анализировать даты
  const completedCourses = courses.filter(course => course.completedAt);
  return Math.min(completedCourses.length * 2, 30); // Примерная оценка
}

/**
 * Вычисляет текущую серию занятий
 */
function calculateCurrentStreak(courses: UserWithTrainings['courses']): number {
  // Упрощенная реализация - в реальном приложении нужно анализировать даты
  const inProgressCourses = courses.filter(
    course => course.startedAt && !course.completedAt
  );
  return Math.min(inProgressCourses.length, 7); // Примерная оценка
}

/**
 * Вычисляет достижения на основе статистики
 */
function calculateAchievements(stats: AchievementStats): Achievement[] {
  if (!stats) {
    return [];
  }
  
  return ACHIEVEMENTS_CONFIG.map(config => {
    const unlocked = config.condition(stats);
    const progress = calculateAchievementProgress(config, stats);
    
    return {
      id: config.id,
      title: config.title,
      description: config.description,
      icon: config.icon,
      unlocked,
      unlockedAt: unlocked ? new Date() : undefined,
      progress,
      category: config.category,
    };
  });
}

/**
 * Вычисляет прогресс достижения (0-100)
 */
function calculateAchievementProgress(config: (typeof ACHIEVEMENTS_CONFIG)[number], stats: AchievementStats): number {
  switch (config.id) {
    case "first-course":
      return Math.min(Math.round((stats.totalCourses / 1) * 100), 100);
    case "course-completer":
      return Math.min(Math.round((stats.completedCourses / 1) * 100), 100);
    case "course-master":
      return Math.min(Math.round((stats.completedCourses / 5) * 100), 100);
    case "course-expert":
      return Math.min(Math.round((stats.completedCourses / 10) * 100), 100);
    case "progress-starter":
      return Math.min(Math.round((stats.overallProgress / 25) * 100), 100);
    case "progress-achiever":
      return Math.min(Math.round((stats.overallProgress / 50) * 100), 100);
    case "progress-master":
      return Math.min(Math.round((stats.overallProgress / 75) * 100), 100);
    case "progress-perfectionist":
      return Math.min(Math.round((stats.overallProgress / 100) * 100), 100);
    case "streak-3":
      return Math.min(Math.round((stats.currentStreak / 3) * 100), 100);
    case "streak-7":
      return Math.min(Math.round((stats.currentStreak / 7) * 100), 100);
    case "streak-30":
      return Math.min(Math.round((stats.currentStreak / 30) * 100), 100);
    case "early-bird":
      return stats.completedCourses >= 1 && stats.averageCourseProgress >= 100 ? 100 : 0;
    case "dedicated-learner":
      return Math.min(Math.round((stats.totalTrainingTime / 6000) * 100), 100);
    default:
      return 0;
  }
}

/**
 * Основная функция для вычисления достижений
 */
export async function calculateAchievementsData(
  params: AchievementCalculationParams
): Promise<AchievementCalculationResult> {
  const { user } = params;
  
  // Вычисляем статистику
  const statistics = calculateUserStatistics(user);
  
  // Вычисляем достижения
  const achievements = calculateAchievements(statistics);
  
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
  stepStates: Record<string, { status: string; isFinished: boolean; timeLeft: number; isPaused: boolean }>,
  getStepKey: (courseId: string, day: number, stepIndex: number) => string,
  cachedTrainingData?: Record<string, {
    trainingDays: {
      day: number;
      title: string;
      type: string;
      courseId: string;
      userStatus: string;
    }[];
    courseDescription: string | null;
    courseId: string | null;
    courseVideoUrl: string | null;
  }>
): AchievementData {
  // Фильтруем курсы, которые не в статусе NOT_STARTED
  const activeCourses = courses.filter(course => course.userStatus !== "NOT_STARTED");
  
  const totalCourses = activeCourses.length;
  const completedCourses = activeCourses.filter(course => course.userStatus === "COMPLETED").length;
  const inProgressCourses = activeCourses.filter(course => course.userStatus === "IN_PROGRESS").length;
  
  // Подсчитываем завершенные дни и шаги
  let totalCompletedDays = 0;
  let totalDays = 0;
  let _totalCompletedSteps = 0;
  let _totalSteps = 0;
  
  activeCourses.forEach(course => {
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
        day => day.userStatus === "COMPLETED"
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
            dayLink.day.stepLinks.forEach((stepLink, stepIndex) => {
              const stepKey = getStepKey(course.id, dayIndex + 1, stepIndex);
              const stepState = stepStates[stepKey];
              if (stepState && stepState.status === "COMPLETED") {
                _totalCompletedSteps++;
              }
            });
        }
      });
    }
  });
  
  const overallProgress = totalDays > 0 
    ? Math.round((totalCompletedDays / totalDays) * 100) 
    : 0;
  
  // Вычисляем время обучения (примерная оценка)
  const totalTrainingTime = totalCompletedDays * 30; // 30 минут в день
  
  // Средний прогресс по курсам
  const averageCourseProgress = totalCourses > 0
    ? Math.round(activeCourses.reduce((sum, course) => {
        const courseProgress = course.dayLinks?.length ? 
          Math.round((totalCompletedDays / totalDays) * 100) : 0;
        return sum + courseProgress;
      }, 0) / totalCourses)
    : 0;
  
  // Упрощенные серии
  const longestStreak = Math.min(completedCourses * 2, 30);
  const currentStreak = Math.min(inProgressCourses, 7);
  
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
  
  // Вычисляем достижения
  const achievements = calculateAchievements(stats);
  
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
  if (process.env.NODE_ENV === 'development') {
    logger.info('[createAchievementData] User data:', {
      hasUser: !!user,
      hasCourses: !!user?.courses,
      coursesLength: user?.courses?.length,
      coursesData: user?.courses?.map(c => ({
        courseId: c.courseId,
        courseName: c.courseName,
        completedAt: !!c.completedAt,
        completedDaysLength: c.completedDays?.length,
        totalDays: c.totalDays
      }))
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
  if (process.env.NODE_ENV === 'development') {
    logger.info('[createAchievementData] Result:', {
      totalCourses: achievementData.totalCourses,
      completedCourses: achievementData.completedCourses,
      totalCompletedDays: achievementData.totalCompletedDays,
      totalDays: achievementData.totalDays,
      overallProgress: achievementData.overallProgress,
      achievementsLength: achievementData.achievements.length,
      operation: 'info'
    });
  }
  
  return achievementData;
}
