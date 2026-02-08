import {
  getDayKey as getDayKeyFromCore,
  getStepKey as getStepKeyFromCore,
} from "@gafus/core/utils/training";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createWebLogger } from "@gafus/logger";

import type { TrainingStore } from "./types";
import { toggleStepNotificationPauseByDayOnCourseAction } from "@shared/server-actions/notifications";

// Создаем логгер для training store
const logger = createWebLogger("web-training-store");

// ===== STORE =====
export const useTrainingStore = create<TrainingStore>()(
  persist(
    (set, get) => ({
      // Начальное состояние (изолированно по курсам)
      openIndexes: {},
      runningSteps: {},
      courseAssignments: {},
      assignErrors: {},
      cachedTrainingDays: {},

      // ===== УТИЛИТЫ =====
      getStepKey: (courseId, dayOnCourseId, stepIndex) =>
        getStepKeyFromCore(courseId, dayOnCourseId, stepIndex),
      getDayKey: (courseId, dayOnCourseId) =>
        getDayKeyFromCore(courseId, dayOnCourseId),

      // ===== ГЕТТЕРЫ =====
      getOpenIndex: (courseId, dayOnCourseId) => {
        const dayKey = get().getDayKey(courseId, dayOnCourseId);
        return get().openIndexes[dayKey] ?? null;
      },

      getRunningIndex: (courseId, dayOnCourseId) => {
        const dayKey = get().getDayKey(courseId, dayOnCourseId);
        return get().runningSteps[dayKey] ?? null;
      },

      getCourseAssigned: (courseId) => {
        return get().courseAssignments[courseId] ?? false;
      },

      getAssignError: (courseId) => {
        return get().assignErrors[courseId] ?? null;
      },

      // ===== КЭШИРОВАНИЕ ДНЕЙ ТРЕНИРОВОК =====
      // Краткое кэширование (1-2 минуты) только для предотвращения дублирующих запросов в рамках одной сессии
      // В офлайне используется IndexedDB через useCachedTrainingDays
      getCachedTrainingDays: (courseType) => {
        const cached = get().cachedTrainingDays[courseType];

        if (!cached) {
          return { data: null, isExpired: true };
        }

        const now = Date.now();
        const CACHE_DURATION = 2 * 60 * 1000; // 2 минуты - только для предотвращения дублирующих запросов
        const isExpired = now - cached.timestamp > CACHE_DURATION;

        return { data: cached.data, isExpired };
      },

      setCachedTrainingDays: (courseType, data) => {
        set((state) => ({
          cachedTrainingDays: {
            ...state.cachedTrainingDays,
            [courseType]: {
              data,
              timestamp: Date.now(),
            },
          },
        }));
      },

      clearCachedTrainingDays: (courseType) => {
        if (courseType) {
          set((state) => {
            const newCached = { ...state.cachedTrainingDays };
            delete newCached[courseType];
            return { cachedTrainingDays: newCached };
          });
        } else {
          set({ cachedTrainingDays: {} });
        }
      },

      // ===== ДЕЙСТВИЯ ДЛЯ ДНЯ =====
      setOpenIndex: (courseId, dayOnCourseId, index) => {
        const dayKey = get().getDayKey(courseId, dayOnCourseId);
        set((state) => ({
          openIndexes: {
            ...state.openIndexes,
            [dayKey]: index,
          },
        }));
      },

      setRunningIndex: (courseId, dayOnCourseId, index) => {
        const dayKey = get().getDayKey(courseId, dayOnCourseId);
        set((state) => ({
          runningSteps: {
            ...state.runningSteps,
            [dayKey]: index,
          },
        }));
      },

      setCourseAssigned: (courseId, assigned) => {
        set((state) => ({
          courseAssignments: {
            ...state.courseAssignments,
            [courseId]: assigned,
          },
        }));
      },

      setAssignError: (courseId, error) => {
        set((state) => ({
          assignErrors: {
            ...state.assignErrors,
            [courseId]: error,
          },
        }));
      },

      // ===== ПОИСК АКТИВНОГО ШАГА =====
      findRunningStepIndex: (courseId, dayOnCourseId, totalSteps) => {
        const dayKey = get().getDayKey(courseId, dayOnCourseId);
        const runningIndex = get().runningSteps[dayKey];

        if (runningIndex === null || runningIndex < 0 || runningIndex >= totalSteps) {
          return null;
        }

        return runningIndex;
      },

      // ===== СЕРВЕРНЫЕ ДЕЙСТВИЯ =====
      togglePauseWithServer: async (courseId: string, dayOnCourseId: string, stepIndex: number) => {
        try {
          const result = await toggleStepNotificationPauseByDayOnCourseAction(
            courseId,
            dayOnCourseId,
            stepIndex,
            true,
          );
          if (!result.success) {
            throw new Error(result.error ?? "Failed to toggle notification");
          }
        } catch (error) {
          logger.error("togglePauseWithServer error", error as Error, {
            operation: "toggle_pause_with_server_error",
            courseId,
            dayOnCourseId,
            stepIndex,
          });
          throw error;
        }
      },

      resumeNotificationWithServer: async (
        courseId: string,
        dayOnCourseId: string,
        stepIndex: number,
      ) => {
        try {
          const result = await toggleStepNotificationPauseByDayOnCourseAction(
            courseId,
            dayOnCourseId,
            stepIndex,
            false,
          );
          if (!result.success) {
            throw new Error(result.error ?? "Failed to resume notification");
          }
        } catch (error) {
          logger.error("resumeNotificationWithServer error", error as Error, {
            operation: "resume_notification_with_server_error",
            courseId,
            dayOnCourseId,
            stepIndex,
          });
          throw error;
        }
      },
    }),
    {
      name: "training-storage",
      partialize: (state) => ({
        openIndexes: state.openIndexes,
        runningSteps: state.runningSteps,
        courseAssignments: state.courseAssignments,
        assignErrors: state.assignErrors,
        cachedTrainingDays: state.cachedTrainingDays,
      }),
    },
  ),
);
