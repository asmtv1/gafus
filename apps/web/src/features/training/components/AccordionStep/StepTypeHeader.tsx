"use client";

import {
  shouldShowEstimatedDuration,
  STEP_TYPE_LABELS,
} from "@gafus/core/utils/training";
import type { StepType } from "./types";

import styles from "./AccordionStep.module.css";

interface StepTypeHeaderProps {
  type: StepType | undefined;
  estimatedDurationSec?: number | null;
}

export function StepTypeHeader({ type, estimatedDurationSec }: StepTypeHeaderProps) {
  if (!type || type === "TRAINING") return null;

  const title = STEP_TYPE_LABELS[type];
  const showDuration =
    typeof estimatedDurationSec === "number" &&
    estimatedDurationSec > 0 &&
    shouldShowEstimatedDuration(type);

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
