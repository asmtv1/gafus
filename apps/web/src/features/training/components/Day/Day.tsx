"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

import {
  getDayTitle,
  getStepDisplayStatus,
  getStepKey,
  STEP_STATUS_LABELS,
} from "@gafus/core/utils/training";
import { TrainingStatus, type TrainingDetail } from "@gafus/types";
import { useDayStepStates, useStepStore } from "@shared/stores/stepStore";
import { useTrainingStore } from "@shared/stores/trainingStore";
import { markTheoryStepAsCompleted } from "@shared/lib/training/markTheoryStepAsCompleted";
import { ExpandMoreIcon } from "@shared/utils/muiImports";
import { AccordionStep } from "../AccordionStep";
import { generateCoursePathPdf } from "@shared/lib/actions/generateCoursePathPdf";
import styles from "./Day.module.css";

// Цвета и эмодзи для статусов (текст — из STEP_STATUS_LABELS в core)
const STEP_STATUS_CONFIG = {
  NOT_STARTED: { emoji: "⏳", backgroundColor: "#FFF8E5" },
  IN_PROGRESS: { emoji: "🔄", backgroundColor: "#E6F3FF" },
  COMPLETED: { emoji: "✅", backgroundColor: "#B6C582" },
  PAUSED: { emoji: "⏸️", backgroundColor: "#FFF4E6" },
  RESET: { emoji: "🔄", backgroundColor: "#E8E6E6" },
} as const;

interface DayProps {
  training: TrainingDetail;
  courseType: string;
}

export function Day({ training, courseType }: DayProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [runningIndex, setRunningIndex] = useState<number | null>(null);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const stepStates = useDayStepStates(training.courseId, training.dayOnCourseId);
  const stepStoreRehydrated = useStepStore((s) => s._rehydrated);
  const initializeStep = useStepStore((s) => s.initializeStep);
  const updateStepStatus = useStepStore((s) => s.updateStepStatus);
  const {
    getOpenIndex,
    getRunningIndex,
    setOpenIndex: setStoreOpenIndex,
    setRunningIndex: setStoreRunningIndex,
    findRunningStepIndex,
  } = useTrainingStore();

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
        const stepKey = getStepKey(training.courseId, training.dayOnCourseId, index);
        const stepState = stepStates[stepKey];
        const currentStatus = getStepDisplayStatus(stepState, step);

        if (step.type === "THEORY" && currentStatus === TrainingStatus.NOT_STARTED) {
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
      setStoreOpenIndex,
      updateStepStatus,
    ],
  );

  const handleToggleDescription = useCallback(() => {
    setIsDescriptionOpen((prev) => !prev);
  }, []);

  // Стабильная подпись шагов для deps эффекта (не включаем объект training.steps)
  const stepsSignature = useMemo(
    () => training.steps.map((s) => s.id).join(","),
    [training.steps],
  );

  // Ждём rehydration stepStore (persist), иначе при обновлении страницы RESET перезапишется серверным PAUSED
  const [initReady, setInitReady] = useState(false);
  useEffect(() => {
    if (stepStoreRehydrated) {
      setInitReady(true);
      return;
    }
    const t = setTimeout(() => setInitReady(true), 600);
    return () => clearTimeout(t);
  }, [stepStoreRehydrated]);

  // Инициализация состояния при монтировании (после rehydrate)
  useEffect(() => {
    if (!initReady) return;
    const stepStore = useStepStore.getState();
    const prefix = `${training.courseId}-${training.dayOnCourseId}-`;
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
    initReady,
    training.courseId,
    training.dayOnCourseId,
    stepsSignature,
    training.steps.length,
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
          {getDayTitle(training.type, training.displayDayNumber)}
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

      {training.type === "summary" && training.showCoursePathExport && (
        <div className={styles.exportPathBlock} style={{ marginTop: 16, marginBottom: 16 }}>
          <button
            type="button"
            className={styles.exportPathButton}
            disabled={isGenerating}
            onClick={async () => {
              setIsGenerating(true);
              setExportError(null);
              try {
                const result = await generateCoursePathPdf(training.courseId);
                if (!result.success) {
                  setExportError(result.error);
                  return;
                }
                const response = await fetch(
                  `data:application/pdf;base64,${result.data}`,
                );
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = result.fileName || "Ваш-путь.pdf";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              } catch (err) {
                setExportError(
                  err instanceof Error ? err.message : "Не удалось скачать PDF",
                );
              } finally {
                setIsGenerating(false);
              }
            }}
          >
            {isGenerating ? "Генерация…" : "Экспортировать «Ваш путь»"}
          </button>
          {exportError && <p className={styles.exportError}>{exportError}</p>}
        </div>
      )}

      {training.steps.map((step, index) => {
        const isBreakStep = step.type === "BREAK";
        const isDiaryStep = step.type === "DIARY";
        const exerciseNumber = (isBreakStep || isDiaryStep) ? null : ++exerciseCounter;
        // Получаем статус шага из store
        const stepKey = getStepKey(training.courseId, training.dayOnCourseId, index);
        const stepStatus = getStepDisplayStatus(stepStates[stepKey], step);

        const statusConfig =
          STEP_STATUS_CONFIG[stepStatus as keyof typeof STEP_STATUS_CONFIG] ||
          STEP_STATUS_CONFIG.NOT_STARTED;
        const statusText =
          STEP_STATUS_LABELS[stepStatus as TrainingStatus] ??
          STEP_STATUS_LABELS[TrainingStatus.NOT_STARTED];

        return (
          <div key={`${step.id}-${index}`} className={styles.accordionItem}>
            <div
              className={styles.accordionHeader}
              onClick={() => handleToggleOpen(index)}
              style={{ backgroundColor: statusConfig.backgroundColor }}
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
                    <span>
                      {isBreakStep ? "Перерыв" : isDiaryStep ? "Дневник успехов" : `Упражнение #${exerciseNumber}`}
                    </span>
                    <span>{step.type === "BREAK" ? step.title : `«${step.title}»`}</span>
                  </div>
                </h3>
                <div className={styles.stepStatusConfig}>
                  <span>{statusConfig.emoji} {statusText}</span>
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
