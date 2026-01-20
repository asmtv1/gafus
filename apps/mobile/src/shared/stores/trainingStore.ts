import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zustandStorage } from "./storage";
import { CACHE_DURATIONS } from "@/constants";

interface CachedTrainingDays {
  data: unknown;
  timestamp: number;
}

interface TrainingState {
  // Индексы открытых шагов (аккордеон)
  openIndexes: Record<string, number | null>;
  // Индексы запущенных шагов (таймер активен)
  runningSteps: Record<string, number | null>;
  // Кэш списка дней по типу курса
  cachedTrainingDays: Record<string, CachedTrainingDays>;
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

  // Кэширование списка дней
  getCachedTrainingDays: (courseType: string) => { data: unknown | null; isExpired: boolean };
  setCachedTrainingDays: (courseType: string, data: unknown) => void;
  clearCachedTrainingDays: (courseType?: string) => void;

  // Сброс состояния
  reset: () => void;
}

type TrainingStore = TrainingState & TrainingActions;

const initialState: TrainingState = {
  openIndexes: {},
  runningSteps: {},
  cachedTrainingDays: {},
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
      getDayKey: (courseId, dayOnCourseId) => `${courseId}-${dayOnCourseId}`,

      // Открытый шаг (аккордеон)
      getOpenIndex: (courseId, dayOnCourseId) => {
        const dayKey = `${courseId}-${dayOnCourseId}`;
        return get().openIndexes[dayKey] ?? null;
      },

      setOpenIndex: (courseId, dayOnCourseId, index) => {
        const dayKey = `${courseId}-${dayOnCourseId}`;
        set((state) => ({
          openIndexes: { ...state.openIndexes, [dayKey]: index },
        }));
      },

      // Запущенный шаг (таймер)
      getRunningIndex: (courseId, dayOnCourseId) => {
        const dayKey = `${courseId}-${dayOnCourseId}`;
        return get().runningSteps[dayKey] ?? null;
      },

      setRunningIndex: (courseId, dayOnCourseId, index) => {
        const dayKey = `${courseId}-${dayOnCourseId}`;
        set((state) => ({
          runningSteps: { ...state.runningSteps, [dayKey]: index },
        }));
      },

      // Кэширование
      getCachedTrainingDays: (courseType) => {
        const cached = get().cachedTrainingDays[courseType];
        if (!cached) return { data: null, isExpired: true };

        const isExpired = Date.now() - cached.timestamp > CACHE_DURATIONS.SHORT;
        return { data: cached.data, isExpired };
      },

      setCachedTrainingDays: (courseType, data) => {
        set((state) => ({
          cachedTrainingDays: {
            ...state.cachedTrainingDays,
            [courseType]: { data, timestamp: Date.now() },
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

      // Полный сброс
      reset: () => set(initialState),
    }),
    {
      name: "training-storage",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        openIndexes: state.openIndexes,
        runningSteps: state.runningSteps,
        // Не персистим кэш — он должен быть свежим
      }),
    }
  )
);
