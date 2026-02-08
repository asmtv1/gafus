"use client";

import type { StepType } from "./types";

import styles from "./AccordionStep.module.css";

interface StepTypeHeaderProps {
  type: StepType | undefined;
  estimatedDurationSec?: number | null;
}

const HEADERS: Record<NonNullable<StepType>, string> = {
  EXAMINATION: "Экзаменационный шаг",
  THEORY: "Теоретический шаг",
  BREAK: "Перерыв",
  PRACTICE: "Упражнение без таймера",
  DIARY: "Дневник успехов",
  TRAINING: "Тренировка",
};

export function StepTypeHeader({ type, estimatedDurationSec }: StepTypeHeaderProps) {
  if (!type || type === "TRAINING") return null;

  const title = HEADERS[type];
  const showDuration =
    typeof estimatedDurationSec === "number" &&
    estimatedDurationSec > 0 &&
    (type === "EXAMINATION" || type === "THEORY" || type === "PRACTICE");

  return (
    <div className={styles.timerCard}>
      <div className={styles.timerHeader}>
        <span>{title}</span>
      </div>
      {showDuration && (
        <div className={styles.estimatedTimeBadge}>
          {type === "PRACTICE"
            ? `Примерное время: ~${Math.round(estimatedDurationSec / 60)} мин`
            : `Этот шаг займёт ~ ${Math.round(estimatedDurationSec / 60)} мин`}
        </div>
      )}
    </div>
  );
}
