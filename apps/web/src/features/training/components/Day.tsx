"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { TrainingDetail } from "@gafus/types";
import { useStepStore } from "@shared/stores/stepStore";
import { useTrainingStore } from "@shared/stores/trainingStore";
import { AccordionStep } from "./AccordionStep";
import styles from "./Day.module.css";

interface DayProps {
  training: TrainingDetail;
}

export function Day({ training }: DayProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [runningIndex, setRunningIndex] = useState<number | null>(null);

  // Получаем состояние и действия из stepStore
  const { stepStates } = useStepStore();

  // Получаем состояние и действия из trainingStore
  const {
    getOpenIndex,
    getRunningIndex,
    setOpenIndex: setStoreOpenIndex,
    setRunningIndex: setStoreRunningIndex,
    findRunningStepIndex,
  } = useTrainingStore();

  // Инициализируем состояние при монтировании
  useEffect(() => {
    // Восстанавливаем состояние из store
    const savedOpenIndex = getOpenIndex(training.courseId, training.day);
    const savedRunningIndex = getRunningIndex(training.courseId, training.day);

    if (savedOpenIndex !== null) {
      setOpenIndex(savedOpenIndex);
    }

    if (savedRunningIndex !== null) {
      setRunningIndex(savedRunningIndex);
    }

    // Восстанавливаем состояние из localStorage
    const activeStepIndex = findRunningStepIndex(
      training.courseId,
      training.day,
      training.steps.length,
    );

    if (activeStepIndex !== null) {
      setRunningIndex(activeStepIndex);
      setStoreRunningIndex(training.courseId, training.day, activeStepIndex);
    }

    // Проверяем завершение дня при инициализации
    const timer = setTimeout(() => {
      checkDayCompletion();
    }, 1000); // Даем время на полную инициализацию состояния шагов

    return () => clearTimeout(timer);
  }, [
    training,
    findRunningStepIndex,
    setStoreRunningIndex,
    getOpenIndex,
    getRunningIndex,
    training.courseId,
    training.day,
  ]);

  // Проверяем завершение дня
  const checkDayCompletion = useCallback(() => {
    const allStepsCompleted = training.steps.every((_, index) => {
      const stepKey = `${training.courseId}-${training.day}-${index}`;
      const stepState = stepStates[stepKey];
      return stepState && stepState.status === "COMPLETED";
    });

    if (allStepsCompleted) {
      if (process.env.NODE_ENV === "development") {
        console.log(`🎉 День ${training.day} полностью завершен!`);
      }
      // Здесь можно добавить логику для пометки дня как завершенного
      // Например, обновить статус на сервере или показать уведомление
    }
  }, [training.courseId, training.day, training.steps, stepStates]);

  const handleStepStart = useCallback(
    async (stepIndex: number) => {
      if (stepIndex === -1) {
        // Шаг завершен
        setRunningIndex(null);
        setStoreRunningIndex(training.courseId, training.day, null);

        // Проверяем, все ли шаги в дне завершены
        checkDayCompletion();
        return;
      }

      setRunningIndex(stepIndex);
      setStoreRunningIndex(training.courseId, training.day, stepIndex);
    },
    [training.courseId, training.day, setStoreRunningIndex, checkDayCompletion],
  );

  // Проверяем, все ли шаги завершены для определения статуса дня
  const allStepsCompleted = useMemo(() => {
    return training.steps.every((_, index) => {
      const stepKey = `${training.courseId}-${training.day}-${index}`;
      const stepState = stepStates[stepKey];
      return stepState && stepState.status === "COMPLETED";
    });
  }, [training.courseId, training.day, training.steps, stepStates]);

  const handleReset = useCallback(
    async (stepIndex: number) => {
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

  return (
    <div className={`${styles.main} ${allStepsCompleted ? styles.finished : ""}`}>
      <h2 className="mb-4 text-2xl font-bold text-gray-800">
        День {training.day}
        {allStepsCompleted && " ✅"}
      </h2>
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
                isRunning={runningIndex === index}
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
