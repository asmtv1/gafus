"use client";

import { useCallback, useEffect, useState } from "react";

import { getTrainingDaysCached } from "../lib/actions/cachedCourses";
import { getTrainingDays } from "../lib/training/getTrainingDays";
import { useTrainingStore } from "../stores/trainingStore";
import { getCurrentUserId } from "@/utils";

interface TrainingDaysData {
  trainingDays: {
    trainingDayId: string;
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

interface UseCachedTrainingDaysOptions {
  initialData?: TrainingDaysData | null;
  initialError?: string | null;
}

interface UseCachedTrainingDaysResult {
  data: TrainingDaysData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCachedTrainingDays(
  courseType: string, 
  options: UseCachedTrainingDaysOptions = {}
): UseCachedTrainingDaysResult {
  const { initialData, initialError } = options;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { getCachedTrainingDays, setCachedTrainingDays } = useTrainingStore();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Если есть серверные данные, используем их
      if (initialData) {
        setCachedTrainingDays(courseType, initialData);
        setLoading(false);
        return;
      }

      // Если есть серверная ошибка, показываем её
      if (initialError) {
        setError(initialError);
        setLoading(false);
        return;
      }

      // Сначала проверяем кэш
      const cached = getCachedTrainingDays(courseType);
      
      if (cached.data && !cached.isExpired) {
        setLoading(false);
        return;
      }

      // Если кэш истек или отсутствует, загружаем с сервера
      let result;
      try {
        // Получаем userId для кэшированной функции
        const userId = await getCurrentUserId();
        result = await getTrainingDaysCached(courseType, userId);
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
  }, [courseType, initialData, initialError, getCachedTrainingDays, setCachedTrainingDays]);

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
  let data: TrainingDaysData | null = null;
  
  // Проверяем, что данные имеют правильный формат с trainingDayId
  if (cached.data && cached.data.trainingDays && cached.data.trainingDays.length > 0) {
    const hasTrainingDayId = cached.data.trainingDays.every((day: unknown) => 'trainingDayId' in (day as Record<string, unknown>));
    if (hasTrainingDayId) {
      data = cached.data as TrainingDaysData;
    } else {
      // Если данные в старом формате, очищаем кэш и загружаем заново
      console.warn("[Cache] Cached data is in old format, clearing cache");
      useTrainingStore.getState().clearCachedTrainingDays(courseType);
    }
  }

  return {
    data,
    loading,
    error,
    refetch,
  };
}
