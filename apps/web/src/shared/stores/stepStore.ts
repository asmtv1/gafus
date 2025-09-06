import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { StepStore } from "@gafus/types";

// ===== УТИЛИТЫ =====
const nowSec = () => Math.floor(Date.now() / 1000);
const makeEndKey = (courseId: string, day: number, idx: number) =>
  `training-${courseId}-${day}-${idx}-end`;

const saveToLS = (key: string, val: string | number) => localStorage.setItem(key, val.toString());
const loadFromLS = (key: string): string | null => localStorage.getItem(key);
const removeKeys = (...keys: string[]) => keys.forEach((key) => localStorage.removeItem(key));

// ===== STORE =====
export const useStepStore = create<StepStore>()(
  persist(
    (set, get) => ({
      // Начальное состояние
      stepStates: {},

      // ===== УТИЛИТЫ =====
      getStepKey: (courseId, day, stepIndex) => `${courseId}-${day}-${stepIndex}`,

      // ===== ДЕЙСТВИЯ ДЛЯ ШАГОВ =====
      initializeStep: (courseId, day, stepIndex, durationSec, initialStatus = "NOT_STARTED") => {
        const stepKey = get().getStepKey(courseId, day, stepIndex);
        const existingState = get().stepStates[stepKey];

        // Если уже есть состояние, проверяем, нужно ли обновить статус
        if (existingState) {
          // Обновляем статус только если он изменился на сервере
          if (initialStatus && existingState.status !== initialStatus) {
            set((state) => ({
              stepStates: {
                ...state.stepStates,
                [stepKey]: {
                  ...existingState,
                  status: initialStatus,
                  isFinished: initialStatus === "COMPLETED",
                },
              },
            }));
          }
          return;
        }

        // Проверяем localStorage для восстановления
        const restoredState = get().restoreStepFromLS(courseId, day, stepIndex);

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: restoredState || {
              timeLeft: durationSec,
              isFinished: initialStatus === "COMPLETED",
              isPaused: false,
              status: initialStatus,
            },
          },
        }));

        // Если восстановили активный шаг, синхронизируем время
        if (restoredState && restoredState.status === "IN_PROGRESS") {
          get().syncTimeWithLocalStorage(courseId, day, stepIndex);
        }
      },

      startStep: async (courseId, day, stepIndex, durationSec) => {
        const stepKey = get().getStepKey(courseId, day, stepIndex);
        const endTs = nowSec() + durationSec;

        // Проверяем, нет ли уже активных таймеров (реальное состояние)
        // Используем динамический импорт для избежания циклических зависимостей
        const timerStore = await import("@shared/stores/timerStore");
        const hasActiveTimers = timerStore.useTimerStore.getState().getActiveStep() !== null;

        if (hasActiveTimers) {
          return false; // Возвращаем false для показа уведомления
        }

        // Сохраняем в localStorage
        saveToLS(makeEndKey(courseId, day, stepIndex), endTs);

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

      pauseStep: (courseId, day, stepIndex) => {
        const stepKey = get().getStepKey(courseId, day, stepIndex);

        // Сохраняем данные паузы в localStorage для офлайн работы
        const PAUSE_KEY = `training-${courseId}-${day}-${stepIndex}-paused`;
        const currentStep = get().stepStates[stepKey];
        const pauseData = {
          pausedAt: Date.now(),
          timeLeft: currentStep?.timeLeft || 0,
        };
        localStorage.setItem(PAUSE_KEY, JSON.stringify(pauseData));

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: {
              ...state.stepStates[stepKey],
              isPaused: true,
              status: "PAUSED",
            },
          },
        }));
      },

      resumeStep: (courseId, day, stepIndex) => {
        const stepKey = get().getStepKey(courseId, day, stepIndex);

        const currentStep = get().stepStates[stepKey];

        if (!currentStep) {
          return;
        }

        // Удаляем данные паузы из localStorage
        const PAUSE_KEY = `training-${courseId}-${day}-${stepIndex}-paused`;
        localStorage.removeItem(PAUSE_KEY);

        const timeLeft = currentStep.timeLeft;
        const endTs = nowSec() + timeLeft;

        // Сохраняем в localStorage
        saveToLS(makeEndKey(courseId, day, stepIndex), endTs);

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
      },

      finishStep: (courseId, day, stepIndex) => {
        const stepKey = get().getStepKey(courseId, day, stepIndex);

        // Удаляем localStorage ключи
        removeKeys(makeEndKey(courseId, day, stepIndex));

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: {
              timeLeft: 0,
              isFinished: true,
              isPaused: false,
              status: "COMPLETED",
            },
          },
        }));
      },

      resetStep: (courseId, day, stepIndex, durationSec) => {
        const stepKey = get().getStepKey(courseId, day, stepIndex);

        // Удаляем localStorage ключи
        removeKeys(makeEndKey(courseId, day, stepIndex));

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: {
              timeLeft: durationSec,
              isFinished: false,
              isPaused: false,
              status: "NOT_STARTED",
            },
          },
        }));
      },

      // ===== ВОССТАНОВЛЕНИЕ И СИНХРОНИЗАЦИЯ =====
      restoreStepFromLS: (courseId, day, stepIndex) => {
        const END_KEY = makeEndKey(courseId, day, stepIndex);
        const PAUSE_KEY = `training-${courseId}-${day}-${stepIndex}-paused`;
        
        // Проверяем, есть ли данные паузы
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
            console.warn("Failed to parse pause data:", error);
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

      syncTimeWithLocalStorage: (courseId, day, stepIndex) => {
        const stepKey = get().getStepKey(courseId, day, stepIndex);
        const stepState = get().stepStates[stepKey];

        if (!stepState || stepState.status !== "IN_PROGRESS") return;

        const END_KEY = makeEndKey(courseId, day, stepIndex);
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

      updateTimeLeft: (courseId, day, stepIndex, timeLeft) => {
        const stepKey = get().getStepKey(courseId, day, stepIndex);

        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [stepKey]: {
              ...state.stepStates[stepKey],
              timeLeft,
            },
          },
        }));

        // Синхронизируем время с localStorage если шаг активен
        const stepState = get().stepStates[stepKey];
        if (stepState && stepState.status === "IN_PROGRESS") {
          const END_KEY = makeEndKey(courseId, day, stepIndex);
          const endTs = nowSec() + timeLeft;
          saveToLS(END_KEY, endTs.toString());
        }
      },

      // ===== ОЧИСТКА ДАННЫХ =====
      cleanupExpiredData: (courseId, day) => {
        // Очищаем устаревшие данные для всех шагов дня
        for (let i = 0; i < 100; i++) {
          const END_KEY = makeEndKey(courseId, day, i);
          const endTsStr = loadFromLS(END_KEY);

          if (endTsStr) {
            const endTs = Number(endTsStr);
            if (endTs <= nowSec()) {
              removeKeys(END_KEY);

              // Автоматически завершаем шаг если он был активен
              const stepKey = get().getStepKey(courseId, day, i);
              const stepState = get().stepStates[stepKey];
              if (stepState && stepState.status === "IN_PROGRESS") {
                get().finishStep(courseId, day, i);
              }
            }
          }
        }
      },

      validateStepIntegrity: (courseId, day, stepIndex) => {
        const stepKey = get().getStepKey(courseId, day, stepIndex);
        const stepState = get().stepStates[stepKey];

        if (!stepState || stepState.status !== "IN_PROGRESS") {
          return false;
        }

        // Проверяем корректность времени
        if (stepState.timeLeft <= 0) {
          get().finishStep(courseId, day, stepIndex);
          return false;
        }

        // Синхронизируем время с localStorage
        get().syncTimeWithLocalStorage(courseId, day, stepIndex);
        return true;
      },
    }),
    {
      name: "step-storage",
      partialize: (state) => ({
        stepStates: state.stepStates,
      }),
    },
  ),
);
