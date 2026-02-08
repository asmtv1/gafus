"use client";

import type { UserCoursePersonalization, TrainingStatus } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";
import { useCallback, useEffect, useState } from "react";

import { checkCourseAccessAction } from "@shared/server-actions/course";
import { getTrainingDays } from "../lib/training/getTrainingDays";
import { useTrainingStore } from "../stores/trainingStore";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { getOfflineCourseByType } from "../lib/offline/offlineCourseStorage";
import { checkCourseUpdates } from "../lib/actions/offlineCourseActions";
import { isOnline } from "@shared/utils/offlineCacheUtils";

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
  const [loading, setLoading] = useState(true); // Начинаем с loading=true, так как проверяем IndexedDB
  const [error, setError] = useState<string | null>(null);

  const { getCachedTrainingDays, setCachedTrainingDays } = useTrainingStore();

  // Сразу проверяем кэш для мгновенного отображения данных
  const initialCached = getCachedTrainingDays(courseType);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Ошибка доступа (платный/приватный курс без прав) — не показываем кэш и офлайн
      if (initialError?.includes("COURSE_ACCESS_DENIED")) {
        useTrainingStore.getState().clearCachedTrainingDays(courseType);
        setError(initialError);
        setLoading(false);
        return;
      }

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
                } else if (step.type === "DIARY") {
                  // DIARY не учитывается в расчётах времени
                } else if (step.type !== "BREAK") {
                  theoryExamSeconds += step.estimatedDurationSec ?? 0;
                }
              }

              const estimatedDuration = Math.ceil(trainingSeconds / 60);
              const theoryMinutes = Math.ceil(theoryExamSeconds / 60);

              return {
                trainingDayId: day.id,
                dayOnCourseId: day.id,
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
            courseIsPersonalized: false,
            userCoursePersonalization: null,
          };

          setCachedTrainingDays(courseType, offlineData);
          logger.info("[Offline] Course loaded from IndexedDB", {
            courseType,
            daysCount: offlineData.trainingDays.length,
            operation: "info",
          });

          // Проверяем обновления в фоне (только если онлайн)
          if (isOnline()) {
            checkCourseUpdates(courseType, offlineCourse.version)
              .then((updateResult) => {
                if (updateResult.success && updateResult.hasUpdates) {
                  logger.info("[Offline] Course has updates available", {
                    courseType,
                    operation: "info",
                  });
                }
              })
              .catch((err) => {
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

      // Приоритет 2: Если есть серверные данные — проверяем доступ на клиенте (страховка от кэша RSC)
      if (initialData && isOnline()) {
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

      // Приоритет 3: Проверяем краткий кэш trainingStore (только для предотвращения дублирующих запросов)
      // Используется только если нет серверных данных и мы онлайн
      if (isOnline()) {
        const cached = getCachedTrainingDays(courseType);

        if (cached.data && !cached.isExpired) {
          logger.info("[Cache] Using brief cache to prevent duplicate requests", {
            courseType,
            operation: "info",
          });
          setLoading(false);
          return;
        }
      }

      // Если есть серверная ошибка и мы офлайн, игнорируем её (используем офлайн данные)
      if (initialError && !isOnline()) {
        logger.warn("[Cache] Server error in offline mode, ignoring", {
          courseType,
          error: initialError,
          operation: "warn",
        });
        // Продолжаем - возможно есть офлайн данные в кэше
      } else if (initialError) {
        // Если онлайн и есть ошибка - показываем её
        setError(initialError);
        setLoading(false);
        return;
      }

      // Приоритет 4: Загружаем с сервера (только если онлайн)
      if (isOnline()) {
        const userId = await getCurrentUserId();
        const data = await getTrainingDays(courseType, userId);
        setCachedTrainingDays(courseType, data);
      } else {
        // Офлайн и нет данных - показываем ошибку
        throw new Error("Нет подключения к интернету и курс не скачан для офлайн-доступа");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Неизвестная ошибка";
      logger.error(
        "[Cache] Error fetching training days:",
        err instanceof Error ? err : new Error(errorMessage),
        { operation: "error" },
      );
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
