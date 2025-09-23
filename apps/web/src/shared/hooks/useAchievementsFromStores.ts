"use client";


import { createWebLogger } from "@gafus/logger";
import { useMemo } from "react";
import { useCourseStore } from "@shared/stores/courseStore";
import { useStepStore } from "@shared/stores/stepStore";
import { useCourseProgressSync } from "@shared/hooks/useCourseProgressSync";
import { calculateAchievementsFromStores } from "@shared/lib/achievements/calculateAchievements";
import type { AchievementData } from "@gafus/types";

// Создаем логгер для use-achievements-from-stores
const logger = createWebLogger('web-use-achievements-from-stores');

/**
 * Хук для получения данных достижений из локальных stores
 * Использует данные из courseStore, stepStore и trainingStore
 */
export function useAchievementsFromStores() {
  const { allCourses } = useCourseStore();
  const { syncedCourses, getCachedData } = useCourseProgressSync();
  const stepStates = useStepStore((state) => state.stepStates);
  const getStepKey = useStepStore((state) => state.getStepKey);
  
  const achievementData = useMemo((): AchievementData | null => {
    // Используем синхронизированные курсы или данные из courseStore
    const courses = syncedCourses || allCourses?.data;
    
    if (!courses || courses.length === 0) {
      return null;
    }
    
    // Получаем кэшированные данные дней тренировок из trainingStore
    const cachedTrainingData: Record<string, {
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
    }> = {};
    
    courses.forEach(course => {
      const cached = getCachedData(course.type);
      if (cached.data && !cached.isExpired) {
        cachedTrainingData[course.id] = cached.data;
      }
    });
    
    // Вычисляем достижения из stores
    const data = calculateAchievementsFromStores(courses, stepStates, getStepKey, cachedTrainingData);
    
    // Добавляем логирование для отладки
    if (process.env.NODE_ENV === 'development') {
      logger.info('[useAchievementsFromStores] Calculated data:', {
        totalCourses: data.totalCourses,
        completedCourses: data.completedCourses,
        inProgressCourses: data.inProgressCourses,
        totalCompletedDays: data.totalCompletedDays,
        totalDays: data.totalDays,
        overallProgress: data.overallProgress,
        achievementsLength: data.achievements.length,
        unlockedAchievements: data.achievements.filter(a => a.unlocked, { operation: 'info' }).length
      });
    }
    
    return data;
  }, [syncedCourses, allCourses?.data, stepStates, getStepKey, getCachedData]);
  
  return {
    data: achievementData,
    error: null,
    isLoading: false,
  };
}

/**
 * Хук для получения достижений по категориям из stores
 */
export function useAchievementsByCategoryFromStores() {
  const { data, error, isLoading } = useAchievementsFromStores();
  
  const achievementsByCategory = useMemo(() => {
    if (!data?.achievements) return {};
    
    return data.achievements.reduce((acc, achievement) => {
      if (!achievement || !achievement.category) {
        return acc;
      }
      
      if (!acc[achievement.category]) {
        acc[achievement.category] = [];
      }
      acc[achievement.category].push(achievement);
      return acc;
    }, {} as Record<string, typeof data.achievements>);
  }, [data?.achievements, data]);
  
  const unlockedCount = data?.achievements?.filter(a => a?.unlocked === true).length || 0;
  const totalCount = data?.achievements?.length || 0;
  const completionPercentage = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;
  
  return {
    achievementsByCategory,
    unlockedCount,
    totalCount,
    completionPercentage,
    data,
    error,
    isLoading,
  };
}
