"use client";


import { createWebLogger } from "@gafus/logger";
import { useCallback, useEffect, useState } from "react";

import { getTrainingDaysCached } from "../lib/actions/cachedCourses";
import { getTrainingDays } from "../lib/training/getTrainingDays";
import { useTrainingStore } from "../stores/trainingStore";
import { getCurrentUserId } from "@/utils";
import { getOfflineCourseByType } from "../lib/offline/offlineCourseStorage";
import { checkCourseUpdates } from "../lib/actions/offlineCourseActions";
import { isOnline } from "@shared/utils/offlineCacheUtils";

// Создаем логгер для use-cached-training-days
const logger = createWebLogger('web-use-cached-training-days');

interface TrainingDaysData {
  trainingDays: {
    trainingDayId: string;
    day: number;
    title: string;
    type: string;
    courseId: string;
    userStatus: string;
    estimatedDuration?: number;
    theoryMinutes?: number;
    equipment?: string;
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
  const [loading, setLoading] = useState(true); // Начинаем с loading=true, так как проверяем IndexedDB
  const [error, setError] = useState<string | null>(null);
  
  const { getCachedTrainingDays, setCachedTrainingDays } = useTrainingStore();
  
  // Сразу проверяем кэш для мгновенного отображения данных
  const initialCached = getCachedTrainingDays(courseType);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Приоритет 1: Проверяем IndexedDB (офлайн версия) - ВСЕГДА ПЕРВЫМ
      try {
        const offlineCourse = await getOfflineCourseByType(courseType);
        if (offlineCourse) {
          logger.info("[Offline] Loading course from IndexedDB", { courseType, operation: "info" });
          
          // Преобразуем офлайн данные в формат TrainingDaysData
          // Вычисляем estimatedDuration и theoryMinutes из шагов
          const offlineData: TrainingDaysData = {
            trainingDays: offlineCourse.course.trainingDays.map((day) => {
              // Вычисляем время из шагов
              let trainingSeconds = 0;
              let theoryExamSeconds = 0;

              for (const step of day.steps) {
                if (step.type === "TRAINING") {
                  trainingSeconds += step.durationSec ?? 0;
                } else if (step.type === "PRACTICE") {
                  trainingSeconds += step.estimatedDurationSec ?? 0;
                } else if (step.type !== "BREAK") {
                  theoryExamSeconds += step.estimatedDurationSec ?? 0;
                }
              }

              const estimatedDuration = Math.ceil(trainingSeconds / 60);
              const theoryMinutes = Math.ceil(theoryExamSeconds / 60);

              return {
                trainingDayId: day.id,
                day: day.order,
                title: day.title,
                type: day.type,
                courseId: offlineCourse.courseId,
                userStatus: "NOT_STARTED",
                estimatedDuration,
                theoryMinutes,
                equipment: day.equipment || "",
              };
            }),
            courseDescription: offlineCourse.course.metadata.description,
            courseId: offlineCourse.courseId,
            courseVideoUrl: offlineCourse.course.metadata.videoUrl,
          };

          setCachedTrainingDays(courseType, offlineData);
          logger.info("[Offline] Course loaded from IndexedDB", {
            courseType,
            daysCount: offlineData.trainingDays.length,
            operation: "info",
          });

          // Проверяем обновления в фоне (только если онлайн)
          if (isOnline()) {
            checkCourseUpdates(courseType, offlineCourse.version).then((updateResult) => {
              if (updateResult.success && updateResult.hasUpdates) {
                logger.info("[Offline] Course has updates available", { courseType, operation: "info" });
              }
            }).catch((err) => {
              logger.warn("[Offline] Failed to check course updates", {
                error: err instanceof Error ? err.message : String(err),
                courseType,
                operation: "warn",
              });
            });
          }

          setLoading(false);
          return;
        }
      } catch (offlineError) {
        logger.warn("[Offline] Failed to load from IndexedDB", {
          error: offlineError instanceof Error ? offlineError.message : String(offlineError),
          courseType,
          operation: "warn",
        });
      }

      // Приоритет 2: Если есть серверные данные, используем их (только если онлайн)
      // Серверные данные имеют приоритет над кратким кэшем для актуальности
      if (initialData && isOnline()) {
        logger.info("[Cache] Using initial server data", { courseType, operation: "info" });
        // Сохраняем в краткий кэш для предотвращения дублирующих запросов
        setCachedTrainingDays(courseType, initialData);
        setLoading(false);
        return;
      }

      // Приоритет 3: Проверяем краткий кэш trainingStore (только для предотвращения дублирующих запросов)
      // Используется только если нет серверных данных и мы онлайн
      if (isOnline()) {
        const cached = getCachedTrainingDays(courseType);
        
        if (cached.data && !cached.isExpired) {
          logger.info("[Cache] Using brief cache to prevent duplicate requests", { courseType, operation: "info" });
          setLoading(false);
          return;
        }
      }

      // Если есть серверная ошибка и мы офлайн, игнорируем её (используем офлайн данные)
      if (initialError && !isOnline()) {
        logger.warn("[Cache] Server error in offline mode, ignoring", { courseType, error: initialError, operation: "warn" });
        // Продолжаем - возможно есть офлайн данные в кэше
      } else if (initialError) {
        // Если онлайн и есть ошибка - показываем её
        setError(initialError);
        setLoading(false);
        return;
      }

      // Приоритет 4: Загружаем с сервера (только если онлайн)
      if (isOnline()) {
        let result;
        try {
          const userId = await getCurrentUserId();
          result = await getTrainingDaysCached(courseType, userId);
        } catch (cachedError) {
          logger.warn("[Cache] Cached function failed, trying direct function:", { cachedError, operation: 'warn' });
          try {
            const directResult = await getTrainingDays(courseType);
            result = { success: true, data: directResult };
          } catch (directError) {
            logger.error("[Cache] Both cached and direct functions failed", directError as Error, { courseType, operation: 'error' });
            throw directError;
          }
        }

        if (result.success && result.data) {
          setCachedTrainingDays(courseType, result.data);
        } else {
          throw new Error(result.error || "Ошибка загрузки дней тренировок");
        }
      } else {
        // Офлайн и нет данных - показываем ошибку
        throw new Error("Нет подключения к интернету и курс не скачан для офлайн-доступа");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Неизвестная ошибка";
      logger.error("[Cache] Error fetching training days:", err instanceof Error ? err : new Error(errorMessage), { operation: 'error' });
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
      logger.warn("[Cache] Cached data is in old format, clearing cache", { operation: 'warn' });
      useTrainingStore.getState().clearCachedTrainingDays(courseType);
    }
  }

  // Если есть данные в кэше, не показываем ошибку даже если она была
  // Это позволяет избежать мигания ошибки при загрузке офлайн данных
  const finalError = data ? null : error;
  const finalLoading = data ? false : loading; // Если данные есть, не показываем loading

  return {
    data,
    loading: finalLoading,
    error: finalError,
    refetch,
  };
}
