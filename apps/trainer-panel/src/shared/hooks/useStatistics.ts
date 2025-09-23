"use client";


import { createTrainerPanelLogger } from "@gafus/logger";
import { useData, useMutate } from "@gafus/react-query";

import { getCourseStatisticsCached } from "../lib/actions/cachedStatistics";
import { getStepStatisticsAction } from "../lib/actions/statistics";

import type { StatisticsData } from "../types/statistics";
import type { StepStats } from "@features/statistics/lib/statistics-steps";

// Создаем логгер для use-statistics
const logger = createTrainerPanelLogger('trainer-panel-use-statistics');

export function useCourseStatistics(userId: string, isElevated: boolean) {
  const cacheKey = `statistics:${userId}:${isElevated}`;

  return useData<StatisticsData>(
    cacheKey,
    async () => {
      // Не делаем запрос если userId пустой
      if (!userId) {
        return { courses: [], totalCourses: 0, totalDays: 0 } as StatisticsData;
      }

      const result = await getCourseStatisticsCached(userId, isElevated);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data as StatisticsData;
    },
    {
      refetchOnWindowFocus: false,
      staleTime: 30000, // 30 секунд
    },
  );
}

export function useStepStatistics(userId: string, isElevated: boolean) {
  const cacheKey = `step-statistics:${userId}:${isElevated}`;

  return useData<{ steps: StepStats[]; totalSteps: number }>(
    cacheKey,
    async () => {
      if (!userId) {
        logger.warn("useStepStatistics: no userId, returning empty", { operation: 'warn' });
        return { steps: [], totalSteps: 0 };
      }

      logger.warn("useStepStatistics: calling getStepStatisticsAction", { operation: 'warn' });
      try {
        const result = await getStepStatisticsAction(userId, isElevated);
        logger.warn("useStepStatistics: result received:", { result, operation: 'warn' });
        if (!result.success) {
          throw new Error(result.error);
        }
        return result.data || { steps: [], totalSteps: 0 };
      } catch (error) {
        logger.error("useStepStatistics: error:", error as Error, { operation: 'error' });
        throw error;
      }
    },
    {
      refetchOnWindowFocus: false,
      staleTime: 30000, // 30 секунд
    },
  );
}

export function useStatisticsMutation() {
  const { mutate } = useMutate();

  const invalidateStatistics = (userId: string, isElevated: boolean) => {
    const cacheKey = `statistics:${userId}:${isElevated}`;
    mutate(cacheKey);
  };

  return { invalidateStatistics };
}
