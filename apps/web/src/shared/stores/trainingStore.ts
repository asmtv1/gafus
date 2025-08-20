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
      togglePauseWithServer: async (courseId, day, stepIndex) => {
        await toggleStepNotificationPause(day, stepIndex, true);
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
