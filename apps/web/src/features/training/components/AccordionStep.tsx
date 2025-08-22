"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useStepStore } from "@shared/stores/stepStore";
import { useTimerStore } from "@shared/stores/timerStore";
import { useTrainingStore } from "@shared/stores/trainingStore";
import styles from "./AccordionStep.module.css";

interface AccordionStepProps {
  courseId: string;
  day: number;
  stepIndex: number;
  durationSec: number;
  stepTitle: string;
  stepOrder: number;
  onRun: (stepIndex: number) => void;
  onReset: (stepIndex: number) => void;
}

export function AccordionStep({
  courseId,
  day,
  stepIndex,
  durationSec,
  stepTitle,
  stepOrder,
  onRun,
  onReset,
}: AccordionStepProps) {
  // Состояние для отслеживания загрузки
  const [isPausing, setIsPausing] = useState(false);

  // Функция для перевода статуса на русский язык
  const getStatusText = useCallback((status: string) => {
    switch (status) {
      case "NOT_STARTED":
        return "Не начат";
      case "IN_PROGRESS":
        return "В процессе";
      case "COMPLETED":
        return "Завершен";
      case "PAUSED":
        return "На паузе";
      default:
        return status;
    }
  }, []);
  const {
    stepStates,
    initializeStep,
    startStep,
    pauseStep,
    resumeStep,
    resetStep,
    updateTimeLeft,
    finishStep,
  } = useStepStore();
  const {
    startTimer,
    stopTimer,
    startStepWithServer,
    finishStepWithServer,
    resetStepWithServer,
    canStartStep,
  } = useTimerStore();
  const { togglePauseWithServer, resumeNotificationWithServer } = useTrainingStore();
  // Инициализируем шаг при монтировании
  useEffect(() => {
    initializeStep(courseId, day, stepIndex, durationSec);
  }, [courseId, day, stepIndex, durationSec, initializeStep]);

  // Получаем состояние шага
  const stepKey = useMemo(() => `${courseId}-${day}-${stepIndex}`, [courseId, day, stepIndex]);
  const stepState = stepStates[stepKey];

  // Получаем состояние таймера через хук
  const { timers } = useTimerStore();
  const hasActiveTimer = timers.has(stepKey);
  const isActuallyRunning = stepState?.status === "IN_PROGRESS" && hasActiveTimer;

  // Восстанавливаем таймер при перезагрузке страницы
  useEffect(() => {
    // Если шаг был в процессе выполнения - восстанавливаем таймер
    if (stepState?.status === "IN_PROGRESS") {
      // Проверяем, что таймер действительно нужен (есть время)
      if (stepState.timeLeft > 0) {
        // Даем время на полную инициализацию
        const timer = setTimeout(() => {
          // Проверяем, что таймер еще не запущен для этого шага
          const existingTimer = timers.get(stepKey);

          if (!existingTimer) {
            // Восстанавливаем таймер с флагом isRestore = true
            startTimer(
              courseId,
              day,
              stepIndex,
              (timeLeft: number) => updateTimeLeft(courseId, day, stepIndex, timeLeft),
              async () => {
                finishStep(courseId, day, stepIndex);

                // Обновляем статус на сервере
                try {
                  await finishStepWithServer(courseId, day, stepIndex, stepTitle, stepOrder);
                } catch (error) {
                  console.error("Ошибка при обновлении статуса шага на сервере:", error);
                  // Не показываем ошибку пользователя, так как действие добавлено в очередь синхронизации
                }

                onRun(-1);
              },
              true, // isRestore = true
            );
          } else {
            if (process.env.NODE_ENV === "development") {
              console.warn(`⏭️ Timer already exists for step: ${stepIndex}, skipping restoration`);
            }
          }
        }, 500); // Увеличиваем задержку для полной инициализации

        return () => clearTimeout(timer);
      }
    }
  }, [
    stepState?.status,
    stepState?.timeLeft,
    startTimer,
    courseId,
    day,
    stepIndex,
    updateTimeLeft,
    finishStep,
    finishStepWithServer,
    stepKey,
    stepOrder,
    stepTitle,
    timers,
    onRun,
  ]);

  // Вспомогательная функция для запуска таймера
  const startStepTimer = useCallback(
    (isResume = false) => {
      if (!canStartStep(courseId, day, stepIndex)) {
        alert("Один шаг уже активен. Сначала остановите его!");
        return false;
      }

      if (isResume) {
        resumeStep(courseId, day, stepIndex);
      }

      const timerStarted = startTimer(
        courseId,
        day,
        stepIndex,
        (timeLeft: number) => updateTimeLeft(courseId, day, stepIndex, timeLeft),
        async () => {
          finishStep(courseId, day, stepIndex);

          // Обновляем статус на сервере
          try {
            await finishStepWithServer(courseId, day, stepIndex, stepTitle, stepOrder);
          } catch (error) {
            console.error("Ошибка при обновлении статуса шага на сервере:", error);
            // Не показываем ошибку пользователю, так как действие добавлено в очередь синхронизации
          }

          onRun(-1);
        },
      );

      if (!timerStarted) {
        alert("Один шаг уже активен. Сначала остановите его!");
        return false;
      }

      return true;

      return true;
    },
    [
      canStartStep,
      courseId,
      day,
      stepIndex,
      resumeStep,
      startTimer,
      updateTimeLeft,
      finishStep,
      finishStepWithServer,
      stepTitle,
      stepOrder,
      onRun,
    ],
  );

  const handleStart = useCallback(async () => {
    try {
      // Проверяем, может ли шаг быть запущен
      if (!canStartStep(courseId, day, stepIndex)) {
        alert("Один шаг уже активен. Сначала остановите его!");
        return;
      }

      // Запускаем шаг на сервере
      await startStepWithServer(courseId, day, stepIndex, durationSec);

      // Обновляем локальное состояние
      const stepStarted = await startStep(courseId, day, stepIndex, durationSec);

      if (!stepStarted) {
        alert("Один шаг уже активен. Сначала остановите его!");
        return;
      }

      // Устанавливаем как активный
      onRun(stepIndex);

      // Запускаем таймер
      if (!startStepTimer(false)) {
        return;
      }
    } catch (error) {
      console.error("Ошибка при запуске шага:", error);
      alert("Ошибка при запуске шага");
    }
  }, [
    canStartStep,
    courseId,
    day,
    stepIndex,
    startStepWithServer,
    durationSec,
    startStep,
    onRun,
    startStepTimer,
  ]);

  const togglePause = useCallback(async () => {
    if (stepState?.status === "IN_PROGRESS") {
      if (isActuallyRunning) {
        // Если таймер работает - ставим на паузу
        setIsPausing(true);
        try {
          // Приостанавливаем уведомления на сервере
          await togglePauseWithServer(courseId, day, stepIndex);

          // Обновляем локальное состояние
          pauseStep(courseId, day, stepIndex);
          stopTimer(courseId, day, stepIndex);
        } catch (error) {
          console.error("Ошибка при постановке на паузу:", error);
          alert("Ошибка при постановке на паузу");
        } finally {
          setIsPausing(false);
        }
      } else {
        // Если таймер не работает, но статус IN_PROGRESS - возобновляем
        try {
          await resumeNotificationWithServer(courseId, day, stepIndex);
          startStepTimer(true);
        } catch (error) {
          console.error("Ошибка при возобновлении уведомлений:", error);
          alert("Ошибка при возобновлении уведомлений");
        }
      }
    } else if (stepState?.status === "PAUSED") {
      // Проверяем, может ли шаг быть возобновлен
      try {
        await resumeNotificationWithServer(courseId, day, stepIndex);
        startStepTimer(true);
      } catch (error) {
        console.error("Ошибка при возобновлении уведомлений:", error);
        alert("Ошибка при возобновлении уведомлений");
      }
    }
  }, [
    stepState?.status,
    isActuallyRunning,
    pauseStep,
    courseId,
    day,
    stepIndex,
    stopTimer,
    startStepTimer,
    togglePauseWithServer,
    resumeNotificationWithServer,
    setIsPausing,
  ]);

  const handleReset = useCallback(async () => {
    try {
      // Сбрасываем шаг на сервере
      await resetStepWithServer(courseId, day, stepIndex);

      // Останавливаем таймер
      stopTimer(courseId, day, stepIndex);

      // Сбрасываем локальное состояние
      resetStep(courseId, day, stepIndex, durationSec);

      // Уведомляем родителя
      onReset(stepIndex);
    } catch (error) {
      console.error("Ошибка при сбросе шага:", error);
      alert("Ошибка при сбросе шага");
    }
  }, [resetStepWithServer, courseId, day, stepIndex, durationSec, stopTimer, resetStep, onReset]);

  const renderActions = useCallback(() => {
    if (!stepState) return null;

    if (stepState.status === "NOT_STARTED") {
      return (
        <button onClick={handleStart} className={styles.btnPrimary}>
          Начать
        </button>
      );
    }

    if (stepState.status === "IN_PROGRESS") {
      // Показываем кнопки только если таймер действительно работает
      if (isActuallyRunning) {
        return (
          <div className={styles.stepActions}>
            <button onClick={togglePause} className={styles.btnSecondary} disabled={isPausing}>
              {isPausing ? "⏳ Пауза..." : "Пауза"}
            </button>
            <button onClick={handleReset} className={styles.btnOutline}>
              Сброс
            </button>
          </div>
        );
      } else {
        // Если статус IN_PROGRESS, но таймер не работает - показываем "Продолжить"
        return (
          <div className={styles.stepActions}>
            <button onClick={togglePause} className={styles.btnPrimary} disabled={isPausing}>
              {isPausing ? "⏳ Продолжить..." : "Продолжить"}
            </button>
            <button onClick={handleReset} className={styles.btnOutline}>
              Сброс
            </button>
          </div>
        );
      }
    }

    if (stepState.status === "PAUSED") {
      return (
        <div className={styles.stepActions}>
          <button onClick={togglePause} className={styles.btnPrimary} disabled={isPausing}>
            {isPausing ? "⏳ Продолжить..." : "Продолжить"}
          </button>
          <button onClick={handleReset} className={styles.btnOutline}>
            Сброс
          </button>
        </div>
      );
    }

    if (stepState.status === "COMPLETED") {
      return (
        <button onClick={handleReset} className={styles.btnOutline}>
          Сброс
        </button>
      );
    }

    return null;
  }, [stepState, isActuallyRunning, handleStart, togglePause, handleReset, isPausing]);

  if (!stepState) return null;

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <h3 className={styles.stepTitle}>
          {isActuallyRunning && "⏱"}
          {stepState.isFinished && "✅"}
          {stepState.status === "PAUSED" && "⏸"}
          {stepTitle}
        </h3>
        <div className={styles.timerDisplay}>
          {isActuallyRunning &&
            `Осталось: ${Math.floor(stepState.timeLeft / 60)}:${(stepState.timeLeft % 60).toString().padStart(2, "0")}`}
        </div>
      </div>

      <div className={styles.stepInfo}>
        <p>
          Длительность: {Math.floor(durationSec / 60)}:
          {(durationSec % 60).toString().padStart(2, "0")}
        </p>
        <p>Статус: {getStatusText(stepState.status)}</p>
      </div>

      <div className={styles.stepActions}>{renderActions()}</div>
    </div>
  );
}
