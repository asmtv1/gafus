import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { zustandStorage } from "./storage";

// Локальное состояние шага
export interface LocalStepState {
  status: "NOT_STARTED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";
  remainingSec: number | null;
  updatedAt: number;
}

interface StepState {
  // Ключ: `${courseId}-${dayOnCourseId}-${stepIndex}`
  stepStates: Record<string, LocalStepState>;
}

interface StepActions {
  // Утилиты
  getStepKey: (courseId: string, dayOnCourseId: string, stepIndex: number) => string;

  // Получение состояния
  getStepState: (courseId: string, dayOnCourseId: string, stepIndex: number) => LocalStepState | null;

  // Обновление состояния
  setStepState: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    state: Partial<LocalStepState>
  ) => void;

  // Статусы шагов
  startStep: (courseId: string, dayOnCourseId: string, stepIndex: number, durationSec: number) => void;
  pauseStep: (courseId: string, dayOnCourseId: string, stepIndex: number, remainingSec: number) => void;
  resumeStep: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;
  completeStep: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;

  // Инициализация шага (как в web-версии)
  initializeStep: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
    status: string,
    options?: { serverPaused?: boolean; serverRemainingSec?: number }
  ) => void;

  // Синхронизация с сервером
  syncFromServer: (
    courseId: string,
    dayOnCourseId: string,
    steps: Array<{ stepIndex: number; status: string; remainingSec: number | null }>
  ) => void;

  // Очистка
  clearDayStates: (courseId: string, dayOnCourseId: string) => void;
  reset: () => void;
}

type StepStore = StepState & StepActions;

const initialState: StepState = {
  stepStates: {},
};

/**
 * Store для локального состояния шагов тренировки
 * Позволяет работать офлайн и синхронизировать позже
 */
export const useStepStore = create<StepStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Утилиты
      getStepKey: (courseId, dayOnCourseId, stepIndex) =>
        `${courseId}-${dayOnCourseId}-${stepIndex}`,

      // Получение состояния
      getStepState: (courseId, dayOnCourseId, stepIndex) => {
        const key = `${courseId}-${dayOnCourseId}-${stepIndex}`;
        return get().stepStates[key] ?? null;
      },

      // Обновление состояния
      setStepState: (courseId, dayOnCourseId, stepIndex, newState) => {
        const key = `${courseId}-${dayOnCourseId}-${stepIndex}`;
        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [key]: {
              ...state.stepStates[key],
              ...newState,
              updatedAt: Date.now(),
            } as LocalStepState,
          },
        }));
      },

      // Старт шага
      startStep: (courseId, dayOnCourseId, stepIndex, durationSec) => {
        const key = `${courseId}-${dayOnCourseId}-${stepIndex}`;
        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [key]: {
              status: "IN_PROGRESS",
              remainingSec: durationSec,
              updatedAt: Date.now(),
            },
          },
        }));
      },

      // Пауза шага
      pauseStep: (courseId, dayOnCourseId, stepIndex, remainingSec) => {
        const key = `${courseId}-${dayOnCourseId}-${stepIndex}`;
        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [key]: {
              status: "PAUSED",
              remainingSec,
              updatedAt: Date.now(),
            },
          },
        }));
      },

      // Возобновление шага
      resumeStep: (courseId, dayOnCourseId, stepIndex) => {
        const key = `${courseId}-${dayOnCourseId}-${stepIndex}`;
        const current = get().stepStates[key];
        if (current) {
          set((state) => ({
            stepStates: {
              ...state.stepStates,
              [key]: {
                ...current,
                status: "IN_PROGRESS",
                updatedAt: Date.now(),
              },
            },
          }));
        }
      },

      // Завершение шага
      completeStep: (courseId, dayOnCourseId, stepIndex) => {
        const key = `${courseId}-${dayOnCourseId}-${stepIndex}`;
        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [key]: {
              status: "COMPLETED",
              remainingSec: null,
              updatedAt: Date.now(),
            },
          },
        }));
      },

      // Инициализация шага (как в web-версии)
      initializeStep: (courseId, dayOnCourseId, stepIndex, durationSec, status, options) => {
        const key = `${courseId}-${dayOnCourseId}-${stepIndex}`;
        const current = get().stepStates[key];
        
        // Если шаг уже инициализирован и имеет локальные изменения - не перезаписываем
        if (current && current.updatedAt > Date.now() - 5000) {
          return;
        }

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [key]: {
              status: (status || "NOT_STARTED") as LocalStepState["status"],
              remainingSec: options?.serverPaused 
                ? (options.serverRemainingSec ?? durationSec)
                : (status === "IN_PROGRESS" ? durationSec : null),
              updatedAt: Date.now(),
            },
          },
        }));
      },

      // Синхронизация с данными сервера
      syncFromServer: (courseId, dayOnCourseId, steps) => {
        const updates: Record<string, LocalStepState> = {};
        
        for (const step of steps) {
          const key = `${courseId}-${dayOnCourseId}-${step.stepIndex}`;
          const current = get().stepStates[key];
          
          // Если локальное состояние новее — не перезаписываем
          if (current && current.updatedAt > Date.now() - 5000) {
            continue;
          }
          
          updates[key] = {
            status: step.status as LocalStepState["status"],
            remainingSec: step.remainingSec,
            updatedAt: Date.now(),
          };
        }

        if (Object.keys(updates).length > 0) {
          set((state) => ({
            stepStates: { ...state.stepStates, ...updates },
          }));
        }
      },

      // Очистка состояний дня
      clearDayStates: (courseId, dayOnCourseId) => {
        const prefix = `${courseId}-${dayOnCourseId}-`;
        set((state) => {
          const newStates = { ...state.stepStates };
          for (const key of Object.keys(newStates)) {
            if (key.startsWith(prefix)) {
              delete newStates[key];
            }
          }
          return { stepStates: newStates };
        });
      },

      // Полный сброс
      reset: () => set(initialState),
    }),
    {
      name: "step-storage",
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
