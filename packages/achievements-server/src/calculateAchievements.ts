/**
 * Расчёт достижений по статистике.
 * Общая логика для API (mobile) и web.
 */

import type { Achievement, AchievementStats } from "@gafus/types";
export type { AchievementStats } from "@gafus/types";

const ACHIEVEMENTS_CONFIG = [
  {
    id: "first-course",
    title: "Первый шаг",
    description: "Начните свой первый курс",
    icon: "🎯",
    category: "courses" as const,
    condition: (s: AchievementStats) => s.totalCourses >= 1,
  },
  {
    id: "course-completer",
    title: "Завершитель",
    description: "Завершите свой первый курс",
    icon: "🏆",
    category: "courses" as const,
    condition: (s: AchievementStats) => s.completedCourses >= 1,
  },
  {
    id: "course-master",
    title: "Мастер курсов",
    description: "Завершите 5 курсов",
    icon: "👑",
    category: "courses" as const,
    condition: (s: AchievementStats) => s.completedCourses >= 5,
  },
  {
    id: "course-expert",
    title: "Эксперт",
    description: "Завершите 10 курсов",
    icon: "🎓",
    category: "courses" as const,
    condition: (s: AchievementStats) => s.completedCourses >= 10,
  },
  {
    id: "progress-starter",
    title: "Начинающий",
    description: "Достигните 25% общего прогресса",
    icon: "📈",
    category: "progress" as const,
    condition: (s: AchievementStats) => s.overallProgress >= 25,
  },
  {
    id: "progress-achiever",
    title: "Достигающий",
    description: "Достигните 50% общего прогресса",
    icon: "📊",
    category: "progress" as const,
    condition: (s: AchievementStats) => s.overallProgress >= 50,
  },
  {
    id: "progress-master",
    title: "Мастер прогресса",
    description: "Достигните 75% общего прогресса",
    icon: "📋",
    category: "progress" as const,
    condition: (s: AchievementStats) => s.overallProgress >= 75,
  },
  {
    id: "progress-perfectionist",
    title: "Перфекционист",
    description: "Достигните 100% общего прогресса",
    icon: "💯",
    category: "progress" as const,
    condition: (s: AchievementStats) => s.overallProgress >= 100,
  },
  {
    id: "streak-3",
    title: "Трехдневная серия",
    description: "Занимайтесь 3 дня подряд",
    icon: "🔥",
    category: "streak" as const,
    condition: (s: AchievementStats) => s.currentStreak >= 3,
  },
  {
    id: "streak-7",
    title: "Недельная серия",
    description: "Занимайтесь 7 дней подряд",
    icon: "⚡",
    category: "streak" as const,
    condition: (s: AchievementStats) => s.currentStreak >= 7,
  },
  {
    id: "streak-30",
    title: "Месячная серия",
    description: "Занимайтесь 30 дней подряд",
    icon: "🌟",
    category: "streak" as const,
    condition: (s: AchievementStats) => s.currentStreak >= 30,
  },
  {
    id: "early-bird",
    title: "Ранняя пташка",
    description: "Завершите курс за 1 день",
    icon: "🐦",
    category: "special" as const,
    condition: (s: AchievementStats) => s.completedCourses >= 1 && s.averageCourseProgress >= 100,
  },
  {
    id: "dedicated-learner",
    title: "Преданный ученик",
    description: "Потратьте 100 часов на обучение",
    icon: "⏰",
    category: "special" as const,
    condition: (s: AchievementStats) => s.totalTrainingTime >= 6000,
  },
] as const;

function progressFor(
  config: (typeof ACHIEVEMENTS_CONFIG)[number],
  stats: AchievementStats,
): number {
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
 * Вычисляет достижения по статистике пользователя.
 */
export function calculateAchievements(stats: AchievementStats): Achievement[] {
  if (!stats) return [];
  return ACHIEVEMENTS_CONFIG.map((config) => {
    const unlocked = config.condition(stats);
    return {
      id: config.id,
      title: config.title,
      description: config.description,
      icon: config.icon,
      unlocked,
      unlockedAt: unlocked ? new Date() : undefined,
      progress: progressFor(config, stats),
      category: config.category,
    };
  });
}
