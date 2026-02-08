import { getStepKey as getStepKeyFromCore } from "@gafus/core/utils/training";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { stepStorage } from "./storage";

// Локальное состояние шага
export interface LocalStepState {
  status: "NOT_STARTED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "RESET";
  remainingSec: number | null;
  timeLeft: number | null; // Оставшееся время для таймера (как в web)
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
  getStepState: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
  ) => LocalStepState | null;

  // Обновление состояния
  setStepState: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    state: Partial<LocalStepState>,
  ) => void;

  // Обновление времени таймера (как в web)
  updateTimeLeft: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    timeLeft: number,
  ) => void;

  // Статусы шагов
  startStep: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
  ) => void;
  pauseStep: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    remainingSec: number,
  ) => void;
  resumeStep: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;
  completeStep: (courseId: string, dayOnCourseId: string, stepIndex: number) => void;
  resetStep: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
  ) => void;

  // Инициализация шага (как в web-версии)
  initializeStep: (
    courseId: string,
    dayOnCourseId: string,
    stepIndex: number,
    durationSec: number,
    status: string,
    options?: { serverPaused?: boolean; serverRemainingSec?: number },
  ) => void;

  // Синхронизация с сервером
  syncFromServer: (
    courseId: string,
    dayOnCourseId: string,
    steps: {
      stepIndex: number;
      status: string;
      remainingSec: number | null;
      durationSec?: number;
    }[],
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
      getStepKey: getStepKeyFromCore,

      // Получение состояния
      getStepState: (courseId, dayOnCourseId, stepIndex) => {
        const key = getStepKeyFromCore(courseId, dayOnCourseId, stepIndex);
        return get().stepStates[key] ?? null;
      },

      // Обновление состояния
      setStepState: (courseId, dayOnCourseId, stepIndex, newState) => {
        const key = getStepKeyFromCore(courseId, dayOnCourseId, stepIndex);
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

      // Обновление времени таймера (как в web)
      updateTimeLeft: (courseId, dayOnCourseId, stepIndex, timeLeft) => {
        const key = getStepKeyFromCore(courseId, dayOnCourseId, stepIndex);
        set((state) => {
          const current = state.stepStates[key];
          if (!current) return state;
          return {
            stepStates: {
              ...state.stepStates,
              [key]: {
                ...current,
                timeLeft,
                remainingSec: timeLeft, // Синхронизируем с remainingSec
                updatedAt: Date.now(),
              },
            },
          };
        });
      },

      // Старт шага
      startStep: (courseId, dayOnCourseId, stepIndex, durationSec) => {
        const key = getStepKeyFromCore(courseId, dayOnCourseId, stepIndex);
        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [key]: {
              status: "IN_PROGRESS",
              remainingSec: durationSec,
              timeLeft: durationSec, // Инициализируем timeLeft для таймера
              updatedAt: Date.now(),
            },
          },
        }));
      },

      // Пауза шага
      pauseStep: (courseId, dayOnCourseId, stepIndex, remainingSec) => {
        const key = getStepKeyFromCore(courseId, dayOnCourseId, stepIndex);
        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [key]: {
              status: "PAUSED",
              remainingSec,
              timeLeft: remainingSec, // Сохраняем timeLeft при паузе
              updatedAt: Date.now(),
            },
          },
        }));
      },

      // Возобновление шага
      resumeStep: (courseId, dayOnCourseId, stepIndex) => {
        const key = getStepKeyFromCore(courseId, dayOnCourseId, stepIndex);
        const current = get().stepStates[key];
        if (current) {
          set((state) => ({
            stepStates: {
              ...state.stepStates,
              [key]: {
                ...current,
                status: "IN_PROGRESS",
                // Сохраняем timeLeft при возобновлении
                timeLeft: current.timeLeft ?? current.remainingSec,
                updatedAt: Date.now(),
              },
            },
          }));
        }
      },

      // Завершение шага
      completeStep: (courseId, dayOnCourseId, stepIndex) => {
        const key = getStepKeyFromCore(courseId, dayOnCourseId, stepIndex);
        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [key]: {
              status: "COMPLETED",
              remainingSec: null,
              timeLeft: 0, // Обнуляем timeLeft при завершении
              updatedAt: Date.now(),
            },
          },
        }));
      },

      // Сброс шага — статус RESET, полное время для отображения
      resetStep: (courseId, dayOnCourseId, stepIndex, durationSec) => {
        const key = getStepKeyFromCore(courseId, dayOnCourseId, stepIndex);
        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [key]: {
              status: "RESET",
              remainingSec: durationSec,
              timeLeft: durationSec,
              updatedAt: Date.now(),
            },
          },
        }));
      },

      // Инициализация шага (как в web-версии)
      initializeStep: (courseId, dayOnCourseId, stepIndex, durationSec, status, options) => {
        const key = getStepKeyFromCore(courseId, dayOnCourseId, stepIndex);
        const current = get().stepStates[key];

        // Если шаг уже инициализирован и имеет локальные изменения - не перезаписываем
        if (current && current.updatedAt > Date.now() - 5000) {
          return;
        }

        const initialTimeLeft = options?.serverPaused
          ? (options.serverRemainingSec ?? durationSec)
          : status === "IN_PROGRESS"
            ? durationSec
            : durationSec;

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [key]: {
              status: (status || "NOT_STARTED") as LocalStepState["status"],
              remainingSec: options?.serverPaused
                ? (options.serverRemainingSec ?? durationSec)
                : status === "IN_PROGRESS"
                  ? durationSec
                  : null,
              timeLeft: initialTimeLeft, // Инициализируем timeLeft
              updatedAt: Date.now(),
            },
          },
        }));
      },

      // Синхронизация с данными сервера
      syncFromServer: (courseId, dayOnCourseId, steps) => {
        const updates: Record<string, LocalStepState> = {};

        for (const step of steps) {
          const key = getStepKeyFromCore(courseId, dayOnCourseId, step.stepIndex);
          const current = get().stepStates[key];

          // Если локальное состояние новее — не перезаписываем
          if (current && current.updatedAt > Date.now() - 5000) {
            continue;
          }

          const status = step.status as LocalStepState["status"];
          const timeLeft =
            status === "RESET" && step.durationSec != null
              ? step.durationSec
              : step.remainingSec ?? current?.timeLeft ?? null;

          updates[key] = {
            status,
            remainingSec: step.remainingSec,
            timeLeft: typeof timeLeft === "number" ? timeLeft : current?.timeLeft ?? null,
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
      storage: createJSONStorage(() => stepStorage),
    },
  ),
);

/** Подмножество stepStates по префиксу дня (для одного дня курса). */
export function useDayStepStates(courseId: string, dayOnCourseId: string) {
  const prefix = `${courseId}-${dayOnCourseId}-`;
  return useStepStore(
    useShallow((state) =>
      Object.fromEntries(
        Object.entries(state.stepStates).filter(([key]) => key.startsWith(prefix)),
      ),
    ),
  );
}

/** Подмножество stepStates по префиксу курса (все дни курса). При пустом courseId возвращает {}. */
export function useStepStatesForCourse(courseId: string) {
  const prefix = courseId ? `${courseId}-` : "";
  return useStepStore(
    useShallow((state) => {
      if (!prefix) return {};
      return Object.fromEntries(
        Object.entries(state.stepStates).filter(([key]) => key.startsWith(prefix)),
      );
    }),
  );
}
