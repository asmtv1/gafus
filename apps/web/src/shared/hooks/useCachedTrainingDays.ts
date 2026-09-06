"use client";

import type { UserCoursePersonalization, TrainingStatus } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";
import { reportClientError } from "@gafus/error-handling";
import { useCallback, useEffect, useState } from "react";

import { checkCourseAccessAction } from "@shared/server-actions/course";
import { getTrainingDays } from "../lib/training/getTrainingDays";
import { useTrainingStore } from "../stores/trainingStore";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

// Создаем логгер для use-cached-training-days
const logger = createWebLogger("web-use-cached-training-days");

export interface TrainingDaysData {
  trainingDays: {
    trainingDayId: string;
    dayOnCourseId: string;
    title: string;
    type: string;
    courseId: string;
    userStatus: TrainingStatus | string; // Принимаем оба типа для совместимости
    estimatedDuration?: number;
    theoryMinutes?: number;
    equipment?: string;
    isLocked?: boolean;
    showCoursePathExport?: boolean;
  }[];
  courseDescription: string | null;
  courseId: string | null;
  courseVideoUrl: string | null;
  courseIsPersonalized?: boolean;
  userCoursePersonalization?: UserCoursePersonalization | null;
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
  options: UseCachedTrainingDaysOptions = {},
): UseCachedTrainingDaysResult {
  const { initialData, initialError } = options;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { getCachedTrainingDays, setCachedTrainingDays } = useTrainingStore();

  // Сразу проверяем кэш для мгновенного отображения данных
  const _initialCached = getCachedTrainingDays(courseType);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Ошибка доступа (платный/приватный курс без прав) — не показываем кэш.
      if (initialError?.includes("COURSE_ACCESS_DENIED")) {
        useTrainingStore.getState().clearCachedTrainingDays(courseType);
        setError(initialError);
        setLoading(false);
        return;
      }

      // Приоритет 1: Если есть серверные данные — проверяем доступ на клиенте.
      if (initialData) {
        const { hasAccess } = await checkCourseAccessAction(courseType);
        if (!hasAccess) {
          useTrainingStore.getState().clearCachedTrainingDays(courseType);
          setError("COURSE_ACCESS_DENIED");
          setLoading(false);
          return;
        }
        logger.info("[Cache] Using initial server data", { courseType, operation: "info" });
        setCachedTrainingDays(courseType, initialData);
        setLoading(false);
        return;
      }

      // Приоритет 2: Проверяем краткий кэш trainingStore, чтобы не дублировать запрос.
      const cached = getCachedTrainingDays(courseType);
      if (cached.data && !cached.isExpired) {
        logger.info("[Cache] Using brief cache to prevent duplicate requests", {
          courseType,
          operation: "info",
        });
        setLoading(false);
        return;
      }

      if (initialError) {
        setError(initialError);
        setLoading(false);
        return;
      }

      const userId = await getCurrentUserId();
      const data = await getTrainingDays(courseType, userId);
      setCachedTrainingDays(courseType, data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Неизвестная ошибка";
      reportClientError(err instanceof Error ? err : new Error(errorMessage), {
        issueKey: "useCachedTrainingDays",
        keys: { operation: "fetch", courseType },
      });
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
    const hasTrainingDayId = cached.data.trainingDays.every(
      (day: unknown) => "trainingDayId" in (day as Record<string, unknown>),
    );
    if (hasTrainingDayId) {
      data = cached.data as TrainingDaysData;
    } else {
      // Если данные в старом формате, очищаем кэш и загружаем заново
      logger.warn("[Cache] Cached data is in old format, clearing cache", { operation: "warn" });
      useTrainingStore.getState().clearCachedTrainingDays(courseType);
    }
  }

  // При ошибке доступа (серверной или initial) не показываем кэшированные данные
  const isAccessDenied =
    error?.includes("COURSE_ACCESS_DENIED") || initialError?.includes("COURSE_ACCESS_DENIED");
  const dataToReturn = isAccessDenied ? null : data;
  const finalError = isAccessDenied ? initialError || error : dataToReturn ? null : error;
  const finalLoading = dataToReturn ? false : loading;

  return {
    data: dataToReturn,
    loading: finalLoading,
    error: finalError,
    refetch,
  };
}
