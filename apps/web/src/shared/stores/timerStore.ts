import { useEffect } from "react";
import { create } from "zustand";
import { createWebLogger } from "@gafus/logger";

import { TrainingStatus, type StepStatusUpdateData, type StepResumeData } from "@gafus/types";
import type { TimerStore } from "./timerStore.types";
import {
  pauseNotificationClient,
  resumeNotificationClient,
  resetNotificationClient,
} from "@shared/lib/StepNotification/manageStepNotificationSimple";
import {
  pauseUserStepServerAction,
  resumeUserStepServerAction,
} from "@shared/lib/training/pauseResumeUserStep";
import { startUserStepServerAction } from "@shared/lib/training/startUserStepServerAction";
import { updateStepStatusServerAction } from "@shared/lib/training/updateUserStepStatus";
import { hapticStart, hapticComplete } from "@shared/utils/hapticFeedback";

// Создаем логгер для timer store
const logger = createWebLogger("web-timer-store");

// ===== УТИЛИТЫ =====
const nowSec = () => Math.floor(Date.now() / 1000);
const makeEndKey = (courseId: string, dayOnCourseId: string, idx: number) =>
  `training-${courseId}-${dayOnCourseId}-${idx}-end`;

function loadFromLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Быстрый локальный таймаут для серверных действий (мобайлы)
const SERVER_ACTION_TIMEOUT_MS = 1000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

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
    canStartStep: (courseId: string, dayOnCourseId: string, stepIndex: number) => {
      const stepKey = `${courseId}-${dayOnCourseId}-${stepIndex}`;
      return activeStep === null || activeStep === stepKey;
    },

    // ===== УПРАВЛЕНИЕ ТАЙМЕРАМИ =====

    startTimer: (courseId, dayOnCourseId, stepIndex, onTimeUpdate, onFinish, isRestore = false) => {
      if (typeof window === "undefined") return false;

      const stepKey = `${courseId}-${dayOnCourseId}-${stepIndex}`;
      logger.info("startTimer", { stepIndex, isRestore, activeStep, courseId, dayOnCourseId });

      // При восстановлении таймера не проверяем canStartStep
      if (!isRestore) {
        const canStart = get().canStartStep(courseId, dayOnCourseId, stepIndex);
        if (!canStart) {
          logger.info("startTimer: canStartStep=false, returning false", {
            stepIndex,
            courseId,
            dayOnCourseId,
          });
          return false;
        }

        // Останавливаем предыдущий активный таймер, если есть
        if (activeTimer) {
          clearInterval(activeTimer);
          activeTimer = null;
          activeStep = null;
        }
      }

      const tick = () => {
        const END_KEY = makeEndKey(courseId, dayOnCourseId, stepIndex);
        const endTsStr = loadFromLS(END_KEY);

        if (!endTsStr) {
          get().stopTimer(courseId, dayOnCourseId, stepIndex);
          return;
        }

        const endTs = Number(endTsStr);
        const diff = Math.max(endTs - nowSec(), 0);

        onTimeUpdate(diff);

        if (diff === 0) {
          get().stopTimer(courseId, dayOnCourseId, stepIndex);
          hapticComplete();
          onFinish();
        }
      };

      // Сразу обновляем UI текущим остатком, чтобы не ждать первую секунду (убирает «лаг» после паузы)
      tick();

      const timer = setInterval(tick, 1000);

      activeTimer = timer;
      activeStep = stepKey;
      timers.set(stepKey, timer);
      set({ timers: new Map(timers) });
      logger.info("startTimer: timer started", { timersSize: timers.size, stepKey });

      if (!isRestore) {
        hapticStart();
      }

      return true;
    },

    stopTimer: (courseId, dayOnCourseId, stepIndex) => {
      if (typeof window === "undefined") return;

      const stepKey = `${courseId}-${dayOnCourseId}-${stepIndex}`;
      const timer = timers.get(stepKey);
      logger.info("stopTimer", { stepIndex, hadTimer: !!timer, activeStep, courseId, dayOnCourseId });

      if (timer) {
        clearInterval(timer);
        timers.delete(stepKey);
        set({ timers: new Map(timers) });

        // Если это был активный таймер, очищаем
        if (activeStep === stepKey) {
          activeStep = null;
          activeTimer = null;
          logger.info("stopTimer: cleared activeStep", { stepKey });
        }
      }
    },

    stopAllTimers: () => {
      if (typeof window === "undefined") return;

      timers.forEach((timer) => clearInterval(timer));
      timers.clear();
      set({ timers: new Map(timers) });

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
      set({ timers: new Map(timers) });

      if (activeTimer) {
        clearInterval(activeTimer);
        activeTimer = null;
      }
      activeStep = null;
    },

    // ===== СЕРВЕРНЫЕ ДЕЙСТВИЯ С РЕТРАЯМИ =====
    startStepWithServer: async (
      courseId: string,
      dayOnCourseId: string,
      stepIndex: number,
      durationSec: number,
    ) => {
      // Запускаем серверное действие в фоне с быстрым таймаутом; UI не блокируем
      (async () => {
        try {
          await withTimeout(
            startUserStepServerAction(
              courseId,
              dayOnCourseId,
              stepIndex,
              TrainingStatus.IN_PROGRESS,
              durationSec,
            ),
            SERVER_ACTION_TIMEOUT_MS,
          );
        } catch (error) {
          logger.error("❌ Ошибка запуска шага", error as Error, {
            operation: "start_step_with_server_error",
            courseId: courseId,
            dayOnCourseId: dayOnCourseId,
            stepIndex: stepIndex,
            durationSec: durationSec,
          });
          try {
            const { useOfflineStore } = await import("@shared/stores/offlineStore");
            const offlineStore = useOfflineStore.getState();
            offlineStore.addToSyncQueue({
              type: "step-status-update",
              data: {
                courseId,
                dayOnCourseId,
                stepIndex,
                status: "IN_PROGRESS",
              } as unknown as StepStatusUpdateData & { dayOnCourseId: string },
              maxRetries: 3,
            });
          } catch (offlineError) {
            logger.error("❌ Не удалось добавить в очередь синхронизации", offlineError as Error, {
              operation: "failed_to_add_to_sync_queue",
              courseId: courseId,
              dayOnCourseId: dayOnCourseId,
              stepIndex: stepIndex,
            });
          }
        }
      })();
    },

    finishStepWithServer: async (
      courseId: string,
      dayOnCourseId: string,
      stepIndex: number,
      stepTitle: string,
      stepOrder: number,
    ) => {
      // Выполняем серверное действие в фоне, UI не блокируем
      (async () => {
        try {
          await withTimeout(
            updateStepStatusServerAction(
              courseId,
              dayOnCourseId,
              stepIndex,
              TrainingStatus.COMPLETED,
              stepTitle,
              stepOrder,
            ),
            SERVER_ACTION_TIMEOUT_MS,
          );

          // Отправляем событие для инвалидации React Query кэша на клиенте
          // Это событие будет обработано в компонентах, использующих React Query
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("invalidate-training-dates-cache"));
            logger.info(
              "[Cache] Sent event to invalidate React Query cache for user:training-dates",
              { operation: "info" },
            );
          }
        } catch (error) {
          logger.error("❌ Ошибка завершения шага", error as Error, {
            operation: "finish_step_with_server_error",
            courseId: courseId,
            dayOnCourseId: dayOnCourseId,
            stepIndex: stepIndex,
            stepTitle: stepTitle,
            stepOrder: stepOrder,
          });
          try {
            const { useOfflineStore } = await import("@shared/stores/offlineStore");
            const offlineStore = useOfflineStore.getState();
            offlineStore.addToSyncQueue({
              type: "step-status-update",
              data: {
                courseId,
                dayOnCourseId,
                stepIndex,
                status: "COMPLETED",
                stepTitle,
                stepOrder,
              } as unknown as StepStatusUpdateData & { dayOnCourseId: string },
              maxRetries: 3,
            });
            logger.info("📝 Добавлено в очередь офлайн синхронизации", {
              operation: "added_to_offline_sync_queue_finish",
              courseId: courseId,
              dayOnCourseId: dayOnCourseId,
              stepIndex: stepIndex,
            });
          } catch (offlineError) {
            logger.error("❌ Не удалось добавить в очередь синхронизации", offlineError as Error, {
              operation: "failed_to_add_to_sync_queue_finish",
              courseId: courseId,
              dayOnCourseId: dayOnCourseId,
              stepIndex: stepIndex,
            });
          }
        }
      })();
    },

    resetStepWithServer: async (
      courseId: string,
      dayOnCourseId: string,
      stepIndex: number,
      durationSec: number,
    ) => {
      logger.info("resetStepWithServer", { stepIndex, durationSec, courseId, dayOnCourseId });
      const { useStepStore } = await import("@shared/stores/stepStore");
      const stepStore = useStepStore.getState();

      get().stopTimer(courseId, dayOnCourseId, stepIndex);
      stepStore.resetStep(courseId, dayOnCourseId, stepIndex, durationSec);

      try {
        await withTimeout(
          updateStepStatusServerAction(courseId, dayOnCourseId, stepIndex, TrainingStatus.RESET),
          SERVER_ACTION_TIMEOUT_MS,
        );
      } catch (error) {
        logger.error("Ошибка сброса шага на сервере", error as Error, {
          operation: "reset_step_error",
          courseId,
          dayOnCourseId,
          stepIndex,
        });
        try {
          const { useOfflineStore } = await import("@shared/stores/offlineStore");
          useOfflineStore.getState().addToSyncQueue({
            type: "step-status-update",
            data: {
              courseId,
              dayOnCourseId,
              stepIndex,
              status: "RESET",
            } as StepStatusUpdateData & { dayOnCourseId: string },
            maxRetries: 3,
          });
        } catch (offlineError) {
          logger.error("Не удалось добавить в очередь синхронизации", offlineError as Error, {
            operation: "failed_to_add_to_sync_queue_reset",
            courseId,
            dayOnCourseId,
            stepIndex,
          });
        }
        throw error;
      }

      try {
        await withTimeout(
          resetNotificationClient({ courseId, dayOnCourseId, stepIndex }),
          SERVER_ACTION_TIMEOUT_MS,
        );
      } catch (notificationError) {
        logger.warn("Failed to reset notification", {
          operation: "failed_to_reset_notification",
          error:
            notificationError instanceof Error
              ? notificationError.message
              : String(notificationError),
        });
      }
    },

    // Сервер: сохранить паузу шага и поставить на паузу Push-уведомление (StepNotification)
    pauseNotification: async (courseId: string, dayOnCourseId: string, stepIndex: number) => {
      try {
        const { useStepStore } = await import("@shared/stores/stepStore");
        const stepStore = useStepStore.getState();
        const stepKey = stepStore.getStepKey(courseId, dayOnCourseId, stepIndex);
        const stepState = stepStore.stepStates[stepKey];
        const timeLeft = stepState?.timeLeft || 0;
        // 1) Пишем паузу шага в UserStep
        // 2) Ставим на паузу StepNotification
        await Promise.allSettled([
          pauseUserStepServerAction(courseId, dayOnCourseId, stepIndex, timeLeft),
          pauseNotificationClient({ courseId, dayOnCourseId, stepIndex }),
        ]);
      } catch (error) {
        const { useStepStore } = await import("@shared/stores/stepStore");
        const stepStore = useStepStore.getState();
        const stepKey = stepStore.getStepKey(courseId, dayOnCourseId, stepIndex);
        const stepState = stepStore.stepStates[stepKey];

        logger.error("Failed to pause step on server", error as Error, {
          operation: "pause_step_on_server_error",
          courseId: courseId,
          dayOnCourseId: dayOnCourseId,
          stepIndex: stepIndex,
          timeLeft: stepState?.timeLeft || 0,
        });
        throw error;
      }
    },

    // Сервер: снять паузу шага и возобновить Push-уведомление (StepNotification)
    resumeNotification: async (
      courseId: string,
      dayOnCourseId: string,
      stepIndex: number,
      durationSec: number,
    ) => {
      try {
        await Promise.allSettled([
          resumeUserStepServerAction(courseId, dayOnCourseId, stepIndex),
          resumeNotificationClient({ courseId, dayOnCourseId, stepIndex, durationSec }),
        ]);
      } catch (error) {
        logger.error("Failed to resume step on server", error as Error, {
          operation: "resume_step_on_server_error",
          courseId: courseId,
          dayOnCourseId: dayOnCourseId,
          stepIndex: stepIndex,
          durationSec: durationSec,
        });
        throw error;
      }
    },

    // ===== ОФЛАЙН ФУНКЦИИ =====

    // Пауза шага в офлайн режиме
    pauseStepOffline: (courseId, dayOnCourseId, stepIndex) => {
      if (typeof window === "undefined") return;

      // Останавливаем таймер
      get().stopTimer(courseId, dayOnCourseId, stepIndex);

      const PAUSE_KEY = `training-${courseId}-${dayOnCourseId}-${stepIndex}-paused`;
      const pauseData = {
        pausedAt: Date.now(),
        timeLeft: 0,
      };
      try {
        localStorage.setItem(PAUSE_KEY, JSON.stringify(pauseData));
      } catch {
        // Quota exceeded or private mode
      }
    },

    resumeStepOffline: (courseId, dayOnCourseId, stepIndex) => {
      if (typeof window === "undefined") return;

      const PAUSE_KEY = `training-${courseId}-${dayOnCourseId}-${stepIndex}-paused`;
      try {
        localStorage.removeItem(PAUSE_KEY);
      } catch {
        // ignore
      }
    },

    pauseStepWithServer: async (
      courseId: string,
      dayOnCourseId: string,
      stepIndex: number,
      timeLeftFromCaller?: number,
    ) => {
      try {
        const { useStepStore } = await import("@shared/stores/stepStore");
        const stepStore = useStepStore.getState();
        const stepKey = stepStore.getStepKey(courseId, dayOnCourseId, stepIndex);
        const stepState = stepStore.stepStates[stepKey];
        const timeLeft =
          typeof timeLeftFromCaller === "number"
            ? timeLeftFromCaller
            : stepState?.timeLeft || 0;

        await stepStore.pauseStep(courseId, dayOnCourseId, stepIndex, timeLeft);

        (async () => {
          try {
            await withTimeout(
              get().pauseNotification(courseId, dayOnCourseId, stepIndex),
              SERVER_ACTION_TIMEOUT_MS,
            );
          } catch {
            try {
              const { useOfflineStore } = await import("@shared/stores/offlineStore");
              const offlineStore = useOfflineStore.getState();
              offlineStore.addToSyncQueue({
                type: "step-pause",
                data: {
                  courseId,
                  dayOnCourseId,
                  stepIndex,
                  pausedAt: Date.now(),
                  timeLeft,
                } as unknown as StepStatusUpdateData & { dayOnCourseId: string },
                maxRetries: 3,
              });
            } catch (offlineError) {
              logger.error("Failed to add pause to offline queue", offlineError as Error, {
                operation: "failed_to_add_pause_to_offline_queue",
                courseId: courseId,
                dayOnCourseId: dayOnCourseId,
                stepIndex: stepIndex,
                timeLeft: timeLeft,
              });
            }
          }
        })();
      } catch (e) {
        logger.error("Ошибка при локальной паузе", e as Error, {
          operation: "local_pause_error",
          courseId: courseId,
          dayOnCourseId: dayOnCourseId,
          stepIndex: stepIndex,
        });
        // В случае ошибки пытаемся остановить таймер и обновить состояние
        try {
          const { useStepStore } = await import("@shared/stores/stepStore");
          const stepStore = useStepStore.getState();
          await stepStore.pauseStep(courseId, dayOnCourseId, stepIndex);
        } catch (fallbackError) {
          logger.error("Ошибка при fallback паузе", fallbackError as Error);
        }
      }
    },

    // Возобновление шага с синхронизацией на сервер (optimistic + быстрый таймаут)
    resumeStepWithServer: async (
      courseId: string,
      dayOnCourseId: string,
      stepIndex: number,
      durationSec: number,
    ) => {
      logger.info("resumeStepWithServer", { stepIndex, durationSec, courseId, dayOnCourseId });
      try {
        const { useStepStore } = await import("@shared/stores/stepStore");
        const stepStore = useStepStore.getState();
        const stepKey = stepStore.getStepKey(courseId, dayOnCourseId, stepIndex);
        const stepState = stepStore.stepStates[stepKey];
        const timeLeft = stepState?.timeLeft || durationSec;

        stepStore.resumeStep(courseId, dayOnCourseId, stepIndex);
        logger.info("resumeStepWithServer: resumeStep done", { stepKey, timeLeft });

        // Сервер — в фоне с быстрым таймаутом
        (async () => {
          try {
            await withTimeout(
              get().resumeNotification(courseId, dayOnCourseId, stepIndex, durationSec),
              SERVER_ACTION_TIMEOUT_MS,
            );
          } catch {
            try {
              const { useOfflineStore } = await import("@shared/stores/offlineStore");
              const offlineStore = useOfflineStore.getState();
              offlineStore.addToSyncQueue({
                type: "step-resume",
                data: {
                  courseId,
                  dayOnCourseId,
                  stepIndex,
                  resumedAt: Date.now(),
                  timeLeft,
                } as unknown as StepResumeData & { dayOnCourseId: string },
                maxRetries: 3,
              });
            } catch (offlineError) {
              logger.error("Failed to add resume to offline queue", offlineError as Error, {
                operation: "failed_to_add_resume_to_offline_queue",
                courseId: courseId,
                dayOnCourseId: dayOnCourseId,
                stepIndex: stepIndex,
                timeLeft: timeLeft,
              });
            }
          }
        })();
      } catch (e) {
        logger.error("Ошибка при локальном возобновлении", e as Error, {
          operation: "local_resume_error",
          courseId: courseId,
          dayOnCourseId: dayOnCourseId,
          stepIndex: stepIndex,
          durationSec: durationSec,
        });
        // В случае ошибки пытаемся обновить состояние
        try {
          const { useStepStore } = await import("@shared/stores/stepStore");
          const stepStore = useStepStore.getState();
          stepStore.resumeStep(courseId, dayOnCourseId, stepIndex);
        } catch (fallbackError) {
          logger.error("Ошибка при fallback возобновлении", fallbackError as Error);
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
