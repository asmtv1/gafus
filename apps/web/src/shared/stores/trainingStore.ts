import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { TrainingState } from "@gafus/types";
import { toggleStepNotificationPause } from "@shared/lib/StepNotification/toggleStepNotificationPause";

// ===== STORE =====
export const useTrainingStore = create<TrainingState>()(
  persist(
    (set, get) => ({
      // Начальное состояние (изолированно по курсам)
      openIndexes: {},
      runningSteps: {},
      courseAssignments: {},
      assignErrors: {},

      // ===== УТИЛИТЫ =====
      getStepKey: (courseId, day, stepIndex) => `${courseId}-${day}-${stepIndex}`,
      getDayKey: (courseId, day) => `${courseId}-${day}`,

      // ===== ГЕТТЕРЫ =====
      getOpenIndex: (courseId, day) => {
        const dayKey = get().getDayKey(courseId, day);
        return get().openIndexes[dayKey] ?? null;
      },

      getRunningIndex: (courseId, day) => {
        const dayKey = get().getDayKey(courseId, day);
        return get().runningSteps[dayKey] ?? null;
      },

      getCourseAssigned: (courseId) => {
        return get().courseAssignments[courseId] ?? false;
      },

      getAssignError: (courseId) => {
        return get().assignErrors[courseId] ?? null;
      },

      // ===== ОПРЕДЕЛЕНИЕ СТАТУСА ДНЯ =====
      getDayStatus: (courseId, day, stepStates) => {
        // Получаем все ключи шагов для данного дня
        const stepKeys = Object.keys(stepStates).filter((key) =>
          key.startsWith(`${courseId}-${day}-`),
        );

        if (stepKeys.length === 0) return "NOT_STARTED";

        const stepStatuses = stepKeys.map((key) => stepStates[key]?.status || "NOT_STARTED");

        // Если все шаги завершены - день завершен
        if (stepStatuses.every((status) => status === "COMPLETED")) {
          return "COMPLETED";
        }

        // Если хотя бы один шаг в процессе - день в процессе
        if (stepStatuses.some((status) => status === "IN_PROGRESS")) {
          return "IN_PROGRESS";
        }

        // Иначе день не начат
        return "NOT_STARTED";
      },

      // ===== ДЕЙСТВИЯ ДЛЯ ДНЯ =====
      setOpenIndex: (courseId, day, index) => {
        const dayKey = get().getDayKey(courseId, day);
        set((state) => ({
          openIndexes: {
            ...state.openIndexes,
            [dayKey]: index,
          },
        }));
      },

      setRunningIndex: (courseId, day, index) => {
        const dayKey = get().getDayKey(courseId, day);
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
      findRunningStepIndex: (courseId, day, totalSteps) => {
        const dayKey = get().getDayKey(courseId, day);
        const runningIndex = get().runningSteps[dayKey];

        if (runningIndex === null || runningIndex < 0 || runningIndex >= totalSteps) {
          return null;
        }

        return runningIndex;
      },

      // ===== СЕРВЕРНЫЕ ДЕЙСТВИЯ =====
      togglePauseWithServer: async (courseId: string, day: number, stepIndex: number) => {
        try {
          await toggleStepNotificationPause(day, stepIndex, true);
        } catch (error) {
          console.error(`togglePauseWithServer error:`, error);
          throw error;
        }
      },

      resumeNotificationWithServer: async (courseId: string, day: number, stepIndex: number) => {
        try {
          await toggleStepNotificationPause(day, stepIndex, false);
        } catch (error) {
          console.error(`resumeNotificationWithServer error:`, error);
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
      }),
    },
  ),
);
