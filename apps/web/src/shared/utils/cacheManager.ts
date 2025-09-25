"use client";

import { TrainingStatus, type CourseWithProgressData } from "@gafus/types";
import { useStepStore } from "@shared/stores/stepStore";
import { useCourseStore } from "@shared/stores/courseStore";
import { useUserStore } from "@shared/stores/userStore";
import { calculateDayStatus as calcDay, calculateCourseStatus as calcCourse } from "@shared/utils/trainingCalculations";
import { createWebLogger } from "@gafus/logger";

// Создаем логгер для cache manager
const logger = createWebLogger('web-cache-manager');

// Утилиты для работы с временем
const nowSec = () => Math.floor(Date.now() / 1000);
const makeEndKey = (courseId: string, day: number, idx: number) =>
  `training-${courseId}-${day}-${idx}-end`;

// CourseWithProgressData больше не импортируется, так как используется только в courseStore

/**
 * Централизованный менеджер кэша для обновления всех уровней кэширования
 * при изменении прогресса пользователя
 */
export function useCacheManager() {
  const { stepStates, updateStepStatus } = useStepStore();
  const courseStore = useCourseStore();
  const { user } = useUserStore();

  /**
   * Обновляет кэш на всех уровнях при изменении статуса шага
   */
  const updateStepProgress = (
    courseId: string,
    day: number,
    stepIndex: number,
    stepStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED',
    durationSec?: number,
    totalSteps?: number
  ) => {
    logger.info(`[CacheManager] Updating step progress`, {
      operation: 'update_step_progress',
      courseId: courseId,
      day: day,
      stepIndex: stepIndex,
      stepStatus: stepStatus
    });

    // 1. Обновляем локальный стейт шага
    if (stepStatus === 'IN_PROGRESS' && durationSec) {
      // При запуске шага создаем полное состояние через setState
      const stepKey = `${courseId}-${day}-${stepIndex}`;
      const endTs = nowSec() + durationSec;
      
      // Сохраняем endTs в localStorage для таймера
      if (typeof window !== 'undefined') {
        localStorage.setItem(makeEndKey(courseId, day, stepIndex), endTs.toString());
      }
      
      useStepStore.setState((state) => ({
        stepStates: {
          ...state.stepStates,
          [stepKey]: {
            timeLeft: durationSec,
            isFinished: false,
            isPaused: false,
            status: stepStatus,
          },
        },
      }));
    } else if (stepStatus === 'IN_PROGRESS') {
      // Возобновление: используем резюм из stepStore, который корректно выставляет endTs
      const { resumeStep } = useStepStore.getState();
      resumeStep(courseId, day, stepIndex);
    } else if (stepStatus === 'PAUSED') {
      // Пауза: используем pauseStep для корректной записи в LS
      const { pauseStep } = useStepStore.getState();
      pauseStep(courseId, day, stepIndex);
    } else if (stepStatus === 'COMPLETED') {
      // Завершение: используем finishStep для очистки ключей и времени
      const { finishStep } = useStepStore.getState();
      finishStep(courseId, day, stepIndex);
    } else {
      // Прочие обновления только статусом
      updateStepStatus(courseId, day, stepIndex, stepStatus);
    }

    // 2. Получаем актуальные stepStates после обновления
    const currentStepStates = useStepStore.getState().stepStates;

    // 3. Вычисляем новый статус дня на основе всех шагов
    const newDayStatus = totalSteps !== undefined 
      ? calcDay(courseId, day, currentStepStates, totalSteps)
      : calcDay(courseId, day, currentStepStates);

    // 4. Вычисляем новый статус курса на основе всех дней
    // Получаем общее количество дней из данных курса
    const courseStore = useCourseStore.getState();
    const allCourses = courseStore.allCourses?.data || [];
    const serverCourse = allCourses.find(c => c.id === courseId);
    const totalDays = serverCourse?.dayLinks?.length;
    const newCourseStatus = calcCourse(courseId, currentStepStates, totalDays);

    // 5. Обновляем кэш курсов в courseStore
    updateCoursesCache(courseId, newCourseStatus, day, stepIndex, stepStatus as 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED');

    logger.info(`[CacheManager] Updated`, {
      operation: 'cache_manager_updated',
      day: newDayStatus,
      course: newCourseStatus
    });
  };

  /**
   * Вычисляет статус дня на основе статусов всех шагов
   */
  const calculateDayStatus = (courseId: string, day: number, stepStates: Record<string, { status?: string }>) => {
    return calcDay(courseId, day, stepStates);
  };

  /**
   * Вычисляет статус курса на основе статусов всех дней
   */
  const calculateCourseStatus = (courseId: string, stepStates: Record<string, { status?: string }>, totalDaysInCourse?: number) => {
    return calcCourse(courseId, stepStates, totalDaysInCourse);
  };

  /**
   * Обновляет кэш курсов в courseStore
   */
  const updateCoursesCache = (
    courseId: string,
    courseStatus: TrainingStatus,
    day: number,
    stepIndex: number,
    stepStatus: string
  ) => {
    logger.info(`[CacheManager] updateCoursesCache`, {
      operation: 'update_courses_cache',
      courseId: courseId,
      courseStatus: courseStatus,
      day: day,
      stepIndex: stepIndex,
      stepStatus: stepStatus
    });
    
    // Обновляем все курсы в courseStore
    if (courseStore.allCourses?.data) {
      logger.info(`[CacheManager] Updating allCourses`, {
        operation: 'updating_all_courses',
        coursesCount: courseStore.allCourses.data.length
      });
      const updatedCourses = courseStore.allCourses.data.map(course => {
        if (course.id !== courseId) return course;
        
        logger.info(`[CacheManager] Updating course`, {
          operation: 'updating_course',
          courseId: courseId,
          courseName: course.name,
          oldStatus: course.userStatus,
          newStatus: courseStatus
        });
        return {
          ...course,
          userStatus: courseStatus,
          // Обновляем startedAt если курс только начался
          startedAt: course.startedAt || (stepStatus === 'IN_PROGRESS' ? new Date() : course.startedAt),
          // Обновляем completedAt если курс завершен
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });
      
      courseStore.setAllCourses(updatedCourses, courseStore.allCourses.type);
      logger.info(`[CacheManager] Updated allCourses successfully`, {
        operation: 'updated_all_courses_successfully'
      });
    } else {
      logger.info(`[CacheManager] No allCourses data to update`, {
        operation: 'no_all_courses_data'
      });
    }

    // Обновляем избранные курсы в courseStore
    if (courseStore.favorites?.data) {
      logger.info(`[CacheManager] Updating favorites`, {
        operation: 'updating_favorites',
        favoritesCount: courseStore.favorites.data.length
      });
      const updatedFavorites = courseStore.favorites.data.map(course => {
        if (course.id !== courseId) return course;
        
        logger.info(`[CacheManager] Updating favorite course`, {
          operation: 'updating_favorite_course',
          courseId: courseId,
          courseName: course.name,
          oldStatus: course.userStatus,
          newStatus: courseStatus
        });
        return {
          ...course,
          userStatus: courseStatus,
          startedAt: course.startedAt || (stepStatus === 'IN_PROGRESS' ? new Date() : course.startedAt),
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });
      
      courseStore.setFavorites(updatedFavorites);
      logger.info(`[CacheManager] Updated favorites successfully`, {
        operation: 'updated_favorites_successfully'
      });
    } else {
      logger.info(`[CacheManager] No favorites data to update`, {
        operation: 'no_favorites_data'
      });
    }

    // Обновляем созданные курсы в courseStore (только для тренеров)
    if (courseStore.authored) {
      logger.info(`[CacheManager] Updating authored`, {
        operation: 'updating_authored',
        authoredCount: courseStore.authored.length
      });
      const updatedAuthored = courseStore.authored.map(course => {
        if (course.id !== courseId) return course;
        
        logger.info(`[CacheManager] Updating authored course`, {
          operation: 'updating_authored_course',
          courseId: courseId,
          courseName: course.name,
          oldStatus: course.userStatus,
          newStatus: courseStatus
        });
        return {
          ...course,
          userStatus: courseStatus,
          startedAt: course.startedAt || (stepStatus === 'IN_PROGRESS' ? new Date() : course.startedAt),
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });
      
      courseStore.setAuthored(updatedAuthored);
      logger.info(`[CacheManager] Updated authored successfully`, {
        operation: 'updated_authored_successfully'
      });
    } else {
      // Показываем предупреждение только для тренеров
      if (user?.role === 'TRAINER') {
        logger.info(`[CacheManager] No authored data to update`, {
          operation: 'no_authored_data',
          userRole: user.role
        });
      }
    }

    // Инвалидация React Query кэша теперь происходит в server actions
    // Это убирает дублирование и предотвращает race conditions
  };

  /**
   * Синхронизирует courseStore с актуальными данными из stepStore
   * Вызывается при загрузке страницы для восстановления офлайн-изменений
   */
  const syncCourseStoreWithStepStates = () => {
    const allStepStates = stepStates;
    const courseStore = useCourseStore.getState();
    
    // Получаем все уникальные курсы из stepStates
    const courseIds = new Set<string>();
    Object.keys(allStepStates).forEach((key) => {
      const parts = key.split('-');
      if (parts.length >= 2) {
        courseIds.add(parts[0]);
      }
    });

  // Обновляем каждый курс на основе актуальных stepStates
  courseIds.forEach((courseId) => {
    // Получаем информацию о курсе для определения количества дней
    let totalDaysInCourse: number | undefined;
    
    // Ищем курс в allCourses
    if (courseStore.allCourses?.data) {
      const course = courseStore.allCourses.data.find(c => c.id === courseId);
      if (course) {
        totalDaysInCourse = course.dayLinks.length;
      }
    }
    
    // Если не нашли в allCourses, ищем в favorites
    if (!totalDaysInCourse && courseStore.favorites?.data) {
      const course = courseStore.favorites.data.find(c => c.id === courseId);
      if (course) {
        totalDaysInCourse = course.dayLinks.length;
      }
    }
    
    // Если не нашли в favorites, ищем в authored
    if (!totalDaysInCourse && courseStore.authored) {
      const course = courseStore.authored.find(c => c.id === courseId);
      if (course) {
        totalDaysInCourse = course.dayLinks.length;
      }
    }
    
    const courseStatus = calculateCourseStatus(courseId, allStepStates, totalDaysInCourse);
    
    // Обновляем allCourses если есть
    if (courseStore.allCourses?.data) {
      const updatedCourses = courseStore.allCourses.data.map(course => {
        if (course.id !== courseId) return course;
        
        return {
          ...course,
          userStatus: courseStatus,
          // Обновляем startedAt если курс в процессе или завершен
          startedAt: course.startedAt || (courseStatus !== TrainingStatus.NOT_STARTED ? new Date() : course.startedAt),
          // Обновляем completedAt если курс завершен
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });
      
      courseStore.setAllCourses(updatedCourses, courseStore.allCourses.type);
    }

    // Обновляем favorites если есть
    if (courseStore.favorites?.data) {
      const updatedFavorites = courseStore.favorites.data.map(course => {
        if (course.id !== courseId) return course;
        
        return {
          ...course,
          userStatus: courseStatus,
          startedAt: course.startedAt || (courseStatus !== TrainingStatus.NOT_STARTED ? new Date() : course.startedAt),
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });
      
      courseStore.setFavorites(updatedFavorites);
    }

    // Обновляем authored если есть
    if (courseStore.authored) {
      const updatedAuthored = courseStore.authored.map(course => {
        if (course.id !== courseId) return course;
        
        return {
          ...course,
          userStatus: courseStatus,
          startedAt: course.startedAt || (courseStatus !== TrainingStatus.NOT_STARTED ? new Date() : course.startedAt),
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });
      
      courseStore.setAuthored(updatedAuthored);
    }
  });
  };

  return {
    updateStepProgress,
    calculateDayStatus,
    calculateCourseStatus,
    syncCourseStoreWithStepStates,
  };
}

/**
 * Синхронизирует courseStore с актуальными данными из stepStore
 * Отдельная функция для использования вне React компонентов
 */
export async function syncCourseStoreWithStepStates() {
  // Динамический импорт для избежания циклических зависимостей
  const { useStepStore } = await import("@shared/stores/stepStore");
  const { useCourseStore } = await import("@shared/stores/courseStore");
  const { TrainingStatus } = await import("@gafus/types");
  const { calculateCourseStatus } = await import("@shared/utils/trainingCalculations");
  
  const stepStates = useStepStore.getState().stepStates;
  const courseStore = useCourseStore.getState();
  
  // Получаем все уникальные курсы из stepStates
  const courseIds = new Set<string>();
  Object.keys(stepStates).forEach((key) => {
    const parts = key.split('-');
    if (parts.length >= 2) {
      courseIds.add(parts[0]);
    }
  });

  // Обновляем каждый курс на основе актуальных stepStates
  courseIds.forEach((courseId) => {
    // Получаем информацию о курсе для определения количества дней
    let totalDaysInCourse: number | undefined;
    
    // Ищем курс в allCourses
    if (courseStore.allCourses?.data) {
      const course = courseStore.allCourses.data.find(c => c.id === courseId);
      if (course) {
        totalDaysInCourse = course.dayLinks.length;
      }
    }
    
    // Если не нашли в allCourses, ищем в favorites
    if (!totalDaysInCourse && courseStore.favorites?.data) {
      const course = courseStore.favorites.data.find(c => c.id === courseId);
      if (course) {
        totalDaysInCourse = course.dayLinks.length;
      }
    }
    
    // Если не нашли в favorites, ищем в authored
    if (!totalDaysInCourse && courseStore.authored) {
      const course = courseStore.authored.find(c => c.id === courseId);
      if (course) {
        totalDaysInCourse = course.dayLinks.length;
      }
    }
    
    const courseStatus = calculateCourseStatus(courseId, stepStates as Record<string, { status?: string }>, totalDaysInCourse);
    
    // Обновляем allCourses если есть
    if (courseStore.allCourses?.data) {
      const updatedCourses = courseStore.allCourses.data.map((course: CourseWithProgressData) => {
        if (course.id !== courseId) return course;
        
        return {
          ...course,
          userStatus: courseStatus,
          // Обновляем startedAt если курс в процессе или завершен
          startedAt: course.startedAt || (courseStatus !== TrainingStatus.NOT_STARTED ? new Date() : course.startedAt),
          // Обновляем completedAt если курс завершен
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });
      
      courseStore.setAllCourses(updatedCourses, courseStore.allCourses.type);
    }

    // Обновляем favorites если есть
    if (courseStore.favorites?.data) {
      const updatedFavorites = courseStore.favorites.data.map((course: CourseWithProgressData) => {
        if (course.id !== courseId) return course;
        
        return {
          ...course,
          userStatus: courseStatus,
          startedAt: course.startedAt || (courseStatus !== TrainingStatus.NOT_STARTED ? new Date() : course.startedAt),
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });
      
      courseStore.setFavorites(updatedFavorites);
    }

    // Обновляем authored если есть
    if (courseStore.authored) {
      const updatedAuthored = courseStore.authored.map((course: CourseWithProgressData) => {
        if (course.id !== courseId) return course;
        
        return {
          ...course,
          userStatus: courseStatus,
          startedAt: course.startedAt || (courseStatus !== TrainingStatus.NOT_STARTED ? new Date() : course.startedAt),
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });
      
      courseStore.setAuthored(updatedAuthored);
    }
  });
}