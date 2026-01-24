"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import type { TrainingDetail } from "@gafus/types";
import { useStepStore } from "@shared/stores/stepStore";
import { useTrainingStore } from "@shared/stores/trainingStore";
import { markTheoryStepAsCompleted } from "@shared/lib/training/markTheoryStepAsCompleted";
import { ExpandMoreIcon } from "@shared/utils/muiImports";
import { AccordionStep } from "../AccordionStep";
import styles from "./Day.module.css";

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
  courseType: string;
}

export function Day({ training, courseType }: DayProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [runningIndex, setRunningIndex] = useState<number | null>(null);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState<boolean>(false);

  const { stepStates, initializeStep, updateStepStatus } = useStepStore();
  const {
    getOpenIndex,
    getRunningIndex,
    setOpenIndex: setStoreOpenIndex,
    setRunningIndex: setStoreRunningIndex,
    findRunningStepIndex,
  } = useTrainingStore();

  // Утилиты для работы с ключами
  const getStepKey = useCallback(
    (stepIndex: number) => `${training.courseId}-${training.dayOnCourseId}-${stepIndex}`,
    [training.courseId, training.dayOnCourseId],
  );

  // Обработчики событий
  const handleStepStart = useCallback(
    async (stepIndex: number) => {
      if (stepIndex === -1) {
        setRunningIndex(null);
        setStoreRunningIndex(training.courseId, training.dayOnCourseId, null);
        return;
      }

      setRunningIndex(stepIndex);
      setStoreRunningIndex(training.courseId, training.dayOnCourseId, stepIndex);
    },
    [training.courseId, training.dayOnCourseId, setStoreRunningIndex],
  );

  const handleReset = useCallback(
    (stepIndex: number) => {
      if (runningIndex === stepIndex) {
        setRunningIndex(null);
        setStoreRunningIndex(training.courseId, training.dayOnCourseId, null);
      }
    },
    [runningIndex, training.courseId, training.dayOnCourseId, setStoreRunningIndex],
  );

  const handleToggleOpen = useCallback(
    async (index: number) => {
      const newOpenIndex = openIndex === index ? null : index;
      setOpenIndex(newOpenIndex);
      setStoreOpenIndex(training.courseId, training.dayOnCourseId, newOpenIndex);

      // Если открываем шаг типа THEORY с статусом NOT_STARTED, отмечаем его как завершенный
      if (newOpenIndex !== null) {
        const step = training.steps[index];
        const stepKey = getStepKey(index);
        const stepState = stepStates[stepKey];
        const currentStatus = stepState?.status || step.status || "NOT_STARTED";

        if (step.type === "THEORY" && currentStatus === "NOT_STARTED") {
          try {
            await markTheoryStepAsCompleted(
              training.courseId,
              training.dayOnCourseId,
              index,
              step.title,
              step.order,
            );

            // Обновляем локальное состояние шага на COMPLETED
            updateStepStatus(training.courseId, training.dayOnCourseId, index, "COMPLETED");
          } catch (error) {
            // Ошибка уже обработана в server action, не прерываем работу UI
            console.error("Failed to mark theory step as completed:", error);
          }
        }
      }
    },
    [
      openIndex,
      training.courseId,
      training.dayOnCourseId,
      training.steps,
      stepStates,
      getStepKey,
      setStoreOpenIndex,
      updateStepStatus,
    ],
  );

  const handleToggleDescription = useCallback(() => {
    setIsDescriptionOpen((prev) => !prev);
  }, []);

  // Инициализация состояния при монтировании
  useEffect(() => {
    // Инициализируем все шаги дня, чтобы корректно считать статус дня офлайн
    try {
      training.steps.forEach((step, index) => {
        initializeStep(
          training.courseId,
          training.dayOnCourseId,
          index,
          step.durationSec,
          step.status,
          {
            serverPaused: Boolean(step.isPausedOnServer),
            serverRemainingSec: step.remainingSecOnServer,
          },
        );
      });
    } catch {
      // no-op
    }
    const savedOpenIndex = getOpenIndex(training.courseId, training.dayOnCourseId);
    const savedRunningIndex = getRunningIndex(training.courseId, training.dayOnCourseId);

    if (savedOpenIndex !== null) {
      setOpenIndex(savedOpenIndex);
    }

    if (savedRunningIndex !== null) {
      setRunningIndex(savedRunningIndex);
    }

    const activeStepIndex = findRunningStepIndex(
      training.courseId,
      training.dayOnCourseId,
      training.steps.length,
    );

    if (activeStepIndex !== null) {
      setRunningIndex(activeStepIndex);
      setStoreRunningIndex(training.courseId, training.dayOnCourseId, activeStepIndex);
    }
  }, [
    training.courseId,
    training.dayOnCourseId,
    training.steps,
    findRunningStepIndex,
    setStoreRunningIndex,
    getOpenIndex,
    getRunningIndex,
    initializeStep,
  ]);

  let exerciseCounter = 0;

  return (
    <div className={styles.main}>
      <div className={styles.dayHeader}>
        <h2 className={styles.dayTitle}>
          {training.type === "instructions"
            ? "Инструкции"
            : training.type === "introduction"
              ? "Вводный блок"
              : training.type === "diagnostics"
                ? "Диагностика"
                : training.type === "summary"
                  ? "Подведение итогов"
                  : training.displayDayNumber
                    ? `День ${training.displayDayNumber}`
                    : "День"}
        </h2>
      </div>
      <div className={`${styles.descriptionContainer} ${isDescriptionOpen ? styles.expanded : ""}`}>
        <div className={styles.descriptionHeader} onClick={handleToggleDescription}>
          <h3 className={styles.descriptionTitle}>Описание дня</h3>
          <div className={styles.expandControl}>
            <span className={styles.expandText}>{isDescriptionOpen ? "Скрыть" : "Подробнее"}</span>
            <ExpandMoreIcon
              className={`${styles.expandIcon} ${isDescriptionOpen ? styles.expanded : ""}`}
            />
          </div>
        </div>
        <div
          className={`${styles.dayDescription} ${isDescriptionOpen ? styles.expanded : styles.collapsed}`}
        >
          <ReactMarkdown>{training.description || ""}</ReactMarkdown>
        </div>
      </div>

      {training.steps.map((step, index) => {
        const isBreakStep = step.type === "BREAK";
        const exerciseNumber = isBreakStep ? null : ++exerciseCounter;
        // Получаем статус шага из store
        const stepKey = getStepKey(index);
        const stepState = stepStates[stepKey];

        // Приоритет: локальное состояние > серверная пауза > базовый статус
        let stepStatus = stepState?.status || step.status || "NOT_STARTED";

        // Если локально не на паузе, но сервер говорит что на паузе - показываем паузу
        if (!stepState?.isPaused && step.isPausedOnServer) {
          stepStatus = "PAUSED";
        }

        const stepStatusConfig =
          STEP_STATUS_CONFIG[stepStatus as keyof typeof STEP_STATUS_CONFIG] ||
          STEP_STATUS_CONFIG.NOT_STARTED;

        return (
          <div key={`${step.id}-${index}`} className={styles.accordionItem}>
            <div
              className={styles.accordionHeader}
              onClick={() => handleToggleOpen(index)}
              style={{ backgroundColor: stepStatusConfig.backgroundColor }}
            >
              <div className={styles.stepTitleContainer}>
                <div className={styles.expandControl}>
                  <ExpandMoreIcon
                    className={`${styles.expandIcon} ${openIndex === index ? styles.expanded : ""}`}
                  />

                  <span className={styles.expandText}>
                    {openIndex === index ? "Скрыть" : "Подробнее"}
                  </span>
                </div>
                <h3 className={styles.stepTitle}>
                  <div className={styles.stepTitleText}>
                    <span>{isBreakStep ? "Перерыв" : `Упражнение #${exerciseNumber}`}</span>
                    <span>{step.type === "BREAK" ? step.title : `«${step.title}»`}</span>
                  </div>
                </h3>
                <div className={styles.stepStatusConfig}>
                  <span>{stepStatusConfig.text}</span>
                </div>
              </div>
            </div>

            {openIndex === index && (
              <div className={styles.accordionContent}>
                <AccordionStep
                  courseId={training.courseId}
                  courseType={courseType}
                  dayOnCourseId={training.dayOnCourseId}
                  stepIndex={index}
                  durationSec={step.durationSec}
                  estimatedDurationSec={step.estimatedDurationSec ?? null}
                  stepTitle={step.title}
                  stepDescription={step.description}
                  stepOrder={step.order}
                  totalSteps={training.steps.length}
                  initialStatus={step.status}
                  videoUrl={step.videoUrl}
                  imageUrls={step.imageUrls}
                  onRun={handleStepStart}
                  onReset={handleReset}
                  type={step.type}
                  checklist={step.checklist}
                  requiresVideoReport={step.requiresVideoReport}
                  requiresWrittenFeedback={step.requiresWrittenFeedback}
                  hasTestQuestions={step.hasTestQuestions}
                  userStepId={step.userStepId}
                  stepId={step.id}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
