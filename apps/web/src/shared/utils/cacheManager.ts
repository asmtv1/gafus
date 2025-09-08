"use client";

import { useMutate } from "@gafus/react-query";
import { TrainingStatus } from "@gafus/types";
import { useStepStore } from "@shared/stores/stepStore";

import type { CourseWithProgressData } from "@gafus/types";

/**
 * Централизованный менеджер кэша для обновления всех уровней кэширования
 * при изменении прогресса пользователя
 */
export function useCacheManager() {
  const { mutate } = useMutate();
  const { stepStates, updateStepStatus } = useStepStore();

  /**
   * Обновляет кэш на всех уровнях при изменении статуса шага
   */
  const updateStepProgress = (
    courseId: string,
    day: number,
    stepIndex: number,
    stepStatus: TrainingStatus
  ) => {
    // console.log(`[CacheManager] Updating step progress: ${courseId}-${day}-${stepIndex} -> ${stepStatus}`);

    // 1. Обновляем локальный стейт шага
    updateStepStatus(courseId, day, stepIndex, stepStatus);

    // 2. Вычисляем новый статус дня на основе всех шагов
    const _newDayStatus = calculateDayStatus(courseId, day, stepStates);

    // 3. Вычисляем новый статус курса на основе всех дней
    const newCourseStatus = calculateCourseStatus(courseId, stepStates);

    // 4. Обновляем кэш курсов в React Query
    updateCoursesCache(courseId, newCourseStatus, day, stepIndex, stepStatus);

    // console.log(`[CacheManager] Updated: day=${newDayStatus}, course=${newCourseStatus}`);
  };

  /**
   * Вычисляет статус дня на основе статусов всех шагов
   */
  const calculateDayStatus = (courseId: string, day: number, stepStates: Record<string, { status?: string }>) => {
    const stepKeys = Object.keys(stepStates).filter((key) =>
      key.startsWith(`${courseId}-${day}-`)
    );

    if (stepKeys.length === 0) return TrainingStatus.NOT_STARTED;

    const stepStatuses = stepKeys.map((key) => stepStates[key]?.status || TrainingStatus.NOT_STARTED);

    // Если все шаги завершены - день завершен
    if (stepStatuses.every((status) => status === TrainingStatus.COMPLETED)) {
      return TrainingStatus.COMPLETED;
    }

    // Если хотя бы один шаг в процессе - день в процессе
    if (stepStatuses.some((status) => status === TrainingStatus.IN_PROGRESS)) {
      return TrainingStatus.IN_PROGRESS;
    }

    // Иначе день не начат
    return TrainingStatus.NOT_STARTED;
  };

  /**
   * Вычисляет статус курса на основе статусов всех дней
   */
  const calculateCourseStatus = (courseId: string, stepStates: Record<string, { status?: string }>) => {
    // Получаем все уникальные дни для данного курса
    const dayKeys = new Set<string>();
    Object.keys(stepStates).forEach((key) => {
      if (key.startsWith(`${courseId}-`)) {
        const parts = key.split('-');
        if (parts.length >= 3) {
          dayKeys.add(`${courseId}-${parts[1]}`);
        }
      }
    });

    if (dayKeys.size === 0) return TrainingStatus.NOT_STARTED;

    const dayStatuses = Array.from(dayKeys).map((dayKey) => {
      const day = parseInt(dayKey.split('-')[1]);
      return calculateDayStatus(courseId, day, stepStates);
    });

    // Если все дни завершены - курс завершен
    if (dayStatuses.every((status) => status === TrainingStatus.COMPLETED)) {
      return TrainingStatus.COMPLETED;
    }

    // Если хотя бы один день в процессе - курс в процессе
    if (dayStatuses.some((status) => status === TrainingStatus.IN_PROGRESS || status === TrainingStatus.COMPLETED)) {
      return TrainingStatus.IN_PROGRESS;
    }

    // Иначе курс не начат
    return TrainingStatus.NOT_STARTED;
  };

  /**
   * Обновляет кэш курсов в React Query
   */
  const updateCoursesCache = (
    courseId: string,
    courseStatus: TrainingStatus,
    day: number,
    stepIndex: number,
    stepStatus: TrainingStatus
  ) => {
    // Обновляем кэш всех курсов
    mutate("courses:all", (oldData: CourseWithProgressData[] | undefined) => {
      if (!oldData) return oldData;
      
      return oldData.map(course => {
        if (course.id !== courseId) return course;
        
        return {
          ...course,
          userStatus: courseStatus,
          // Обновляем startedAt если курс только начался
          startedAt: course.startedAt || (stepStatus === TrainingStatus.IN_PROGRESS ? new Date() : course.startedAt),
          // Обновляем completedAt если курс завершен
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });
    });

    // Обновляем кэш избранных курсов
    mutate("courses:favorites", (oldData: CourseWithProgressData[] | undefined) => {
      if (!oldData) return oldData;
      
      return oldData.map(course => {
        if (course.id !== courseId) return course;
        
        return {
          ...course,
          userStatus: courseStatus,
          startedAt: course.startedAt || (stepStatus === TrainingStatus.IN_PROGRESS ? new Date() : course.startedAt),
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });
    });

    // Обновляем кэш созданных курсов
    mutate("courses:authored", (oldData: CourseWithProgressData[] | undefined) => {
      if (!oldData) return oldData;
      
      return oldData.map(course => {
        if (course.id !== courseId) return course;
        
        return {
          ...course,
          userStatus: courseStatus,
          startedAt: course.startedAt || (stepStatus === TrainingStatus.IN_PROGRESS ? new Date() : course.startedAt),
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });
    });

    // Инвалидируем достижения при изменении прогресса
    mutate("user:achievements");
  };

  return {
    updateStepProgress,
    calculateDayStatus,
    calculateCourseStatus,
  };
}
