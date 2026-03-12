"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { getDayKey } from "@gafus/core/utils/training";
import { getDayTitle } from "@gafus/core/utils/training";
import type { TrainingDetail } from "@gafus/types";
import { useStepStore } from "@shared/stores/stepStore";
import {
  useDayRunningIndex,
  useTrainingStore,
} from "@shared/stores/trainingStore";
import { ExpandMoreIcon } from "@shared/utils/muiImports";
import { DayAccordionItem } from "./DayAccordionItem";
import { generateCoursePathPdf } from "@shared/lib/actions/generateCoursePathPdf";
import styles from "./Day.module.css";

interface DayProps {
  training: TrainingDetail;
  courseType: string;
}

export function Day({ training, courseType }: DayProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const runningIndex = useDayRunningIndex(training.courseId, training.dayOnCourseId);
  const setStoreOpenIndex = useTrainingStore((s) => s.setOpenIndex);
  const setStoreRunningIndex = useTrainingStore((s) => s.setRunningIndex);

  const stepStoreRehydrated = useStepStore((s) => s._rehydrated);
  const initializeStep = useStepStore((s) => s.initializeStep);

  const handleOpenChange = useCallback(
    (newOpenIndex: number | null) => {
      setOpenIndex(newOpenIndex);
      setStoreOpenIndex(training.courseId, training.dayOnCourseId, newOpenIndex);
    },
    [training.courseId, training.dayOnCourseId, setStoreOpenIndex],
  );

  const handleStepStart = useCallback(
    async (stepIndex: number) => {
      setStoreRunningIndex(training.courseId, training.dayOnCourseId, stepIndex === -1 ? null : stepIndex);
    },
    [training.courseId, training.dayOnCourseId, setStoreRunningIndex],
  );

  const handleReset = useCallback(
    (stepIndex: number) => {
      if (runningIndex === stepIndex) {
        setStoreRunningIndex(training.courseId, training.dayOnCourseId, null);
      }
    },
    [runningIndex, training.courseId, training.dayOnCourseId, setStoreRunningIndex],
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

  // Инициализация stepStore и синхронизация openIndex из trainingStore (persist)
  // openIndex держим локально — иначе при setStoreRunningIndex (Play) возможна рассинхронизация
  useEffect(() => {
    if (!initReady) return;
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
      const dayKey = getDayKey(training.courseId, training.dayOnCourseId);
      const savedOpen = useTrainingStore.getState().openIndexes[dayKey];
      if (savedOpen !== undefined && savedOpen !== null) {
        setOpenIndex(savedOpen);
      }
    } catch {
      // no-op
    }
  }, [
    initReady,
    training.courseId,
    training.dayOnCourseId,
    stepsSignature,
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{training.description || ""}</ReactMarkdown>
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
        return (
          <DayAccordionItem
            key={`${step.id}-${index}`}
            training={training}
            courseType={courseType}
            index={index}
            step={step}
            exerciseNumber={exerciseNumber}
            openIndex={openIndex}
            onOpenChange={handleOpenChange}
            onStepStart={handleStepStart}
            onReset={handleReset}
          />
        );
      })}
    </div>
  );
}
