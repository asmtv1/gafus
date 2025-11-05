import { useEffect } from "react";
import { create } from "zustand";
import { createWebLogger } from "@gafus/logger";

import { TrainingStatus, type TimerStore } from "@gafus/types";
import { pauseNotificationClient, resumeNotificationClient, resetNotificationClient } from "@shared/lib/StepNotification/manageStepNotificationSimple";
import { pauseUserStepServerAction, resumeUserStepServerAction } from "@shared/lib/training/pauseResumeUserStep";
import { startUserStepServerAction } from "@shared/lib/training/startUserStepServerAction";
import { updateStepStatusServerAction } from "@shared/lib/training/updateUserStepStatus";
import { hapticStart, hapticComplete } from "@/utils/hapticFeedback";

// Создаем логгер для timer store
const logger = createWebLogger('web-timer-store');

// ===== УТИЛИТЫ =====
const nowSec = () => Math.floor(Date.now() / 1000);
const makeEndKey = (courseId: string, day: number, idx: number) =>
  `training-${courseId}-${day}-${idx}-end`;

const loadFromLS = (key: string): string | null => localStorage.getItem(key);

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
          // Haptic feedback при завершении таймера
          hapticComplete();
          // Вызываем callback для завершения
          onFinish();
        }
      }, 1000);

      // Устанавливаем как активный
      activeTimer = timer;
      activeStep = stepKey;
      timers.set(stepKey, timer);

      // Haptic feedback при старте таймера
      if (!isRestore) {
        hapticStart();
      }

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

    // ===== СЕРВЕРНЫЕ ДЕЙСТВИЯ С РЕТРАЯМИ =====
    startStepWithServer: async (courseId, day, stepIndex, durationSec) => {
      // Запускаем серверное действие в фоне с быстрым таймаутом; UI не блокируем
      (async () => {
        try {
          await withTimeout(
            startUserStepServerAction(
              courseId,
              day,
              stepIndex,
              TrainingStatus.IN_PROGRESS,
              durationSec,
            ),
            SERVER_ACTION_TIMEOUT_MS
          );
        } catch (error) {
          logger.error("❌ Ошибка запуска шага", error as Error, {
            operation: 'start_step_with_server_error',
            courseId: courseId,
            day: day,
            stepIndex: stepIndex,
            durationSec: durationSec
          });
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
            logger.error("❌ Не удалось добавить в очередь синхронизации", offlineError as Error, {
              operation: 'failed_to_add_to_sync_queue',
              courseId: courseId,
              day: day,
              stepIndex: stepIndex
            });
          }
        }
      })();
    },

    finishStepWithServer: async (courseId, day, stepIndex, stepTitle, stepOrder) => {
      // Выполняем серверное действие в фоне, UI не блокируем
      (async () => {
        try {
          await withTimeout(
            updateStepStatusServerAction(
              courseId,
              day,
              stepIndex,
              TrainingStatus.COMPLETED,
              stepTitle,
              stepOrder,
            ),
            SERVER_ACTION_TIMEOUT_MS
          );
          
          // Отправляем событие для инвалидации React Query кэша на клиенте
          // Это событие будет обработано в компонентах, использующих React Query
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("invalidate-training-dates-cache"));
            logger.info("[Cache] Sent event to invalidate React Query cache for user:training-dates", { operation: 'info' });
          }
        } catch (error) {
          logger.error("❌ Ошибка завершения шага", error as Error, {
            operation: 'finish_step_with_server_error',
            courseId: courseId,
            day: day,
            stepIndex: stepIndex,
            stepTitle: stepTitle,
            stepOrder: stepOrder
          });
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
            logger.info("📝 Добавлено в очередь офлайн синхронизации", {
              operation: 'added_to_offline_sync_queue_finish',
              courseId: courseId,
              day: day,
              stepIndex: stepIndex
            });
          } catch (offlineError) {
            logger.error("❌ Не удалось добавить в очередь синхронизации", offlineError as Error, {
              operation: 'failed_to_add_to_sync_queue_finish',
              courseId: courseId,
              day: day,
              stepIndex: stepIndex
            });
          }
        }
      })();
    },

    resetStepWithServer: async (courseId, day, stepIndex) => {
      // Получаем текущий статус шага синхронно
      try {
        const { useStepStore } = await import("@shared/stores/stepStore");
        const stepStore = useStepStore.getState();
        const stepKey = stepStore.getStepKey(courseId, day, stepIndex);
        const currentState = stepStore.stepStates[stepKey];
        let resetStatus: TrainingStatus = TrainingStatus.NOT_STARTED;
        if (currentState?.status === "IN_PROGRESS" || currentState?.status === "COMPLETED") {
          resetStatus = TrainingStatus.IN_PROGRESS;
        } else if (currentState?.status === "PAUSED") {
          resetStatus = TrainingStatus.IN_PROGRESS;
        }

        // Не блокируем UI: сбрасываем уведомление и статус в фоне
        (async () => {
          try {
            await withTimeout(
              resetNotificationClient({ courseId, day, stepIndex }),
              SERVER_ACTION_TIMEOUT_MS
            );
          } catch (notificationError) {
            logger.warn("Failed to reset notification", {
              operation: 'failed_to_reset_notification',
              error: notificationError instanceof Error ? notificationError.message : String(notificationError)
            });
          }
          try {
            await withTimeout(
              updateStepStatusServerAction(courseId, day, stepIndex, resetStatus),
              SERVER_ACTION_TIMEOUT_MS
            );
        } catch (error) {
          logger.error("❌ Ошибка сброса шага", error as Error, {
            operation: 'reset_step_error',
            courseId: courseId,
            day: day,
            stepIndex: stepIndex
          });
            try {
              const { useOfflineStore } = await import("@shared/stores/offlineStore");
              const offlineStore = useOfflineStore.getState();
              const stepStateNow = useStepStore.getState().stepStates[stepKey];
              let syncStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED" = "NOT_STARTED";
              if (stepStateNow?.status === "IN_PROGRESS" || stepStateNow?.status === "COMPLETED") {
                syncStatus = "IN_PROGRESS";
              } else if (stepStateNow?.status === "PAUSED") {
                syncStatus = "IN_PROGRESS";
              }
              offlineStore.addToSyncQueue({
                type: "step-status-update",
                data: { courseId, day, stepIndex, status: syncStatus },
                maxRetries: 3,
              });
              logger.info("📝 Добавлено в очередь офлайн синхронизации", {
                operation: 'added_to_offline_sync_queue_reset',
                courseId: courseId,
                day: day,
                stepIndex: stepIndex
              });
            } catch (offlineError) {
              logger.error("❌ Не удалось добавить в очередь синхронизации", offlineError as Error, {
                operation: 'failed_to_add_to_sync_queue_reset',
                courseId: courseId,
                day: day,
                stepIndex: stepIndex
              });
            }
          }
        })();
      } catch (e) {
        logger.error("❌ Ошибка при локальном расчёте статуса сброса", e as Error, {
          operation: 'local_reset_status_calculation_error',
          courseId: courseId,
          day: day,
          stepIndex: stepIndex
        });
      }
    },

    // Сервер: сохранить паузу шага и поставить на паузу Push-уведомление (StepNotification)
    pauseNotification: async (courseId, day, stepIndex) => {
      try {
        const { useStepStore } = await import("@shared/stores/stepStore");
        const stepStore = useStepStore.getState();
        const stepKey = `${courseId}-${day}-${stepIndex}`;
        const stepState = stepStore.stepStates[stepKey];
        const timeLeft = stepState?.timeLeft || 0;
        // 1) Пишем паузу шага в UserStep
        // 2) Ставим на паузу StepNotification
        await Promise.allSettled([
          pauseUserStepServerAction(courseId, day, stepIndex, timeLeft),
          pauseNotificationClient({ courseId, day, stepIndex }),
        ]);
      } catch (error) {
        const { useStepStore } = await import("@shared/stores/stepStore");
        const stepStore = useStepStore.getState();
        const stepKey = `${courseId}-${day}-${stepIndex}`;
        const stepState = stepStore.stepStates[stepKey];
        
        logger.error("Failed to pause step on server", error as Error, {
          operation: 'pause_step_on_server_error',
          courseId: courseId,
          day: day,
          stepIndex: stepIndex,
          timeLeft: stepState?.timeLeft || 0
        });
        throw error;
      }
    },

    // Сервер: снять паузу шага и возобновить Push-уведомление (StepNotification)
    resumeNotification: async (courseId, day, stepIndex, durationSec) => {
      try {
        await Promise.allSettled([
          resumeUserStepServerAction(courseId, day, stepIndex),
          resumeNotificationClient({ courseId, day, stepIndex, durationSec }),
        ]);
      } catch (error) {
        logger.error("Failed to resume step on server", error as Error, {
          operation: 'resume_step_on_server_error',
          courseId: courseId,
          day: day,
          stepIndex: stepIndex,
          durationSec: durationSec
        });
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

    // Пауза шага с синхронизацией на сервер (optimistic + быстрый таймаут)
    pauseStepWithServer: async (courseId, day, stepIndex) => {
      try {
        const { useStepStore } = await import("@shared/stores/stepStore");
        const stepStore = useStepStore.getState();
        const stepKey = `${courseId}-${day}-${stepIndex}`;
        const stepState = stepStore.stepStates[stepKey];
        const timeLeft = stepState?.timeLeft || 0;

        // Мгновенно меняем локальное состояние
        get().pauseStepOffline(courseId, day, stepIndex);

        // Сервер — в фоне с быстрым таймаутом
        (async () => {
          try {
            await withTimeout(get().pauseNotification(courseId, day, stepIndex), SERVER_ACTION_TIMEOUT_MS);
          } catch {
            try {
              const { useOfflineStore } = await import("@shared/stores/offlineStore");
              const offlineStore = useOfflineStore.getState();
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
            } catch (offlineError) {
              logger.error("Failed to add pause to offline queue", offlineError as Error, {
                operation: 'failed_to_add_pause_to_offline_queue',
                courseId: courseId,
                day: day,
                stepIndex: stepIndex,
                timeLeft: timeLeft
              });
            }
          }
        })();
      } catch (e) {
        logger.error("Ошибка при локальной паузе", e as Error, {
          operation: 'local_pause_error',
          courseId: courseId,
          day: day,
          stepIndex: stepIndex
        });
        get().pauseStepOffline(courseId, day, stepIndex);
      }
    },

    // Возобновление шага с синхронизацией на сервер (optimistic + быстрый таймаут)
    resumeStepWithServer: async (courseId, day, stepIndex, durationSec) => {
      try {
        const { useStepStore } = await import("@shared/stores/stepStore");
        const stepStore = useStepStore.getState();
        const stepKey = `${courseId}-${day}-${stepIndex}`;
        const stepState = stepStore.stepStates[stepKey];
        const timeLeft = stepState?.timeLeft || durationSec;

        // Мгновенно меняем локальное состояние
        get().resumeStepOffline(courseId, day, stepIndex);

        // Сервер — в фоне с быстрым таймаутом
        (async () => {
          try {
            await withTimeout(get().resumeNotification(courseId, day, stepIndex, durationSec), SERVER_ACTION_TIMEOUT_MS);
          } catch {
            try {
              const { useOfflineStore } = await import("@shared/stores/offlineStore");
              const offlineStore = useOfflineStore.getState();
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
            } catch (offlineError) {
              logger.error("Failed to add resume to offline queue", offlineError as Error, {
                operation: 'failed_to_add_resume_to_offline_queue',
                courseId: courseId,
                day: day,
                stepIndex: stepIndex,
                timeLeft: timeLeft
              });
            }
          }
        })();
      } catch (e) {
        logger.error("Ошибка при локальном возобновлении", e as Error, {
          operation: 'local_resume_error',
          courseId: courseId,
          day: day,
          stepIndex: stepIndex,
          durationSec: durationSec
        });
        get().resumeStepOffline(courseId, day, stepIndex);
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
