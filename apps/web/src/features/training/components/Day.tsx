"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import type { TrainingDetail } from "@gafus/types";
import { useStepStore } from "@shared/stores/stepStore";
import { useTrainingStore } from "@shared/stores/trainingStore";
import { ExpandMoreIcon } from "@/utils/muiImports";
import { AccordionStep } from "./AccordionStep";
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
}

export function Day({ training }: DayProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [runningIndex, setRunningIndex] = useState<number | null>(null);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState<boolean>(false);

  const { stepStates, initializeStep } = useStepStore();
  const {
    getOpenIndex,
    getRunningIndex,
    setOpenIndex: setStoreOpenIndex,
    setRunningIndex: setStoreRunningIndex,
    findRunningStepIndex,
  } = useTrainingStore();

  // Утилиты для работы с ключами
  const getStepKey = useCallback(
    (stepIndex: number) => `${training.courseId}-${training.day}-${stepIndex}`,
    [training.courseId, training.day],
  );

  // Обработчики событий
  const handleStepStart = useCallback(
    async (stepIndex: number) => {
      if (stepIndex === -1) {
        setRunningIndex(null);
        setStoreRunningIndex(training.courseId, training.day, null);
        return;
      }

      setRunningIndex(stepIndex);
      setStoreRunningIndex(training.courseId, training.day, stepIndex);
    },
    [training.courseId, training.day, setStoreRunningIndex],
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

  const handleToggleDescription = useCallback(() => {
    setIsDescriptionOpen(prev => !prev);
  }, []);

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

  }, [
    training.courseId,
    training.day,
    training.steps,
    findRunningStepIndex,
    setStoreRunningIndex,
    getOpenIndex,
    getRunningIndex,
    initializeStep,
  ]);

  return (
    <div className={styles.main}>
      <div className={styles.dayHeader}>
        <h2 className={styles.dayTitle}>
          День {training.day}
        </h2>
      </div>
      <div className={`${styles.descriptionContainer} ${isDescriptionOpen ? styles.expanded : ''}`}>
        <div 
          className={styles.descriptionHeader} 
          onClick={handleToggleDescription}
        >
          <h3 className={styles.descriptionTitle}>Описание дня</h3>
          <ExpandMoreIcon 
            className={`${styles.expandIcon} ${isDescriptionOpen ? styles.expanded : ''}`} 
          />
        </div>
        <div className={`${styles.dayDescription} ${isDescriptionOpen ? styles.expanded : styles.collapsed}`}>
          <ReactMarkdown>{training.description || ""}</ReactMarkdown>
        </div>
      </div>

      {training.steps.map((step, index) => {
        // Получаем статус шага из store
        const stepKey = getStepKey(index);
        const stepState = stepStates[stepKey];
        const stepStatus = stepState?.status || step.status || "NOT_STARTED";
        const stepStatusConfig = STEP_STATUS_CONFIG[stepStatus as keyof typeof STEP_STATUS_CONFIG] || STEP_STATUS_CONFIG.NOT_STARTED;
        
        return (
          <div key={`${step.id}-${index}`} className={styles.accordionItem}>
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
