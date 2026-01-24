"use client";

import { createWebLogger } from "@gafus/logger";
import { useMemo, useEffect } from "react";
import { useData, useQueryClient } from "@gafus/react-query";
import { useCourseStore } from "@shared/stores/courseStore";
import { useStepStore } from "@shared/stores/stepStore";
import { useCourseProgressSync } from "@shared/hooks/useCourseProgressSync";
import { calculateAchievementsFromStores } from "@shared/lib/achievements/calculateAchievements";
import { getUserTrainingDates } from "@shared/lib/achievements/getUserTrainingDates";
import { isOnline } from "@shared/utils/offlineCacheUtils";
import type { AchievementData } from "@gafus/types";

// Создаем логгер для use-achievements-from-stores
const logger = createWebLogger("web-use-achievements-from-stores");

/**
 * Хук для получения данных достижений из локальных stores
 * Использует данные из courseStore, stepStore и trainingStore
 * Также получает реальные даты занятий из БД для правильного подсчета серий
 */
export function useAchievementsFromStores() {
  const { allCourses } = useCourseStore();
  const { syncedCourses, getCachedData } = useCourseProgressSync();
  const stepStates = useStepStore((state) => state.stepStates);
  const getStepKey = useStepStore((state) => state.getStepKey);

  // Кэшируем даты занятий на клиенте через React Query
  // Данные кэшируются на 5 минут и не обновляются при фокусе окна
  const { data: trainingDates = [], isLoading: isLoadingDates } = useData<Date[]>(
    "user:training-dates",
    async () => {
      try {
        return await getUserTrainingDates();
      } catch (error) {
        logger.error("Ошибка загрузки дат занятий", error as Error);
        return [];
      }
    },
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 5 * 60 * 1000, // 5 минут - данные не часто меняются
      gcTime: 30 * 60 * 1000, // 30 минут - храним в кэше
      networkMode: "offlineFirst", // Используем кэш при офлайне
      retry: (failureCount, error) => {
        if (!isOnline()) return false;
        if (error instanceof Error && error.message.includes("fetch")) {
          return failureCount < 2;
        }
        return failureCount < 3;
      },
    },
  );

  // Слушаем события инвалидации кэша и обновляем данные при обновлении прогресса
  const queryClient = useQueryClient();
  useEffect(() => {
    const handleInvalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["user:training-dates"] });
      logger.info("[Cache] Invalidated training dates cache from event", { operation: "info" });
    };

    window.addEventListener("invalidate-training-dates-cache", handleInvalidate);
    return () => {
      window.removeEventListener("invalidate-training-dates-cache", handleInvalidate);
    };
  }, [queryClient]);

  const achievementData = useMemo((): AchievementData | null => {
    // Используем синхронизированные курсы или данные из courseStore
    const courses = syncedCourses || allCourses?.data;

    if (!courses || courses.length === 0) {
      return null;
    }

    // Получаем кэшированные данные дней тренировок из trainingStore
    const cachedTrainingData: Record<
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
    > = {};

    courses.forEach((course) => {
      const cached = getCachedData(course.type);
      if (cached.data && !cached.isExpired) {
        cachedTrainingData[course.id] = cached.data;
      }
    });

    // Вычисляем достижения из stores с реальными датами занятий для серий
    const data = calculateAchievementsFromStores(
      courses,
      stepStates,
      getStepKey,
      cachedTrainingData,
      trainingDates,
    );

    // Добавляем логирование для отладки
    if (process.env.NODE_ENV === "development") {
      logger.info("[useAchievementsFromStores] Calculated data:", {
        totalCourses: data.totalCourses,
        completedCourses: data.completedCourses,
        inProgressCourses: data.inProgressCourses,
        totalCompletedDays: data.totalCompletedDays,
        totalDays: data.totalDays,
        overallProgress: data.overallProgress,
        currentStreak: data.currentStreak,
        longestStreak: data.longestStreak,
        achievementsLength: data.achievements.length,
        unlockedAchievements: data.achievements.filter((a) => a.unlocked, { operation: "info" })
          .length,
      });
    }

    return data;
  }, [syncedCourses, allCourses?.data, stepStates, getStepKey, getCachedData, trainingDates]);

  return {
    data: achievementData,
    error: null,
    isLoading: isLoadingDates,
  };
}

/**
 * Хук для получения достижений по категориям из stores
 */
export function useAchievementsByCategoryFromStores() {
  const { data, error, isLoading } = useAchievementsFromStores();

  const achievementsByCategory = useMemo(() => {
    if (!data?.achievements) return {};

    return data.achievements.reduce(
      (acc, achievement) => {
        if (!achievement || !achievement.category) {
          return acc;
        }

        if (!acc[achievement.category]) {
          acc[achievement.category] = [];
        }
        acc[achievement.category].push(achievement);
        return acc;
      },
      {} as Record<string, typeof data.achievements>,
    );
  }, [data?.achievements, data]);

  const unlockedCount = data?.achievements?.filter((a) => a?.unlocked === true).length || 0;
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
