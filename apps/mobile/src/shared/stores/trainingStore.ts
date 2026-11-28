import { getDayKey as getDayKeyFromCore } from "@gafus/core-client/utils/training";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zustandStorage } from "./storage";

interface TrainingState {
  // Индексы открытых шагов (аккордеон)
  openIndexes: Record<string, number | null>;
  // Индексы запущенных шагов (таймер активен)
  runningSteps: Record<string, number | null>;
}

interface TrainingActions {
  // Утилиты
  getDayKey: (courseId: string, dayOnCourseId: string) => string;

  // Управление открытым шагом (аккордеон)
  getOpenIndex: (courseId: string, dayOnCourseId: string) => number | null;
  setOpenIndex: (courseId: string, dayOnCourseId: string, index: number | null) => void;

  // Управление запущенным шагом (таймер)
  getRunningIndex: (courseId: string, dayOnCourseId: string) => number | null;
  setRunningIndex: (courseId: string, dayOnCourseId: string, index: number | null) => void;

  // Сброс состояния
  reset: () => void;
}

type TrainingStore = TrainingState & TrainingActions;

const initialState: TrainingState = {
  openIndexes: {},
  runningSteps: {},
};

/**
 * Store для управления состоянием тренировки
 * Логика идентична web версии
 */
export const useTrainingStore = create<TrainingStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Утилиты
      getDayKey: (courseId, dayOnCourseId) =>
        getDayKeyFromCore(courseId, dayOnCourseId),

      // Открытый шаг (аккордеон)
      getOpenIndex: (courseId, dayOnCourseId) => {
        const dayKey = get().getDayKey(courseId, dayOnCourseId);
        return get().openIndexes[dayKey] ?? null;
      },

      setOpenIndex: (courseId, dayOnCourseId, index) => {
        const dayKey = get().getDayKey(courseId, dayOnCourseId);
        set((state) => ({
          openIndexes: { ...state.openIndexes, [dayKey]: index },
        }));
      },

      // Запущенный шаг (таймер)
      getRunningIndex: (courseId, dayOnCourseId) => {
        const dayKey = get().getDayKey(courseId, dayOnCourseId);
        return get().runningSteps[dayKey] ?? null;
      },

      setRunningIndex: (courseId, dayOnCourseId, index) => {
        const dayKey = get().getDayKey(courseId, dayOnCourseId);
        set((state) => ({
          runningSteps: { ...state.runningSteps, [dayKey]: index },
        }));
      },

      // Полный сброс
      reset: () => set(initialState),
    }),
    {
      name: "training-storage",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        openIndexes: state.openIndexes,
        runningSteps: state.runningSteps,
      }),
    },
  ),
);
