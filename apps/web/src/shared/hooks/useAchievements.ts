"use client";

import { useData, useMutate } from "@gafus/react-query";
import { getUserWithTrainings } from "@shared/lib/user/getUserWithTrainings";
import { createAchievementData } from "@shared/lib/achievements/calculateAchievements";
import { isOnline } from "@shared/utils/offlineCacheUtils";
import { createWebLogger } from "@gafus/logger";

import type { AchievementData, Achievement } from "@gafus/types";

// Создаем логгер для достижений
const logger = createWebLogger("web-achievements");

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
      let user = null;
      try {
        // Получаем данные пользователя
        user = await getUserWithTrainings();

        if (!user) {
          throw new Error("Пользователь не найден");
        }

        // Вычисляем достижения
        const achievementData = await createAchievementData(user);

        return achievementData;
      } catch (error) {
        logger.error("Ошибка загрузки достижений", error as Error, {
          operation: "load_achievements",
          hasUser: !!user,
        });
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
      retry: (failureCount: number, error: unknown) => {
        if (!isOnline()) return false;
        if (error instanceof Error && error.message.includes("fetch")) {
          return failureCount < 2;
        }
        return failureCount < 3;
      },
      retryDelay: 5000,

      // Кэш
      placeholderData: (previousData: AchievementData | undefined) => {
        // Добавляем логирование для отладки
        if (process.env.NODE_ENV === "development") {
          logger.info("[useAchievements] placeholderData", {
            operation: "achievements_placeholder_data",
            hasPreviousData: !!previousData,
            previousDataValid:
              previousData && previousData.achievements && Array.isArray(previousData.achievements),
          });
        }
        return previousData; // Показываем старые данные во время обновления
      },
    },
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
  if (process.env.NODE_ENV === "development") {
    logger.info("[useAchievementsByCategory] Data state", {
      operation: "achievements_by_category_data_state",
      hasData: !!data,
      hasAchievements: !!data?.achievements,
      achievementsLength: data?.achievements?.length,
      isLoading,
      error: !!error,
    });
  }

  const achievementsByCategory =
    data?.achievements?.reduce(
      (acc: Record<string, Achievement[]>, achievement: Achievement) => {
        if (!achievement || !achievement.category) {
          logger.warn("[useAchievementsByCategory] Invalid achievement", {
            operation: "invalid_achievement",
            achievement: achievement,
          });
          return acc;
        }

        if (!acc[achievement.category]) {
          acc[achievement.category] = [];
        }
        acc[achievement.category].push(achievement);
        return acc;
      },
      {} as Record<string, Achievement[]>,
    ) || {};

  const unlockedCount =
    data?.achievements?.filter((a: Achievement) => a?.unlocked === true).length || 0;
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
    unlockedAchievements: data.achievements?.filter((a: Achievement) => a.unlocked).length || 0,
    completionPercentage: data.achievements?.length
      ? Math.round(
          (data.achievements.filter((a: Achievement) => a.unlocked).length /
            data.achievements.length) *
            100,
        )
      : 0,

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
