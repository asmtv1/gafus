"use client";

import { useEffect, useMemo, useCallback, useRef } from "react";
import { useTrainingStore } from "@shared/stores/trainingStore";
import { useCourseStore } from "@shared/stores/courseStore";
import { TrainingStatus } from "@gafus/types";

/**
 * Хук для синхронизации данных прогресса курсов между stores
 */
export function useCourseProgressSync() {
  const { getCachedTrainingDays, courseAssignments } = useTrainingStore();
  const { allCourses, setAllCourses } = useCourseStore();
  const lastProcessedRef = useRef<string | null>(null);

  // Стабилизируем функции
  const isAssigned = useCallback((courseId: string) => courseAssignments[courseId] || false, [courseAssignments]);
  const getCachedData = useCallback((courseType: string) => getCachedTrainingDays(courseType), [getCachedTrainingDays]);

  // Синхронизируем данные курсов с актуальным прогрессом из trainingStore
  const syncedCourses = useMemo(() => {
    if (!allCourses?.data) return null;

    // Создаем ключ для отслеживания изменений
    const dataKey = JSON.stringify({
      courses: allCourses.data.map(c => ({ id: c.id, userStatus: c.userStatus })),
      assignments: Object.keys(courseAssignments).filter(id => courseAssignments[id]),
      cacheKeys: allCourses.data.map(c => {
        const cached = getCachedTrainingDays(c.type);
        return cached?.data ? `${c.type}-${cached.data.trainingDays.length}` : null;
      }).filter(Boolean)
    });

    // Если данные не изменились, возвращаем null
    if (lastProcessedRef.current === dataKey) {
      return null;
    }

    lastProcessedRef.current = dataKey;

    return allCourses.data.map(course => {
      // Получаем кэшированные данные дней тренировок
      const cachedData = getCachedTrainingDays(course.type);

      // Если есть кэшированные данные, проверяем прогресс
      if (cachedData?.data?.trainingDays) {
        const completedDays = cachedData.data.trainingDays.filter(
          (day) => day.userStatus === TrainingStatus.COMPLETED
        ).length;
        
        // Проверяем наличие реального прогресса (IN_PROGRESS или COMPLETED дней)
        const hasActiveProgress = cachedData.data.trainingDays.some(
          (day) => day.userStatus === TrainingStatus.IN_PROGRESS || day.userStatus === TrainingStatus.COMPLETED
        );
        
        const totalDays = cachedData.data.trainingDays.length;
        
        // Если все дни завершены, обновляем статус
        if (completedDays === totalDays && totalDays > 0 && course.userStatus !== TrainingStatus.COMPLETED) {
          return {
            ...course,
            userStatus: TrainingStatus.COMPLETED,
            completedAt: new Date()
          };
        }
        
        // Если есть реальный прогресс (не только назначение курса), но статус не обновлен
        if (hasActiveProgress && course.userStatus === TrainingStatus.NOT_STARTED) {
          return {
            ...course,
            userStatus: TrainingStatus.IN_PROGRESS,
            // startedAt устанавливается на сервере при реальном начале шага
            startedAt: course.startedAt || null
          };
        }
      }
      
      // Если курс уже помечен как завершенный, но кэшированные данные показывают 0 завершенных дней,
      // доверяем статусу курса (возможно, кэш устарел)
      if (course.userStatus === TrainingStatus.COMPLETED && (!cachedData?.data?.trainingDays || 
          cachedData.data.trainingDays.filter(day => day.userStatus === TrainingStatus.COMPLETED).length === 0)) {
        return course; // Возвращаем курс как есть, доверяя его статусу
      }

      return course;
    });
  }, [allCourses?.data, getCachedTrainingDays, courseAssignments]);

  // Обновляем данные в courseStore при изменении синхронизированных данных
  useEffect(() => {
    if (syncedCourses && syncedCourses !== allCourses?.data) {
      setAllCourses(syncedCourses, allCourses?.type);
    }
  }, [syncedCourses, allCourses?.data, allCourses?.type, setAllCourses]);

  return {
    syncedCourses: syncedCourses || allCourses?.data,
    isAssigned,
    getCachedData
  };
}
