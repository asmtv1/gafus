import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { createJSONStorage, persist } from "zustand/middleware";
import { createWebLogger } from "@gafus/logger";

import { statusRank } from "@gafus/core/utils/training";

import type { StepStore } from "./stepStore.types";
import { useUserStore } from "./userStore";

// Создаем логгер для step store
const logger = createWebLogger("web-step-store");

// ===== УТИЛИТЫ =====
const nowSec = () => Math.floor(Date.now() / 1000);
const getUserScopeId = () => {
  if (typeof window === "undefined") return "anonymous";
  return useUserStore.getState().user?.id || "anonymous";
};
const makeEndKey = (courseId: string, dayOnCourseId: string, idx: number) =>
  `training-${courseId}-${dayOnCourseId}-${idx}-end`;
const makePauseKey = (courseId: string, dayOnCourseId: string, idx: number) =>
  `training-${courseId}-${dayOnCourseId}-${idx}-paused`;
const STORAGE_VERSION = "v1";
const getStepStorageKey = () => `step-storage:${STORAGE_VERSION}:${getUserScopeId()}`;

function saveToLS(key: string, val: string | number): void {
  try {
    localStorage.setItem(key, val.toString());
  } catch {
    // Quota exceeded or private mode
  }
}

function loadFromLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeKeys(...keys: string[]): void {
  try {
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

// ===== STORE =====
export const useStepStore = create<StepStore>()(
  persist(
    (set, get) => ({
      _rehydrated: false,
      stepStates: {},

      // ===== УТИЛИТЫ =====
      getStepKey: (courseId, dayOnCourseId, stepIndex) =>
        `${courseId}-${dayOnCourseId}-${stepIndex}`,

      // ===== ДЕЙСТВИЯ ДЛЯ ШАГОВ =====
      initializeStep: (
        courseId,
        dayOnCourseId,
        stepIndex,
        durationSec,
        initialStatus = "NOT_STARTED",
        options,
      ) => {
        const stepKey = get().getStepKey(courseId, dayOnCourseId, stepIndex);
        const existingState = get().stepStates[stepKey];

        // RESET с сервера всегда пишем в store (перезатираем PAUSED и др.), чтобы store и UI совпадали
        if (initialStatus === "RESET") {
          removeKeys(
            makeEndKey(courseId, dayOnCourseId, stepIndex),
            makePauseKey(courseId, dayOnCourseId, stepIndex),
          );
          set((state) => ({
            stepStates: {
              ...state.stepStates,
              [stepKey]: {
                timeLeft: durationSec,
                isFinished: false,
                isPaused: false,
                status: "RESET",
              },
            },
          }));
          return;
        }

        // Если уже есть состояние, проверяем, нужно ли обновить статус
        if (existingState) {
          const localRank = statusRank(existingState.status);
          const serverRank = statusRank(initialStatus);
          if (serverRank > localRank) {
            const END_KEY = makeEndKey(courseId, dayOnCourseId, stepIndex);
            set((state) => ({
              stepStates: {
                ...state.stepStates,
                [stepKey]: {
                  ...existingState,
                  status: initialStatus,
                  isFinished: initialStatus === "COMPLETED",
                  isPaused: false,
                  // Если повышаем с NOT_STARTED до IN_PROGRESS и нет времени, используем durationSec
                  timeLeft:
                    initialStatus === "IN_PROGRESS" &&
                    (existingState.timeLeft == null || existingState.timeLeft <= 0)
                      ? durationSec
                      : existingState.timeLeft,
                },
              },
            }));

            // Очистим таймер при апгрейде до COMPLETED
            if (initialStatus === "COMPLETED") {
              removeKeys(END_KEY);
            }
          }
          return;
        }

        // Проверяем localStorage для восстановления
        const restoredState = get().restoreStepFromLS(courseId, dayOnCourseId, stepIndex);
        const serverPaused = options?.serverPaused === true;
        const serverRemaining = options?.serverRemainingSec;

        const baseState = restoredState || {
          timeLeft: durationSec,
          isFinished: initialStatus === "COMPLETED",
          isPaused: false,
          status: initialStatus,
        };

        const mergedState = (() => {
          if (baseState.status === "PAUSED") {
            return baseState;
          }
          if (baseState.status === "RESET") {
            return baseState;
          }
          if (serverPaused) {
            return {
              ...baseState,
              status: "PAUSED" as const,
              isPaused: true,
              timeLeft:
                typeof serverRemaining === "number" && serverRemaining > 0
                  ? serverRemaining
                  : baseState.timeLeft,
            };
          }
          return baseState;
        })();

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: mergedState,
          },
        }));

        // Если восстановили активный шаг, синхронизируем время
        if (restoredState && restoredState.status === "IN_PROGRESS") {
          get().syncTimeWithLocalStorage(courseId, dayOnCourseId, stepIndex);
        }
      },

      startStep: async (courseId, dayOnCourseId, stepIndex, durationSec) => {
        const stepKey = get().getStepKey(courseId, dayOnCourseId, stepIndex);
        const endTs = nowSec() + durationSec;

        // Проверяем, нет ли уже активных таймеров (реальное состояние)
        // Используем динамический импорт для избежания циклических зависимостей
        const timerStore = await import("@shared/stores/timerStore");
        const hasActiveTimers = timerStore.useTimerStore.getState().getActiveStep() !== null;

        if (hasActiveTimers) {
          return false; // Возвращаем false для показа уведомления
        }

        // Сохраняем в localStorage
        saveToLS(makeEndKey(courseId, dayOnCourseId, stepIndex), endTs);

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: {
              timeLeft: durationSec,
              isFinished: false,
              isPaused: false,
              status: "IN_PROGRESS",
            },
          },
        }));

        return true; // Успешно запущен
      },

      pauseStep: async (courseId, dayOnCourseId, stepIndex, timeLeftFromCaller) => {
        const stepKey = get().getStepKey(courseId, dayOnCourseId, stepIndex);
        const currentStep = get().stepStates[stepKey];
        const timeLeft =
          typeof timeLeftFromCaller === "number"
            ? timeLeftFromCaller
            : currentStep?.timeLeft || 0;

        if (typeof window !== "undefined") {
          const { useTimerStore } = await import("@shared/stores/timerStore");
          useTimerStore.getState().stopTimer(courseId, dayOnCourseId, stepIndex);
        }

        const END_KEY = makeEndKey(courseId, dayOnCourseId, stepIndex);
        removeKeys(END_KEY);

        const PAUSE_KEY = makePauseKey(courseId, dayOnCourseId, stepIndex);
        const pauseData = {
          pausedAt: Date.now(),
          timeLeft,
        };
        try {
          localStorage.setItem(PAUSE_KEY, JSON.stringify(pauseData));
        } catch {
          // Quota exceeded or private mode
        }

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: {
              ...state.stepStates[stepKey],
              timeLeft,
              isPaused: true,
              status: "PAUSED",
            },
          },
        }));
      },

      resumeStep: (courseId, dayOnCourseId, stepIndex) => {
        const stepKey = get().getStepKey(courseId, dayOnCourseId, stepIndex);
        const currentStep = get().stepStates[stepKey];

        if (!currentStep) {
          return;
        }

        const PAUSE_KEY = makePauseKey(courseId, dayOnCourseId, stepIndex);
        localStorage.removeItem(PAUSE_KEY);

        const timeLeft = currentStep.timeLeft;
        const endTs = nowSec() + timeLeft;
        const END_KEY = makeEndKey(courseId, dayOnCourseId, stepIndex);

        // Сохраняем в localStorage
        saveToLS(END_KEY, endTs);

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: {
              ...state.stepStates[stepKey],
              isPaused: false,
              status: "IN_PROGRESS",
            },
          },
        }));
        logger.info("resumeStep", { stepIndex, stepKey, courseId, dayOnCourseId });
      },

      finishStep: (courseId, dayOnCourseId, stepIndex) => {
        const stepKey = get().getStepKey(courseId, dayOnCourseId, stepIndex);

        // Удаляем localStorage ключи
        removeKeys(makeEndKey(courseId, dayOnCourseId, stepIndex));

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: {
              timeLeft: 0,
              isFinished: true,
              isPaused: false,
              status: "COMPLETED" as const,
            },
          },
        }));
      },

      // Универсальная функция для обновления статуса шага
      updateStepStatus: (courseId, dayOnCourseId, stepIndex, status) => {
        const stepKey = get().getStepKey(courseId, dayOnCourseId, stepIndex);
        const existingState = get().stepStates[stepKey];

        if (!existingState) {
          return;
        }

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: {
              ...existingState,
              status: status,
              isFinished: status === "COMPLETED",
              isPaused: status === "PAUSED",
            },
          },
        }));
      },

      resetStep: (courseId, dayOnCourseId, stepIndex, durationSec) => {
        const stepKey = get().getStepKey(courseId, dayOnCourseId, stepIndex);
        logger.info("resetStep", { stepIndex, stepKey, courseId, dayOnCourseId, durationSec });

        removeKeys(
          makeEndKey(courseId, dayOnCourseId, stepIndex),
          makePauseKey(courseId, dayOnCourseId, stepIndex),
        );

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: {
              timeLeft: durationSec,
              isFinished: false,
              isPaused: false,
              status: "RESET",
            },
          },
        }));
      },

      // ===== ВОССТАНОВЛЕНИЕ И СИНХРОНИЗАЦИЯ =====
      restoreStepFromLS: (courseId, dayOnCourseId, stepIndex) => {
        const END_KEY = makeEndKey(courseId, dayOnCourseId, stepIndex);
        const PAUSE_KEY = makePauseKey(courseId, dayOnCourseId, stepIndex);

        const pauseDataStr = loadFromLS(PAUSE_KEY);
        if (pauseDataStr) {
          try {
            const pauseData = JSON.parse(pauseDataStr);
            return {
              timeLeft: pauseData.timeLeft || 0,
              isFinished: false,
              isPaused: true,
              status: "PAUSED" as const,
            };
          } catch (error) {
            logger.warn("Failed to parse pause data", {
              operation: "parse_pause_data_error",
              courseId: courseId,
              dayOnCourseId: dayOnCourseId,
              stepIndex: stepIndex,
              error: error instanceof Error ? error.message : String(error),
            });
            localStorage.removeItem(PAUSE_KEY);
          }
        }

        // Проверяем активный таймер
        const endTsStr = loadFromLS(END_KEY);
        if (!endTsStr) return null;

        const endTs = Number(endTsStr);
        const diff = Math.max(endTs - nowSec(), 0);

        // Если время истекло, очищаем localStorage и возвращаем null
        if (diff === 0) {
          removeKeys(END_KEY);
          return null;
        }

        // Проверяем, что время не слишком большое (защита от некорректных данных)
        if (diff > 24 * 60 * 60) {
          removeKeys(END_KEY);
          return null;
        }

        // Проверяем, что время не слишком маленькое (защита от некорректных данных)
        if (diff < 1) {
          removeKeys(END_KEY);
          return null;
        }

        return {
          timeLeft: diff,
          isFinished: false,
          isPaused: false,
          status: "IN_PROGRESS" as const,
        };
      },

      syncTimeWithLocalStorage: (courseId, dayOnCourseId, stepIndex) => {
        const stepKey = get().getStepKey(courseId, dayOnCourseId, stepIndex);
        const stepState = get().stepStates[stepKey];

        if (!stepState || stepState.status !== "IN_PROGRESS") return;

        const END_KEY = makeEndKey(courseId, dayOnCourseId, stepIndex);
        const endTsStr = loadFromLS(END_KEY);

        if (!endTsStr) {
          // Если нет endTs, создаем новый
          const endTs = nowSec() + stepState.timeLeft;
          saveToLS(END_KEY, endTs.toString());
        } else {
          // Проверяем корректность endTs
          const endTs = Number(endTsStr);
          const currentDiff = endTs - nowSec();

          if (Math.abs(currentDiff - stepState.timeLeft) > 1) {
            const correctedEndTs = nowSec() + stepState.timeLeft;
            saveToLS(END_KEY, correctedEndTs.toString());
          }
        }
      },

      updateTimeLeft: (courseId, dayOnCourseId, stepIndex, timeLeft) => {
        const stepKey = get().getStepKey(courseId, dayOnCourseId, stepIndex);

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: {
              ...state.stepStates[stepKey],
              timeLeft,
            },
          },
        }));

        // Синхронизируем время с localStorage ТОЛЬКО если шаг активен И НЕ на паузе
        const stepStateAfter = get().stepStates[stepKey];
        if (stepStateAfter && stepStateAfter.status === "IN_PROGRESS" && !stepStateAfter.isPaused) {
          const END_KEY = makeEndKey(courseId, dayOnCourseId, stepIndex);
          const endTs = nowSec() + timeLeft;
          saveToLS(END_KEY, endTs.toString());
        }
      },

      // ===== ОЧИСТКА ДАННЫХ =====
      clearAllSteps: () => {
        set({ stepStates: {} });
      },
      cleanupExpiredData: (courseId, dayOnCourseId) => {
        // Очищаем устаревшие данные для всех шагов дня
        for (let i = 0; i < 100; i++) {
          const END_KEY = makeEndKey(courseId, dayOnCourseId, i);
          const endTsStr = loadFromLS(END_KEY);

          if (endTsStr) {
            const endTs = Number(endTsStr);
            if (endTs <= nowSec()) {
              removeKeys(END_KEY);

              // Автоматически завершаем шаг если он был активен
              const stepKey = get().getStepKey(courseId, dayOnCourseId, i);
              const stepState = get().stepStates[stepKey];
              if (stepState && stepState.status === "IN_PROGRESS") {
                get().finishStep(courseId, dayOnCourseId, i);
              }
            }
          }
        }
      },

      validateStepIntegrity: (courseId, dayOnCourseId, stepIndex) => {
        const stepKey = get().getStepKey(courseId, dayOnCourseId, stepIndex);
        const stepState = get().stepStates[stepKey];

        if (!stepState || stepState.status !== "IN_PROGRESS") {
          return false;
        }

        // Проверяем корректность времени
        if (stepState.timeLeft <= 0) {
          get().finishStep(courseId, dayOnCourseId, stepIndex);
          return false;
        }

        // Синхронизируем время с localStorage
        get().syncTimeWithLocalStorage(courseId, dayOnCourseId, stepIndex);
        return true;
      },
    }),
    {
      name: "step-storage",
      storage: createJSONStorage(() => ({
        getItem: (_name) => {
          try {
            const userId = getUserScopeId();
            if (userId === "anonymous") return null;
            const key = getStepStorageKey();
            return localStorage.getItem(key);
          } catch {
            return null;
          }
        },
        setItem: (_name, value) => {
          try {
            localStorage.setItem(getStepStorageKey(), value);
          } catch {
            // Quota exceeded or private mode
          }
        },
        removeItem: (_name) => {
          try {
            localStorage.removeItem(getStepStorageKey());
          } catch {
            // ignore
          }
        },
      })),
      partialize: (state) => ({
        stepStates: state.stepStates,
      }),
      onRehydrateStorage: () => () => {
        useStepStore.setState({ _rehydrated: true });
      },
    },
  ),
);

// ===== СЕЛЕКТОРЫ (предотвращают лишние ререндеры) =====

/** Шаги одного дня — подписка только на изменения шагов этого дня */
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

/** Шаги всего курса — для TrainingDayList */
export function useStepStatesForCourse(courseId: string) {
  const prefix = `${courseId}-`;
  return useStepStore(
    useShallow((state) =>
      Object.fromEntries(
        Object.entries(state.stepStates).filter(([key]) => key.startsWith(prefix)),
      ),
    ),
  );
}

/** Состояние одного шага — для AccordionStep */
export function useStepState(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
) {
  const stepKey = `${courseId}-${dayOnCourseId}-${stepIndex}`;
  return useStepStore((state) => state.stepStates[stepKey]);
}
