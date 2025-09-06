import { useEffect } from "react";
import { create } from "zustand";

import { TrainingStatus, type TimerStore } from "@gafus/types";
import {
  pauseNotificationClient,
  resetNotificationClient,
  resumeNotificationClient,
} from "@shared/lib/StepNotification/manageStepNotificationSimple";
import { startUserStepServerAction } from "@shared/lib/training/startUserStepServerAction";
import { updateStepStatusServerAction } from "@shared/lib/training/updateUserStepStatus";

// ===== УТИЛИТЫ =====
const nowSec = () => Math.floor(Date.now() / 1000);
const makeEndKey = (courseId: string, day: number, idx: number) =>
  `training-${courseId}-${day}-${idx}-end`;

const loadFromLS = (key: string): string | null => localStorage.getItem(key);

// ===== STORE =====
export const useTimerStore = create<TimerStore>()((set, get) => {
  // Хранилище для таймеров
  const timers = new Map<string, NodeJS.Timeout>();

  // Централизованное управление активным шагом
  let activeStep: string | null = null; // stepKey активного шага
  let activeTimer: NodeJS.Timeout | null = null; // активный таймер

  return {
    timers,

    // ===== УПРАВЛЕНИЕ АКТИВНЫМ ШАГОМ =====

    // Получить активный шаг
    getActiveStep: () => activeStep,

    // Проверить, может ли шаг быть запущен
    canStartStep: (courseId: string, day: number, stepIndex: number) => {
      const stepKey = `${courseId}-${day}-${stepIndex}`;
      return activeStep === null || activeStep === stepKey;
    },

    // ===== УПРАВЛЕНИЕ ТАЙМЕРАМИ =====

    startTimer: (courseId, day, stepIndex, onTimeUpdate, onFinish, isRestore = false) => {
      if (typeof window === "undefined") return false;

      const stepKey = `${courseId}-${day}-${stepIndex}`;

      // При восстановлении таймера не проверяем canStartStep
      if (!isRestore) {
        // Проверяем, может ли шаг быть запущен
        if (!get().canStartStep(courseId, day, stepIndex)) {
          return false; // Возвращаем false для показа уведомления
        }

        // Останавливаем предыдущий активный таймер, если есть
        if (activeTimer) {
          clearInterval(activeTimer);
          activeTimer = null;
          activeStep = null;
        }
      }

      // Создаем новый таймер
      const timer = setInterval(() => {
        const END_KEY = makeEndKey(courseId, day, stepIndex);
        const endTsStr = loadFromLS(END_KEY);

        if (!endTsStr) {
          get().stopTimer(courseId, day, stepIndex);
          return;
        }

        const endTs = Number(endTsStr);
        const diff = Math.max(endTs - nowSec(), 0);

        // Вызываем callback для обновления времени
        onTimeUpdate(diff);

        if (diff === 0) {
          get().stopTimer(courseId, day, stepIndex);
          // Вызываем callback для завершения
          onFinish();
        }
      }, 1000);

      // Устанавливаем как активный
      activeTimer = timer;
      activeStep = stepKey;
      timers.set(stepKey, timer);

      return true; // Успешно запущен
    },

    stopTimer: (courseId, day, stepIndex) => {
      if (typeof window === "undefined") return;

      const stepKey = `${courseId}-${day}-${stepIndex}`;
      const timer = timers.get(stepKey);

      if (timer) {
        clearInterval(timer);
        timers.delete(stepKey);

        // Если это был активный таймер, очищаем
        if (activeStep === stepKey) {
          activeStep = null;
          activeTimer = null;
        }
      }
    },

    stopAllTimers: () => {
      if (typeof window === "undefined") return;

      // Останавливаем все таймеры
      timers.forEach((timer) => clearInterval(timer));
      timers.clear();

      // Очищаем активный шаг
      if (activeTimer) {
        clearInterval(activeTimer);
        activeTimer = null;
      }
      activeStep = null;
    },

    cleanupTimers: () => {
      if (typeof window === "undefined") return;

      timers.forEach((timer) => clearInterval(timer));
      timers.clear();

      if (activeTimer) {
        clearInterval(activeTimer);
        activeTimer = null;
      }
      activeStep = null;
    },

    // ===== СЕРВЕРНЫЕ ДЕЙСТВИЯ =====
    startStepWithServer: async (courseId, day, stepIndex, durationSec) => {
      try {
        await startUserStepServerAction(
          courseId,
          day,
          stepIndex,
          TrainingStatus.IN_PROGRESS,
          durationSec,
        );
      } catch (error) {
        console.error("Ошибка при запуске шага на сервере:", error);

        // Если сервер недоступен, добавляем в очередь синхронизации
        try {
          const { useOfflineStore } = await import("@shared/stores/offlineStore");
          const offlineStore = useOfflineStore.getState();

          offlineStore.addToSyncQueue({
            type: "step-status-update",
            data: {
              courseId,
              day,
              stepIndex,
              status: "IN_PROGRESS",
            },
            maxRetries: 3,
          });
        } catch (offlineError) {
          console.error("Failed to add to offline queue:", offlineError);
        }

        throw error;
      }
    },

    finishStepWithServer: async (courseId, day, stepIndex, stepTitle, stepOrder) => {
      try {
        await updateStepStatusServerAction(
          courseId,
          day,
          stepIndex,
          TrainingStatus.COMPLETED,
          stepTitle,
          stepOrder,
        );
      } catch (error) {
        console.error("Ошибка при завершении шага на сервере:", error);

        // Если сервер недоступен, добавляем в очередь синхронизации
        try {
          const { useOfflineStore } = await import("@shared/stores/offlineStore");
          const offlineStore = useOfflineStore.getState();

          offlineStore.addToSyncQueue({
            type: "step-status-update",
            data: {
              courseId,
              day,
              stepIndex,
              status: "COMPLETED",
              stepTitle,
              stepOrder,
            },
            maxRetries: 3,
          });
        } catch (offlineError) {
          console.error("Failed to add to offline queue:", offlineError);
        }

        throw error;
      }
    },

    resetStepWithServer: async (courseId, day, stepIndex) => {
      try {
        // Сбрасываем уведомление (удаляем из очереди и БД)
        try {
          await resetNotificationClient({ courseId, day, stepIndex });
        } catch (notificationError) {
          console.warn("Failed to reset notification:", notificationError);
        }

        await updateStepStatusServerAction(courseId, day, stepIndex, TrainingStatus.NOT_STARTED);
      } catch (error) {
        console.error("Ошибка при сбросе шага на сервере:", error);

        // Если сервер недоступен, добавляем в очередь синхронизации
        try {
          const { useOfflineStore } = await import("@shared/stores/offlineStore");
          const offlineStore = useOfflineStore.getState();

          offlineStore.addToSyncQueue({
            type: "step-status-update",
            data: {
              courseId,
              day,
              stepIndex,
              status: "NOT_STARTED",
            },
            maxRetries: 3,
          });
        } catch (offlineError) {
          console.error("Failed to add to offline queue:", offlineError);
        }

        throw error;
      }
    },

    // Приостанавливает уведомление (удаляет из очереди, но оставляет в БД)
    pauseNotification: async (courseId, day, stepIndex) => {
      try {
        await pauseNotificationClient({ courseId, day, stepIndex });
      } catch (error) {
        console.error("Failed to pause notification:", error);
        throw error;
      }
    },

    // Возобновляет уведомление (создает новую задачу в очереди)
    resumeNotification: async (courseId, day, stepIndex, durationSec) => {
      try {
        await resumeNotificationClient({ courseId, day, stepIndex, durationSec });
      } catch (error) {
        console.error("Failed to resume notification:", error);
        throw error;
      }
    },

    // ===== ОФЛАЙН ФУНКЦИИ =====

    // Пауза шага в офлайн режиме
    pauseStepOffline: (courseId, day, stepIndex) => {
      if (typeof window === "undefined") return;

      // Останавливаем таймер
      get().stopTimer(courseId, day, stepIndex);
      
      // Сохраняем состояние паузы в localStorage
      const PAUSE_KEY = `training-${courseId}-${day}-${stepIndex}-paused`;
      const pauseData = {
        pausedAt: Date.now(),
        timeLeft: 0, // Будет обновлено из stepStore
      };
      localStorage.setItem(PAUSE_KEY, JSON.stringify(pauseData));
    },

    // Возобновление шага в офлайн режиме
    resumeStepOffline: (courseId, day, stepIndex) => {
      if (typeof window === "undefined") return;

      // Удаляем данные паузы из localStorage
      const PAUSE_KEY = `training-${courseId}-${day}-${stepIndex}-paused`;
      localStorage.removeItem(PAUSE_KEY);
    },

    // Пауза шага с синхронизацией на сервер
    pauseStepWithServer: async (courseId, day, stepIndex) => {
      try {
        // Сначала пытаемся синхронизировать с сервером
        await get().pauseNotification(courseId, day, stepIndex);
        
        // Если успешно, выполняем локальную паузу
        get().pauseStepOffline(courseId, day, stepIndex);
      } catch (error) {
        console.error("Ошибка при паузе шага на сервере:", error);

        // Если сервер недоступен, добавляем в очередь синхронизации
        try {
          const { useOfflineStore } = await import("@shared/stores/offlineStore");
          const offlineStore = useOfflineStore.getState();

          // Получаем текущее оставшееся время из stepStore
          const { useStepStore } = await import("@shared/stores/stepStore");
          const stepStore = useStepStore.getState();
          const stepKey = `${courseId}-${day}-${stepIndex}`;
          const stepState = stepStore.stepStates[stepKey];
          const timeLeft = stepState?.timeLeft || 0;

          offlineStore.addToSyncQueue({
            type: "step-pause",
            data: {
              courseId,
              day,
              stepIndex,
              pausedAt: Date.now(),
              timeLeft,
            },
            maxRetries: 3,
          });

          // Выполняем локальную паузу
          get().pauseStepOffline(courseId, day, stepIndex);
        } catch (offlineError) {
          console.error("Failed to add pause to offline queue:", offlineError);
          // Все равно выполняем локальную паузу
          get().pauseStepOffline(courseId, day, stepIndex);
        }
      }
    },

    // Возобновление шага с синхронизацией на сервер
    resumeStepWithServer: async (courseId, day, stepIndex, durationSec) => {
      try {
        // Сначала пытаемся синхронизировать с сервером
        await get().resumeNotification(courseId, day, stepIndex, durationSec);
        
        // Если успешно, выполняем локальное возобновление
        get().resumeStepOffline(courseId, day, stepIndex);
      } catch (error) {
        console.error("Ошибка при возобновлении шага на сервере:", error);

        // Если сервер недоступен, добавляем в очередь синхронизации
        try {
          const { useOfflineStore } = await import("@shared/stores/offlineStore");
          const offlineStore = useOfflineStore.getState();

          // Получаем текущее оставшееся время из stepStore
          const { useStepStore } = await import("@shared/stores/stepStore");
          const stepStore = useStepStore.getState();
          const stepKey = `${courseId}-${day}-${stepIndex}`;
          const stepState = stepStore.stepStates[stepKey];
          const timeLeft = stepState?.timeLeft || durationSec;

          offlineStore.addToSyncQueue({
            type: "step-resume",
            data: {
              courseId,
              day,
              stepIndex,
              resumedAt: Date.now(),
              timeLeft,
            },
            maxRetries: 3,
          });

          // Выполняем локальное возобновление
          get().resumeStepOffline(courseId, day, stepIndex);
        } catch (offlineError) {
          console.error("Failed to add resume to offline queue:", offlineError);
          // Все равно выполняем локальное возобновление
          get().resumeStepOffline(courseId, day, stepIndex);
        }
      }
    },
  };
});

// Хук для автоматической очистки таймеров при размонтировании компонента
export const useCleanupTimers = () => {
  const { cleanupTimers } = useTimerStore();

  useEffect(() => {
    return () => {
      cleanupTimers();
    };
  }, [cleanupTimers]);
};
