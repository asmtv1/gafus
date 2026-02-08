"use client";

import { AccessTimeIcon, PauseIcon, PlayArrowIcon, ReplayIcon } from "@shared/utils/muiImports";

import type { StepType } from "./types";

import styles from "./AccordionStep.module.css";

interface StepTimerCardProps {
  displayTimeLeft: number;
  stepState: { status: string };
  isActuallyRunning: boolean;
  isPausing: boolean;
  type: StepType | undefined;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
}

export function StepTimerCard({
  displayTimeLeft,
  stepState,
  isActuallyRunning,
  isPausing,
  type,
  onStart,
  onPause,
  onReset,
}: StepTimerCardProps) {
  const label =
    type === "BREAK"
      ? "Начни перерыв"
      : stepState.status === "RESET"
        ? "Сброшен"
        : "Начните занятие!";

  return (
    <div className={styles.timerCard}>
      <div className={styles.timerHeader}>
        <AccessTimeIcon fontSize="small" />
        <span>{label}</span>
      </div>
      <div className={styles.controlRow}>
        <div className={styles.timerDisplay}>
          {`${Math.floor(displayTimeLeft / 60)}:${(displayTimeLeft % 60)
            .toString()
            .padStart(2, "0")}`}
        </div>
        {(stepState.status === "NOT_STARTED" || stepState.status === "RESET") && (
          <button onClick={onStart} className={styles.circleBtn} aria-label="start">
            <PlayArrowIcon />
          </button>
        )}
        {stepState.status === "IN_PROGRESS" && isActuallyRunning && (
          <button
            onClick={onPause}
            disabled={isPausing}
            className={styles.circleBtn}
            aria-label="pause"
          >
            <PauseIcon />
          </button>
        )}
        {((stepState.status === "IN_PROGRESS" && !isActuallyRunning) ||
          stepState.status === "PAUSED") && (
          <button
            onClick={onPause}
            disabled={isPausing}
            className={styles.circleBtn}
            aria-label="resume"
          >
            <PlayArrowIcon />
          </button>
        )}
        <button onClick={onReset} className={styles.circleBtnReset} aria-label="reset">
          <ReplayIcon />
        </button>
      </div>
    </div>
  );
}
