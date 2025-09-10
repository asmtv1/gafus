"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { TrainingDetail } from "@gafus/types";
import { useStepStore } from "@shared/stores/stepStore";
import { useTrainingStore } from "@shared/stores/trainingStore";
import { ExpandMoreIcon } from "@/utils/muiImports";
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
    text: "✅ Завершен",
    className: "text-green-600 bg-green-100",
    titleColor: "#B6C582",
  },
  [DAY_STATUS.IN_PROGRESS]: {
    text: "🔄 В процессе",
    className: "text-blue-600 bg-blue-100",
    titleColor: "#1f2937",
  },
  [DAY_STATUS.NOT_STARTED]: {
    text: "⏳ Не начат",
    className: "text-gray-600 bg-gray-100",
    titleColor: "#1f2937",
  },
} as const;

// Конфигурация для статусов шагов
const STEP_STATUS_CONFIG = {
  NOT_STARTED: {
    text: "⏳ Не начат",
    backgroundColor: "#FFF8E5",
  },
  IN_PROGRESS: {
    text: "🔄 В процессе",
    backgroundColor: "#E6F3FF",
  },
  COMPLETED: {
    text: "✅ Завершен",
    backgroundColor: "#B6C582",
  },
  PAUSED: {
    text: "⏸️ На паузе",
    backgroundColor: "#FFF4E6",
  },
} as const;

interface DayProps {
  training: TrainingDetail;
}

export function Day({ training }: DayProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [runningIndex, setRunningIndex] = useState<number | null>(null);

  const { stepStates, initializeStep } = useStepStore();
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
  const computedStatus = useMemo(() => {
    return getDayStatus(training.courseId, training.day, stepStates, training.steps.length);
  }, [getDayStatus, training.courseId, training.day, stepStates, training.steps.length]);

  // Текущий статус дня всегда вычисляем из локальных шагов (офлайн корректен)
  const dayStatus = computedStatus as keyof typeof DAY_STATUS_CONFIG;
  

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
    console.warn(`[Day] Initializing day ${training.day} with ${training.steps.length} steps`);
    // Инициализируем все шаги дня, чтобы корректно считать статус дня офлайн
    try {
      training.steps.forEach((step, index) => {
        console.warn(`[Day] Initializing step ${index}: ${step.title} with status ${step.status}`);
        initializeStep(
          training.courseId,
          training.day,
          index,
          step.durationSec,
          step.status,
        );
      });
    } catch {
      // no-op
    }
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
    training.steps,
    findRunningStepIndex,
    setStoreRunningIndex,
    getOpenIndex,
    getRunningIndex,
    checkDayCompletion,
    initializeStep,
  ]);

  // Получаем конфигурацию статуса дня
  const statusConfig = DAY_STATUS_CONFIG[dayStatus];

  return (
    <div className={`${styles.main} ${dayStatus === DAY_STATUS.COMPLETED ? styles.finished : ""}`}>
      <div className={styles.dayHeader}>
        <h2 
          className={styles.dayTitle}
          style={{ color: statusConfig.titleColor }}
        >
          День {training.day}
        </h2>
        <span
          className={`${styles.statusBadge} ${statusConfig.className}`}
          suppressHydrationWarning
        >
          {statusConfig.text}
        </span>
      </div>
      <p className={styles.dayDescription}>{training.description}</p>

      {training.steps.map((step, index) => {
        // Получаем статус шага из store
        const stepKey = getStepKey(index);
        const stepState = stepStates[stepKey];
        const stepStatus = stepState?.status || step.status || "NOT_STARTED";
        const stepStatusConfig = STEP_STATUS_CONFIG[stepStatus as keyof typeof STEP_STATUS_CONFIG] || STEP_STATUS_CONFIG.NOT_STARTED;
        
        return (
          <div key={step.id} className={styles.accordionItem}>
            <div 
              className={styles.accordionHeader} 
              onClick={() => handleToggleOpen(index)}
              style={{ backgroundColor: stepStatusConfig.backgroundColor }}
            >
              <div className={styles.stepTitleContainer}>
                <ExpandMoreIcon 
                  className={`${styles.expandIcon} ${openIndex === index ? styles.expanded : ''}`} 
                />
                <h3 className={styles.stepTitle}>
                  <div className={styles.stepTitleText}>
                    <span>{`Упражнение #${step.order}. `}{`«${step.title}»`} </span>
                    <span>{stepStatusConfig.text}</span>
                  </div>
                </h3>
              </div>
            </div>

            {openIndex === index && (
              <div className={styles.accordionContent}>
                <AccordionStep
                  courseId={training.courseId}
                  day={training.day}
                  stepIndex={index}
                  durationSec={step.durationSec}
                  stepTitle={step.title}
                  stepDescription={step.description}
                  stepOrder={step.order}
                  totalSteps={training.steps.length}
                  initialStatus={step.status}
                  videoUrl={step.videoUrl}
                  onRun={handleStepStart}
                  onReset={handleReset}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
