"use client";

import { useEffect, useMemo, useCallback, useRef } from "react";
import { useTrainingStore } from "@shared/stores/trainingStore";
import { useCourseStore } from "@shared/stores/courseStore";
import { useStepStore } from "@shared/stores/stepStore";
import { useOfflineStore } from "@shared/stores/offlineStore";
import { TrainingStatus } from "@gafus/types";
import { calculateDayStatus } from "@gafus/core/utils/training";

/**
 * Хук для синхронизации данных прогресса курсов между stores
 */
export function useCourseProgressSync() {
  const { getCachedTrainingDays, courseAssignments } = useTrainingStore();
  const { allCourses, setAllCourses } = useCourseStore();
  const stepStates = useStepStore((state) => state.stepStates);
  const isOnline = useOfflineStore((state) => state.isOnline);
  const lastProcessedRef = useRef<string | null>(null);
  const lastUpdateRef = useRef<string | null>(null);

  // Стабилизируем функции
  const isAssigned = useCallback((courseId: string) => courseAssignments[courseId] || false, [courseAssignments]);
  const getCachedData = useCallback((courseType: string) => getCachedTrainingDays(courseType), [getCachedTrainingDays]);

  // Функция для сравнения статусов (как в TrainingDayList)
  const rank = useCallback((s?: string) => {
    if (s === "COMPLETED") return 2;
    if (s === "IN_PROGRESS" || s === "PAUSED") return 1;
    return 0; // NOT_STARTED или неизвестно
  }, []);

  // Синхронизируем данные курсов с актуальным прогрессом из trainingStore
  const syncedCourses = useMemo(() => {
    if (!allCourses?.data) return null;

    // Создаем ключ для отслеживания изменений
    const stepStatesKeys = Object.keys(stepStates).sort().join(',');
    const dataKey = JSON.stringify({
      courses: allCourses.data.map(c => ({ id: c.id, userStatus: c.userStatus })),
      assignments: Object.keys(courseAssignments).filter(id => courseAssignments[id]),
      cacheKeys: allCourses.data.map(c => {
        const cached = getCachedTrainingDays(c.type);
        return cached?.data ? `${c.type}-${cached.data.trainingDays.length}` : null;
      }).filter(Boolean),
      isOnline,
      stepStatesKeys
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
        // Рассчитываем финальные статусы дней с учетом офлайн режима
        const trainingDays = cachedData.data.trainingDays;
        const dayStatuses = trainingDays.map((day) => {
          let finalStatus = day.userStatus as TrainingStatus;

          // В офлайне используем stepStore для расчета локального статуса
          if (!isOnline) {
            // Находим dayLink для получения количества шагов по индексу
            const dayIndex = trainingDays.findIndex((d) => d.dayOnCourseId === day.dayOnCourseId);
            const dayLink = course.dayLinks?.[dayIndex];
            const totalSteps = dayLink?.day?.stepLinks?.length;

            if (totalSteps !== undefined) {
              // Рассчитываем локальный статус дня из stepStore
              const localStatus = calculateDayStatus(course.id, day.dayOnCourseId, stepStates, totalSteps);
              // Объединяем с серверным статусом (берем максимальный приоритет)
              finalStatus = rank(localStatus) > rank(day.userStatus) ? localStatus : (day.userStatus as TrainingStatus);
            }
          }

          return {
            ...day,
            finalStatus,
          };
        });

        const completedDays = dayStatuses.filter(
          (day) => day.finalStatus === TrainingStatus.COMPLETED
        ).length;
        
        // Проверяем наличие реального прогресса (IN_PROGRESS или COMPLETED дней)
        const hasActiveProgress = dayStatuses.some(
          (day) => day.finalStatus === TrainingStatus.IN_PROGRESS || day.finalStatus === TrainingStatus.COMPLETED
        );
        
        const totalDays = dayStatuses.length;
        
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
      
      // ДОБАВЛЕНО: Проверяем stepStore даже без cachedData
      // Это позволяет обновлять статус курса на странице списка курсов
      if (!cachedData?.data?.trainingDays) {
        // Проверяем есть ли шаги в stepStore для этого курса
        const courseStepKeys = Object.keys(stepStates).filter(key => 
          key.startsWith(`${course.id}-`)
        );
        
        if (courseStepKeys.length > 0) {
          // Проверяем есть ли активные шаги (IN_PROGRESS, PAUSED, COMPLETED)
          const hasActiveSteps = courseStepKeys.some(key => {
            const status = stepStates[key]?.status;
            return status === TrainingStatus.IN_PROGRESS || 
                   status === "PAUSED" || 
                   status === TrainingStatus.COMPLETED;
          });
          
          // Если есть активные шаги, но курс помечен как NOT_STARTED
          if (hasActiveSteps && course.userStatus === TrainingStatus.NOT_STARTED) {
            return {
              ...course,
              userStatus: TrainingStatus.IN_PROGRESS,
              startedAt: course.startedAt || null
            };
          }
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
  }, [allCourses?.data, getCachedTrainingDays, courseAssignments, stepStates, isOnline, rank]);

  // Обновляем данные в courseStore при изменении синхронизированных данных
  useEffect(() => {
    if (syncedCourses && allCourses?.data) {
      // Создаем ключ для отслеживания уже примененных обновлений
      const syncedKey = syncedCourses.map(c => `${c.id}:${c.userStatus}`).join('|');
      
      // Если это обновление уже было применено, пропускаем
      if (lastUpdateRef.current === syncedKey) {
        return;
      }

      // Проверяем, действительно ли данные изменились
      const hasChanges = syncedCourses.some((syncedCourse, index) => {
        const originalCourse = allCourses.data[index];
        if (!originalCourse) return true;
        
        // Проверяем только критические изменения
        const statusChanged = syncedCourse.userStatus !== originalCourse.userStatus;
        const idChanged = syncedCourse.id !== originalCourse.id;
        
        return statusChanged || idChanged;
      });

      // Дополнительная проверка: сравниваем строковое представление для предотвращения циклов
      const originalKey = allCourses.data.map(c => `${c.id}:${c.userStatus}`).join('|');
      
      if (hasChanges && syncedKey !== originalKey) {
        lastUpdateRef.current = syncedKey;
        setAllCourses(syncedCourses, allCourses.type);
      }
    }
  }, [syncedCourses, allCourses?.data, allCourses?.type, setAllCourses]);

  return {
    syncedCourses: syncedCourses || allCourses?.data,
    isAssigned,
    getCachedData
  };
}
