"use client";

import { useState, useEffect } from "react";
import { useStepStore } from "@shared/stores/stepStore";
import { useTimerStore } from "@shared/stores/timerStore";
import { useOfflineStore } from "@shared/stores/offlineStore";

interface OfflineTimerTestProps {
  courseId: string;
  day: number;
  stepIndex: number;
  durationSec: number;
}

export function OfflineTimerTest({
  courseId,
  day,
  stepIndex,
  durationSec,
}: OfflineTimerTestProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [syncQueueLength, setSyncQueueLength] = useState(0);

  const { stepStates, initializeStep, pauseStep, resumeStep } = useStepStore();
  const {
    startTimer,
    stopTimer,
    pauseStepWithServer,
    resumeStepWithServer,
    canStartStep,
  } = useTimerStore();
  const { isOnline: offlineIsOnline, syncQueue } = useOfflineStore();

  const stepKey = `${courseId}-${day}-${stepIndex}`;
  const stepState = stepStates[stepKey];

  // Инициализируем шаг
  useEffect(() => {
    initializeStep(courseId, day, stepIndex, durationSec);
  }, [courseId, day, stepIndex, durationSec, initializeStep]);

  // Отслеживаем изменения статуса сети
  useEffect(() => {
    setIsOnline(offlineIsOnline);
  }, [offlineIsOnline]);

  // Отслеживаем длину очереди синхронизации
  useEffect(() => {
    setSyncQueueLength(syncQueue.length);
  }, [syncQueue]);

  const handleStart = async () => {
    if (!canStartStep(courseId, day, stepIndex)) {
      alert("Один шаг уже активен!");
      return;
    }

    try {
      // Используем серверную функцию запуска с офлайн поддержкой
      const { startStepWithServer } = useTimerStore.getState();
      await startStepWithServer(courseId, day, stepIndex, durationSec);
      
      // Обновляем локальное состояние
      const { startStep } = useStepStore.getState();
      await startStep(courseId, day, stepIndex, durationSec);
      
      // Запускаем таймер
      const timerStarted = startTimer(
        courseId,
        day,
        stepIndex,
        (timeLeft: number) => {
          // Обновляем время в stepStore
          const { updateTimeLeft } = useStepStore.getState();
          updateTimeLeft(courseId, day, stepIndex, timeLeft);
        },
        () => {
          // Завершение таймера
          const { finishStep } = useStepStore.getState();
          finishStep(courseId, day, stepIndex);
          console.log("Таймер завершен!");
        }
      );

      if (timerStarted) {
        console.log("Таймер запущен!");
      }
    } catch (error) {
      console.error("Ошибка при запуске:", error);
      // Все равно выполняем локальный запуск
      const { startStep } = useStepStore.getState();
      await startStep(courseId, day, stepIndex, durationSec);
      
      const timerStarted = startTimer(
        courseId,
        day,
        stepIndex,
        (timeLeft: number) => {
          const { updateTimeLeft } = useStepStore.getState();
          updateTimeLeft(courseId, day, stepIndex, timeLeft);
        },
        () => {
          const { finishStep } = useStepStore.getState();
          finishStep(courseId, day, stepIndex);
          console.log("Таймер завершен!");
        }
      );

      if (timerStarted) {
        console.log("Таймер запущен локально!");
      }
    }
  };

  const handlePause = async () => {
    try {
      await pauseStepWithServer(courseId, day, stepIndex);
      pauseStep(courseId, day, stepIndex);
      stopTimer(courseId, day, stepIndex);
      console.log("Таймер поставлен на паузу!");
    } catch (error) {
      console.error("Ошибка при паузе:", error);
    }
  };

  const handleResume = async () => {
    try {
      await resumeStepWithServer(courseId, day, stepIndex, durationSec);
      resumeStep(courseId, day, stepIndex);
      
      // Запускаем таймер снова
      const timerStarted = startTimer(
        courseId,
        day,
        stepIndex,
        (timeLeft: number) => {
          const { updateTimeLeft } = useStepStore.getState();
          updateTimeLeft(courseId, day, stepIndex, timeLeft);
        },
        () => {
          const { finishStep } = useStepStore.getState();
          finishStep(courseId, day, stepIndex);
          console.log("Таймер завершен!");
        },
        true // isRestore
      );

      if (timerStarted) {
        console.log("Таймер возобновлен!");
      }
    } catch (error) {
      console.error("Ошибка при возобновлении:", error);
    }
  };

  const handleReset = async () => {
    try {
      // Используем серверную функцию сброса с офлайн поддержкой
      const { resetStepWithServer } = useTimerStore.getState();
      await resetStepWithServer(courseId, day, stepIndex);
      
      // Останавливаем таймер
      stopTimer(courseId, day, stepIndex);
      
      // Сбрасываем локальное состояние
      const { resetStep } = useStepStore.getState();
      resetStep(courseId, day, stepIndex, durationSec);
      
      console.log("Таймер сброшен!");
    } catch (error) {
      console.error("Ошибка при сбросе:", error);
      // Все равно выполняем локальный сброс
      stopTimer(courseId, day, stepIndex);
      const { resetStep } = useStepStore.getState();
      resetStep(courseId, day, stepIndex, durationSec);
      console.log("Таймер сброшен локально!");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc", margin: "10px" }}>
      <h3>Тест офлайн таймера</h3>
      
      <div style={{ marginBottom: "10px" }}>
        <strong>Статус сети:</strong> {isOnline ? "🟢 Онлайн" : "🔴 Офлайн"}
      </div>
      
      <div style={{ marginBottom: "10px" }}>
        <strong>Очередь синхронизации:</strong> {syncQueueLength} действий
      </div>

      <div style={{ marginBottom: "10px" }}>
        <strong>Статус шага:</strong> {stepState?.status || "Не инициализирован"}
      </div>

      <div style={{ marginBottom: "10px" }}>
        <strong>Оставшееся время:</strong> {stepState?.timeLeft ? formatTime(stepState.timeLeft) : "00:00"}
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
        <button onClick={handleStart} disabled={stepState?.status === "IN_PROGRESS"}>
          Начать
        </button>
        
        <button 
          onClick={handlePause} 
          disabled={stepState?.status !== "IN_PROGRESS"}
        >
          Пауза
        </button>
        
        <button 
          onClick={handleResume} 
          disabled={stepState?.status !== "PAUSED"}
        >
          Продолжить
        </button>
        
        <button onClick={handleReset}>
          Сброс
        </button>
      </div>

      <div style={{ fontSize: "12px", color: "#666" }}>
        <p>Инструкции для тестирования:</p>
        <ol>
          <li>Нажмите "Начать" для запуска таймера</li>
          <li>Отключите интернет (DevTools → Network → Offline)</li>
          <li>Нажмите "Пауза" - действие должно сохраниться локально</li>
          <li>Нажмите "Продолжить" - действие должно добавиться в очередь синхронизации</li>
          <li>Включите интернет - действия должны синхронизироваться</li>
        </ol>
      </div>
    </div>
  );
}
