"use client";

import { useCallback, useEffect, useState } from "react";

import { getTrainingDaysCached } from "../lib/actions/cachedCourses";
import { getTrainingDays } from "../lib/training/getTrainingDays";
import { useTrainingStore } from "../stores/trainingStore";

interface TrainingDaysData {
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
}

interface UseCachedTrainingDaysResult {
  data: TrainingDaysData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCachedTrainingDays(courseType: string): UseCachedTrainingDaysResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { getCachedTrainingDays, setCachedTrainingDays } = useTrainingStore();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Сначала проверяем кэш
      const cached = getCachedTrainingDays(courseType);
      
      if (cached.data && !cached.isExpired) {
        setLoading(false);
        return;
      }

      // Если кэш истек или отсутствует, загружаем с сервера
      
      let result;
      try {
        result = await getTrainingDaysCached(courseType);
      } catch (cachedError) {
        console.warn("[Cache] Cached function failed, trying direct function:", cachedError);
        // Fallback на прямую функцию
        const directResult = await getTrainingDays(courseType);
        result = { success: true, data: directResult };
      }

      if (result.success && result.data) {
        // Сохраняем в кэш
        setCachedTrainingDays(courseType, result.data);
      } else {
        throw new Error(result.error || "Ошибка загрузки дней тренировок");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Неизвестная ошибка";
      console.error("[Cache] Error fetching training days:", errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [courseType, getCachedTrainingDays, setCachedTrainingDays]);

  const refetch = useCallback(async () => {
    // Очищаем кэш и загружаем заново
    useTrainingStore.getState().clearCachedTrainingDays(courseType);
    await fetchData();
  }, [courseType, fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Получаем данные из кэша для отображения
  const cached = getCachedTrainingDays(courseType);
  const data = cached.data;

  return {
    data,
    loading,
    error,
    refetch,
  };
}
