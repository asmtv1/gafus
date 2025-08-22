"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { TrainingDetail } from "@gafus/types";
import { useStepStore } from "@shared/stores/stepStore";
import { useTrainingStore } from "@shared/stores/trainingStore";
import { AccordionStep } from "./AccordionStep";
import styles from "./Day.module.css";

// Константы для статусов
const DAY_STATUS = {
  COMPLETED: "COMPLETED",
  IN_PROGRESS: "IN_PROGRESS",
  NOT_STARTED: "NOT_STARTED",
} as const;

const DAY_STATUS_CONFIG = {
  [DAY_STATUS.COMPLETED]: {
    text: "Завершен",
    className: "text-green-600 bg-green-100",
  },
  [DAY_STATUS.IN_PROGRESS]: {
    text: "В процессе",
    className: "text-blue-600 bg-blue-100",
  },
  [DAY_STATUS.NOT_STARTED]: {
    text: "Не начат",
    className: "text-gray-600 bg-gray-100",
  },
} as const;

interface DayProps {
  training: TrainingDetail;
}

export function Day({ training }: DayProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [runningIndex, setRunningIndex] = useState<number | null>(null);

  const { stepStates } = useStepStore();
  const {
    getOpenIndex,
    getRunningIndex,
    setOpenIndex: setStoreOpenIndex,
    setRunningIndex: setStoreRunningIndex,
    findRunningStepIndex,
    getDayStatus,
  } = useTrainingStore();

  // Утилиты для работы с ключами
  const getStepKey = useCallback(
    (stepIndex: number) => `${training.courseId}-${training.day}-${stepIndex}`,
    [training.courseId, training.day],
  );

  // Определяем статус дня через store
  const dayStatus = useMemo(() => {
    return getDayStatus(training.courseId, training.day, stepStates);
  }, [getDayStatus, training.courseId, training.day, stepStates]);

  // Логирование в error-dashboard
  const logToErrorDashboard = useCallback(
    async (
      message: string,
      level: "info" | "warn" | "error" = "info",
      meta?: Record<string, unknown>,
    ) => {
      try {
        const errorDashboardUrl =
          process.env.NEXT_PUBLIC_ERROR_DASHBOARD_URL || "http://localhost:3005";

        const logEntry = {
          message,
          level,
          context: "training-day",
          service: "training",
          additionalContext: {
            courseId: training.courseId,
            day: training.day,
            dayStatus,
            totalSteps: training.steps.length,
            completedSteps: training.steps.filter((_, index) => {
              const stepKey = getStepKey(index);
              const stepState = stepStates[stepKey];
              return stepState?.status === "COMPLETED";
            }).length,
            ...meta,
          },
          tags: [
            "training",
            "day-completion",
            level,
            `course-${training.courseId}`,
            `day-${training.day}`,
          ],
        };

        await fetch(`${errorDashboardUrl}/api/push-logs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(logEntry),
        });
      } catch {
        // Fallback на console если error-dashboard недоступен
        console.warn(`[${level.toUpperCase()}] ${message}`, meta);
      }
    },
    [training.courseId, training.day, dayStatus, training.steps, stepStates, getStepKey],
  );

  // Проверяем завершение дня
  const checkDayCompletion = useCallback(() => {
    if (dayStatus === DAY_STATUS.COMPLETED) {
      logToErrorDashboard(`День ${training.day} завершен`, "info", {
        courseId: training.courseId,
        day: training.day,
        completionTime: new Date().toISOString(),
      });
    }
  }, [dayStatus, training.day, training.courseId, logToErrorDashboard]);

  // Обработчики событий
  const handleStepStart = useCallback(
    async (stepIndex: number) => {
      if (stepIndex === -1) {
        setRunningIndex(null);
        setStoreRunningIndex(training.courseId, training.day, null);
        checkDayCompletion();
        return;
      }

      setRunningIndex(stepIndex);
      setStoreRunningIndex(training.courseId, training.day, stepIndex);
    },
    [training.courseId, training.day, setStoreRunningIndex, checkDayCompletion],
  );

  const handleReset = useCallback(
    (stepIndex: number) => {
      if (runningIndex === stepIndex) {
        setRunningIndex(null);
        setStoreRunningIndex(training.courseId, training.day, null);
      }
    },
    [runningIndex, training.courseId, training.day, setStoreRunningIndex],
  );

  const handleToggleOpen = useCallback(
    (index: number) => {
      const newOpenIndex = openIndex === index ? null : index;
      setOpenIndex(newOpenIndex);
      setStoreOpenIndex(training.courseId, training.day, newOpenIndex);
    },
    [openIndex, training.courseId, training.day, setStoreOpenIndex],
  );

  // Инициализация состояния при монтировании
  useEffect(() => {
    const savedOpenIndex = getOpenIndex(training.courseId, training.day);
    const savedRunningIndex = getRunningIndex(training.courseId, training.day);

    if (savedOpenIndex !== null) {
      setOpenIndex(savedOpenIndex);
    }

    if (savedRunningIndex !== null) {
      setRunningIndex(savedRunningIndex);
    }

    const activeStepIndex = findRunningStepIndex(
      training.courseId,
      training.day,
      training.steps.length,
    );

    if (activeStepIndex !== null) {
      setRunningIndex(activeStepIndex);
      setStoreRunningIndex(training.courseId, training.day, activeStepIndex);
    }

    // Проверяем завершение дня после инициализации
    const timer = setTimeout(checkDayCompletion, 1000);

    return () => clearTimeout(timer);
  }, [
    training.courseId,
    training.day,
    training.steps.length,
    findRunningStepIndex,
    setStoreRunningIndex,
    getOpenIndex,
    getRunningIndex,
    checkDayCompletion,
  ]);

  // Получаем конфигурацию статуса дня
  const statusConfig = DAY_STATUS_CONFIG[dayStatus];

  return (
    <div className={`${styles.main} ${dayStatus === DAY_STATUS.COMPLETED ? styles.finished : ""}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">
          День {training.day}
          {dayStatus === DAY_STATUS.COMPLETED && " ✅"}
        </h2>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusConfig.className}`}>
          {statusConfig.text}
        </span>
      </div>
      <p className="mb-6 text-gray-600">{training.description}</p>

      {training.steps.map((step, index) => (
        <div key={step.id} className={styles.accordionItem}>
          <div className={styles.accordionHeader} onClick={() => handleToggleOpen(index)}>
            <h3 className="text-lg font-semibold text-gray-800">{step.title}</h3>
            <span className="text-sm text-gray-500">
              {Math.floor(step.durationSec / 60)}:
              {(step.durationSec % 60).toString().padStart(2, "0")}
            </span>
          </div>

          {openIndex === index && (
            <div className={styles.accordionContent}>
              <AccordionStep
                courseId={training.courseId}
                day={training.day}
                stepIndex={index}
                durationSec={step.durationSec}
                stepTitle={step.title}
                stepOrder={step.order}
                onRun={handleStepStart}
                onReset={handleReset}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
