import type { UserWithTrainings } from "./user";

// Типы для достижений
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: Date;
  progress: number; // 0-100
  category: AchievementCategory;
}

export type AchievementCategory = 
  | "courses" 
  | "progress" 
  | "streak" 
  | "social" 
  | "special";

// Основные данные достижений
export interface AchievementData {
  // Общая статистика
  totalCourses: number;
  completedCourses: number;
  inProgressCourses: number;
  totalCompletedDays: number;
  totalDays: number;
  overallProgress: number; // 0-100
  
  // Достижения
  achievements: Achievement[];
  
  // Дополнительная статистика
  totalTrainingTime: number; // в минутах
  averageCourseProgress: number; // 0-100
  longestStreak: number; // дней подряд
  currentStreak: number; // дней подряд
  
  // Метаданные
  lastUpdated: Date;
  version: string;
}

// Конфигурация для SWR
export interface AchievementConfig {
  revalidateOnFocus: boolean;
  dedupingInterval: number;
  errorRetryCount: number;
  keepPreviousData: boolean;
}

// Параметры для вычисления достижений
export interface AchievementCalculationParams {
  user: UserWithTrainings;
  includeUnlocked?: boolean;
  includeProgress?: boolean;
}

// Результат вычисления достижений
export interface AchievementCalculationResult {
  achievements: Achievement[];
  statistics: {
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
  };
}
