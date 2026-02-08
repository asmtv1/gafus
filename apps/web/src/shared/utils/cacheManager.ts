"use client";

import { TrainingStatus, type CourseWithProgressData } from "@gafus/types";
import { useStepStore } from "@shared/stores/stepStore";
import { useCourseStore } from "@shared/stores/courseStore";
import { useUserStore } from "@shared/stores/userStore";
import {
  calculateDayStatus as calcDay,
  calculateCourseStatus as calcCourse,
  getStepKey,
  getStepTimerEndStorageKey,
} from "@gafus/core/utils/training";
import { createWebLogger } from "@gafus/logger";

// Создаем логгер для cache manager
const logger = createWebLogger("web-cache-manager");

// Утилиты для работы с временем
const nowSec = () => Math.floor(Date.now() / 1000);

// CourseWithProgressData больше не импортируется, так как используется только в courseStore

/**
 * Централизованный менеджер кэша для обновления всех уровней кэширования
 * при изменении прогресса пользователя
 */
export function useCacheManager() {
  const updateStepStatus = useStepStore((s) => s.updateStepStatus);
  const courseStore = useCourseStore();
  const { user } = useUserStore();

  /**
   * Обновляет кэш на всех уровнях при изменении статуса шага
   */
  const updateStepProgress = (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    stepStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED" | "RESET",
    durationSec?: number,
    totalSteps?: number,
  ) => {
    logger.info("[CacheManager] Updating step progress", {
      operation: "update_step_progress",
      courseId: courseId,
      dayOnCourseId: dayOnCourseId,
      stepIndex: stepIndex,
      stepStatus: stepStatus,
    });

    // 1. Обновляем локальный стейт шага
    if (stepStatus === "IN_PROGRESS" && durationSec) {
      // При запуске шага создаем полное состояние через setState
      const stepKey = getStepKey(courseId, dayOnCourseId, stepIndex);
      const endTs = nowSec() + durationSec;

      // Сохраняем endTs в localStorage для таймера
      if (typeof window !== "undefined") {
        localStorage.setItem(
        getStepTimerEndStorageKey(courseId, dayOnCourseId, stepIndex),
        endTs.toString(),
      );
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
    } else if (stepStatus === "IN_PROGRESS") {
      // Возобновление уже выполнено в resumeStepWithServer
      // НЕ вызываем resumeStep снова
    } else if (stepStatus === "PAUSED") {
      // Пауза уже выполнена в pauseStepWithServer
      // НЕ вызываем pauseStep снова
    } else if (stepStatus === "COMPLETED") {
      const { finishStep } = useStepStore.getState();
      finishStep(courseId, dayOnCourseId, stepIndex);
    } else {
      // NOT_STARTED, RESET и прочие — только обновление статуса в store
      updateStepStatus(courseId, dayOnCourseId, stepIndex, stepStatus);
    }

    // 2. Получаем актуальные stepStates после обновления
    const currentStepStates = useStepStore.getState().stepStates;

    // 3. Вычисляем новый статус дня на основе всех шагов
    const newDayStatus =
      totalSteps !== undefined
        ? calcDay(courseId, dayOnCourseId, currentStepStates, totalSteps)
        : calcDay(courseId, dayOnCourseId, currentStepStates);

    // 4. Вычисляем новый статус курса на основе всех дней
    // Получаем общее количество дней из данных курса
    const courseStore = useCourseStore.getState();
    const allCourses = courseStore.allCourses?.data || [];
    const serverCourse = allCourses.find((c) => c.id === courseId);
    const totalDays = serverCourse?.dayLinks?.length;
    const dayOnCourseIds =
      serverCourse?.dayLinks?.map((link) => link.day?.id).filter(Boolean) ?? [];
    const newCourseStatus = calcCourse(
      courseId,
      currentStepStates,
      totalDays,
      dayOnCourseIds as string[],
    );

    // 5. Обновляем кэш курсов в courseStore
    updateCoursesCache(
      courseId,
      newCourseStatus,
      dayOnCourseId,
      stepIndex,
      stepStatus as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED",
    );

    logger.info("[CacheManager] Updated", {
      operation: "cache_manager_updated",
      day: newDayStatus,
      course: newCourseStatus,
    });
  };

  /**
   * Вычисляет статус дня на основе статусов всех шагов
   */
  const calculateDayStatus = (
    courseId: string,
    dayOnCourseId: string,
    stepStates: Record<string, { status?: string }>,
  ) => {
    return calcDay(courseId, dayOnCourseId, stepStates);
  };

  /**
   * Вычисляет статус курса на основе статусов всех дней
   */
  const calculateCourseStatus = (
    courseId: string,
    stepStates: Record<string, { status?: string }>,
    totalDaysInCourse?: number,
    dayOnCourseIds?: string[],
  ) => {
    return calcCourse(courseId, stepStates, totalDaysInCourse, dayOnCourseIds);
  };

  /**
   * Обновляет кэш курсов в courseStore
   */
  const updateCoursesCache = (
    courseId: string,
    courseStatus: TrainingStatus,
    dayOnCourseId: string,
    stepIndex: number,
    stepStatus: string,
  ) => {
    logger.info("[CacheManager] updateCoursesCache", {
      operation: "update_courses_cache",
      courseId: courseId,
      courseStatus: courseStatus,
      dayOnCourseId: dayOnCourseId,
      stepIndex: stepIndex,
      stepStatus: stepStatus,
    });

    // Обновляем все курсы в courseStore
    if (courseStore.allCourses?.data) {
      logger.info("[CacheManager] Updating allCourses", {
        operation: "updating_all_courses",
        coursesCount: courseStore.allCourses.data.length,
      });
      const updatedCourses = courseStore.allCourses.data.map((course) => {
        if (course.id !== courseId) return course;

        logger.info("[CacheManager] Updating course", {
          operation: "updating_course",
          courseId: courseId,
          courseName: course.name,
          oldStatus: course.userStatus,
          newStatus: courseStatus,
        });
        return {
          ...course,
          userStatus: courseStatus,
          // Обновляем startedAt если курс только начался
          startedAt:
            course.startedAt || (stepStatus === "IN_PROGRESS" ? new Date() : course.startedAt),
          // Обновляем completedAt если курс завершен
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });

      courseStore.setAllCourses(updatedCourses, courseStore.allCourses.type);
      logger.info("[CacheManager] Updated allCourses successfully", {
        operation: "updated_all_courses_successfully",
      });
    } else {
      logger.info("[CacheManager] No allCourses data to update", {
        operation: "no_all_courses_data",
      });
    }

    // Обновляем избранные курсы в courseStore
    if (courseStore.favorites?.data) {
      logger.info("[CacheManager] Updating favorites", {
        operation: "updating_favorites",
        favoritesCount: courseStore.favorites.data.length,
      });
      const updatedFavorites = courseStore.favorites.data.map((course) => {
        if (course.id !== courseId) return course;

        logger.info("[CacheManager] Updating favorite course", {
          operation: "updating_favorite_course",
          courseId: courseId,
          courseName: course.name,
          oldStatus: course.userStatus,
          newStatus: courseStatus,
        });
        return {
          ...course,
          userStatus: courseStatus,
          startedAt:
            course.startedAt || (stepStatus === "IN_PROGRESS" ? new Date() : course.startedAt),
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });

      courseStore.setFavorites(updatedFavorites);
      logger.info("[CacheManager] Updated favorites successfully", {
        operation: "updated_favorites_successfully",
      });
    } else {
      logger.info("[CacheManager] No favorites data to update", {
        operation: "no_favorites_data",
      });
    }

    // Обновляем созданные курсы в courseStore (только для тренеров)
    if (courseStore.authored) {
      logger.info("[CacheManager] Updating authored", {
        operation: "updating_authored",
        authoredCount: courseStore.authored.length,
      });
      const updatedAuthored = courseStore.authored.map((course) => {
        if (course.id !== courseId) return course;

        logger.info("[CacheManager] Updating authored course", {
          operation: "updating_authored_course",
          courseId: courseId,
          courseName: course.name,
          oldStatus: course.userStatus,
          newStatus: courseStatus,
        });
        return {
          ...course,
          userStatus: courseStatus,
          startedAt:
            course.startedAt || (stepStatus === "IN_PROGRESS" ? new Date() : course.startedAt),
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });

      courseStore.setAuthored(updatedAuthored);
      logger.info("[CacheManager] Updated authored successfully", {
        operation: "updated_authored_successfully",
      });
    } else {
      // Показываем предупреждение только для тренеров
      if (user?.role === "TRAINER") {
        logger.info("[CacheManager] No authored data to update", {
          operation: "no_authored_data",
          userRole: user.role,
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
    const allStepStates = useStepStore.getState().stepStates;
    const courseStore = useCourseStore.getState();

    const coursesToSync: {
      courseId: string;
      totalDaysInCourse: number;
      dayOnCourseIds: string[];
    }[] = [];

    const addCourses = (
      list: { id: string; dayLinks?: { day?: { id: string } }[] }[] | undefined,
    ) => {
      if (!list) return;
      list.forEach((course) => {
        const dayOnCourseIds =
          course.dayLinks?.map((l) => l.day?.id).filter(Boolean) ?? [];
        coursesToSync.push({
          courseId: course.id,
          totalDaysInCourse: course.dayLinks?.length ?? 0,
          dayOnCourseIds: dayOnCourseIds as string[],
        });
      });
    };
    addCourses(courseStore.allCourses?.data ?? undefined);
    addCourses(courseStore.favorites?.data ?? undefined);
    addCourses(courseStore.authored ?? undefined);

    coursesToSync.forEach(({ courseId, totalDaysInCourse, dayOnCourseIds }) => {
      const courseStatus = calculateCourseStatus(
        courseId,
        allStepStates,
        totalDaysInCourse,
        dayOnCourseIds,
      );

      // Обновляем allCourses если есть
      if (courseStore.allCourses?.data) {
        const updatedCourses = courseStore.allCourses.data.map((course) => {
          if (course.id !== courseId) return course;

          return {
            ...course,
            userStatus: courseStatus,
            // Обновляем startedAt если курс в процессе или завершен
            startedAt:
              course.startedAt ||
              (courseStatus !== TrainingStatus.NOT_STARTED ? new Date() : course.startedAt),
            // Обновляем completedAt если курс завершен
            completedAt:
              courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
          };
        });

        courseStore.setAllCourses(updatedCourses, courseStore.allCourses.type);
      }

      // Обновляем favorites если есть
      if (courseStore.favorites?.data) {
        const updatedFavorites = courseStore.favorites.data.map((course) => {
          if (course.id !== courseId) return course;

          return {
            ...course,
            userStatus: courseStatus,
            startedAt:
              course.startedAt ||
              (courseStatus !== TrainingStatus.NOT_STARTED ? new Date() : course.startedAt),
            completedAt:
              courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
          };
        });

        courseStore.setFavorites(updatedFavorites);
      }

      // Обновляем authored если есть
      if (courseStore.authored) {
        const updatedAuthored = courseStore.authored.map((course) => {
          if (course.id !== courseId) return course;

          return {
            ...course,
            userStatus: courseStatus,
            startedAt:
              course.startedAt ||
              (courseStatus !== TrainingStatus.NOT_STARTED ? new Date() : course.startedAt),
            completedAt:
              courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
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
  const { useStepStore } = await import("@shared/stores/stepStore");
  const { useCourseStore } = await import("@shared/stores/courseStore");
  const { TrainingStatus } = await import("@gafus/types");
  const { calculateCourseStatus } = await import("@gafus/core/utils/training");

  const stepStates = useStepStore.getState().stepStates;
  const courseStore = useCourseStore.getState();

  const coursesToSync: {
    courseId: string;
    totalDaysInCourse: number;
    dayOnCourseIds: string[];
  }[] = [];
  const addCourses = (
    list: { id: string; dayLinks?: { day?: { id: string } }[] }[] | undefined,
  ) => {
    if (!list) return;
    list.forEach((course) => {
      const dayOnCourseIds =
        course.dayLinks?.map((l) => l.day?.id).filter(Boolean) ?? [];
      coursesToSync.push({
        courseId: course.id,
        totalDaysInCourse: course.dayLinks?.length ?? 0,
        dayOnCourseIds: dayOnCourseIds as string[],
      });
    });
  };
  addCourses(courseStore.allCourses?.data ?? undefined);
  addCourses(courseStore.favorites?.data ?? undefined);
  addCourses(courseStore.authored ?? undefined);

  coursesToSync.forEach(({ courseId, totalDaysInCourse, dayOnCourseIds }) => {
    const courseStatus = calculateCourseStatus(
      courseId,
      stepStates as Record<string, { status?: string }>,
      totalDaysInCourse,
      dayOnCourseIds,
    );

    // Обновляем allCourses если есть
    if (courseStore.allCourses?.data) {
      const updatedCourses = courseStore.allCourses.data.map((course: CourseWithProgressData) => {
        if (course.id !== courseId) return course;

        return {
          ...course,
          userStatus: courseStatus,
          // Обновляем startedAt если курс в процессе или завершен
          startedAt:
            course.startedAt ||
            (courseStatus !== TrainingStatus.NOT_STARTED ? new Date() : course.startedAt),
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
          startedAt:
            course.startedAt ||
            (courseStatus !== TrainingStatus.NOT_STARTED ? new Date() : course.startedAt),
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
          startedAt:
            course.startedAt ||
            (courseStatus !== TrainingStatus.NOT_STARTED ? new Date() : course.startedAt),
          completedAt: courseStatus === TrainingStatus.COMPLETED ? new Date() : course.completedAt,
        };
      });

      courseStore.setAuthored(updatedAuthored);
    }
  });
}
