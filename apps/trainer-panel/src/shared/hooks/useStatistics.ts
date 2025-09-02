"use client";

import { useData, useMutate } from "@gafus/react-query";

import { getCourseStatisticsCached } from "../lib/actions/cachedStatistics";

import type { StatisticsData } from "../types/statistics";

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

export function useStatisticsMutation() {
  const { mutate } = useMutate();

  const invalidateStatistics = (userId: string, isElevated: boolean) => {
    const cacheKey = `statistics:${userId}:${isElevated}`;
    mutate(cacheKey);
  };

  return { invalidateStatistics };
}
