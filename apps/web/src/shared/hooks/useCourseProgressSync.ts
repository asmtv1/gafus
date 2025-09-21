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
      const isAssigned = courseAssignments[course.id] || false;

      // Если курс назначен, но статус не обновлен, обновляем его
      if (isAssigned && course.userStatus === TrainingStatus.NOT_STARTED) {
        return {
          ...course,
          userStatus: TrainingStatus.IN_PROGRESS
        };
      }

      // Если есть кэшированные данные, проверяем прогресс
      if (cachedData?.data?.trainingDays) {
        const completedDays = cachedData.data.trainingDays.filter(
          (day) => day.userStatus === TrainingStatus.COMPLETED
        ).length;
        
        const totalDays = cachedData.data.trainingDays.length;
        
        // Если все дни завершены, обновляем статус
        if (completedDays === totalDays && totalDays > 0 && course.userStatus !== TrainingStatus.COMPLETED) {
          return {
            ...course,
            userStatus: TrainingStatus.COMPLETED,
            completedAt: new Date()
          };
        }
        
        // Если есть прогресс, но статус не обновлен
        if (completedDays > 0 && course.userStatus === TrainingStatus.NOT_STARTED) {
          return {
            ...course,
            userStatus: TrainingStatus.IN_PROGRESS,
            startedAt: course.startedAt || new Date()
          };
        }
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
