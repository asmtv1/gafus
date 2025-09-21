"use client";

import { useData, useMutate } from "@gafus/react-query";
import { getUserWithTrainings } from "@shared/lib/user/getUserWithTrainings";
import { createAchievementData } from "@shared/lib/achievements/calculateAchievements";
import { isOnline } from "@shared/utils/offlineCacheUtils";

import type { AchievementData, Achievement } from "@gafus/types";

/**
 * Хук для получения данных достижений с оптимизированным кэшированием
 * 
 * Особенности:
 * - Кэширование на 5 минут (достижения редко изменяются)
 * - Автоматическое обновление при изменении курсов
 * - Сохранение предыдущих данных при обновлении
 * - Обработка ошибок с повторными попытками
 */
export function useAchievements() {
  return useData<AchievementData>(
    "user:achievements",
    async () => {
      try {
        // Получаем данные пользователя
        const user = await getUserWithTrainings();
        
        if (!user) {
          throw new Error("Пользователь не найден");
        }
        
        // Вычисляем достижения
        const achievementData = await createAchievementData(user);
        
        return achievementData;
      } catch (error) {
        console.error("Ошибка загрузки достижений:", error);
        throw error;
      }
    },
    {
      // Кэширование для офлайн работы
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 2 * 60 * 60 * 1000, // 2 часа - достижения редко изменяются
      gcTime: 24 * 60 * 60 * 1000, // 24 часа - кэш хранится долго
      networkMode: "offlineFirst", // Сначала используем кэш, потом сеть
      
      // Повторные попытки
      retry: (failureCount, error) => {
        if (!isOnline()) return false;
        if (error instanceof Error && error.message.includes('fetch')) {
          return failureCount < 2;
        }
        return failureCount < 3;
      },
      retryDelay: 5000,
      
      // Кэш
      placeholderData: (previousData) => {
        // Добавляем логирование для отладки
        if (process.env.NODE_ENV === 'development') {
          console.log('[useAchievements] placeholderData:', {
            hasPreviousData: !!previousData,
            previousDataValid: previousData && previousData.achievements && Array.isArray(previousData.achievements)
          });
        }
        return previousData; // Показываем старые данные во время обновления
      },
    }
  );
}

/**
 * Хук для мутации данных достижений
 */
export function useAchievementsMutation() {
  const { mutate } = useMutate();
  
  /**
   * Инвалидирует кэш достижений
   */
  const invalidateAchievements = () => {
    mutate("user:achievements");
  };
  
  return {
    invalidateAchievements,
  };
}

/**
 * Хук для получения достижений по категориям
 */
export function useAchievementsByCategory() {
  const { data, error, isLoading } = useAchievements();
  
  // Добавляем логирование для отладки
  if (process.env.NODE_ENV === 'development') {
    console.log('[useAchievementsByCategory] Data state:', { 
      hasData: !!data, 
      hasAchievements: !!data?.achievements, 
      achievementsLength: data?.achievements?.length,
      isLoading,
      error: !!error 
    });
  }
  
  const achievementsByCategory = data?.achievements?.reduce((acc, achievement) => {
    if (!achievement || !achievement.category) {
      console.warn('[useAchievementsByCategory] Invalid achievement:', achievement);
      return acc;
    }
    
    if (!acc[achievement.category]) {
      acc[achievement.category] = [];
    }
    acc[achievement.category].push(achievement);
    return acc;
  }, {} as Record<string, Achievement[]>) || {};
  
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

/**
 * Хук для получения статистики достижений
 */
export function useAchievementsStats() {
  const { data, error, isLoading } = useAchievements();
  
  if (!data) {
    return {
      stats: null,
      error,
      isLoading,
    };
  }
  
  const stats = {
    // Общая статистика
    totalCourses: data.totalCourses,
    completedCourses: data.completedCourses,
    inProgressCourses: data.inProgressCourses,
    overallProgress: data.overallProgress,
    
    // Статистика достижений
    totalAchievements: data.achievements?.length || 0,
    unlockedAchievements: data.achievements?.filter(a => a.unlocked).length || 0,
    completionPercentage: data.achievements?.length ? Math.round((data.achievements.filter(a => a.unlocked).length / data.achievements.length) * 100) : 0,
    
    // Дополнительная статистика
    totalTrainingTime: data.totalTrainingTime,
    averageCourseProgress: data.averageCourseProgress,
    longestStreak: data.longestStreak,
    currentStreak: data.currentStreak,
    
    // Метаданные
    lastUpdated: data.lastUpdated,
    version: data.version,
  };
  
  return {
    stats,
    error,
    isLoading,
  };
}
