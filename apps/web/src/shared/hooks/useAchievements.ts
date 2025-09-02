"use client";

import { useData, useMutate } from "@gafus/swr";
import { getUserWithTrainings } from "@shared/lib/user/getUserWithTrainings";
import { createAchievementData } from "@shared/lib/achievements/calculateAchievements";

import type { AchievementData } from "@gafus/types";

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
      // Кэширование
      revalidateOnFocus: false, // Не обновляем при фокусе (достижения статичны)
      revalidateOnReconnect: true, // Обновляем при восстановлении соединения
      dedupingInterval: 300000, // 5 минут - достижения редко изменяются
      
      // Повторные попытки
      errorRetryCount: 3,
      errorRetryInterval: 5000,
      
      // Кэш
      keepPreviousData: true, // Показываем старые данные во время обновления
      
      // Обработка ошибок
      onError: (error: Error) => {
        console.error("SWR Error (Achievements):", error);
      },
      
      // Успешная загрузка
      onSuccess: (data: AchievementData) => {
        if (process.env.NODE_ENV === "development") {
          console.warn(`🏆 Achievements loaded: ${data.achievements.length} achievements, ${data.completedCourses} completed courses`);
        }
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
    mutate("user:achievements", undefined);
  };
  
  /**
   * Обновляет данные достижений
   */
  const updateAchievements = async (newData?: AchievementData) => {
    if (newData) {
      // Обновляем кэш новыми данными
      mutate("user:achievements", newData, { revalidate: false });
    } else {
      // Принудительно обновляем данные
      mutate("user:achievements", undefined, { revalidate: true });
    }
  };
  
  /**
   * Инвалидирует все связанные данные
   */
  const invalidateAllUserData = () => {
    mutate("user:achievements", undefined);
    mutate("user:profile", undefined);
    mutate("user:with-trainings", undefined);
    mutate("courses:all", undefined);
  };
  
  return {
    invalidateAchievements,
    updateAchievements,
    invalidateAllUserData,
  };
}

/**
 * Хук для получения достижений по категориям
 */
export function useAchievementsByCategory() {
  const { data, error, isLoading } = useAchievements();
  
  const achievementsByCategory = data?.achievements.reduce((acc, achievement) => {
    if (!acc[achievement.category]) {
      acc[achievement.category] = [];
    }
    acc[achievement.category].push(achievement);
    return acc;
  }, {} as Record<string, typeof data.achievements>) || {};
  
  const unlockedCount = data?.achievements.filter(a => a.unlocked).length || 0;
  const totalCount = data?.achievements.length || 0;
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
    totalAchievements: data.achievements.length,
    unlockedAchievements: data.achievements.filter(a => a.unlocked).length,
    completionPercentage: Math.round((data.achievements.filter(a => a.unlocked).length / data.achievements.length) * 100),
    
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
