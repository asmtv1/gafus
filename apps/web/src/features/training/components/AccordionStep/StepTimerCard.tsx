"use client";

import { AccessTimeIcon, PauseIcon, PlayArrowIcon, ReplayIcon } from "@shared/utils/muiImports";

import { formatTimeLeft } from "@gafus/core/utils/training";

import { useLiveTimeLeft } from "@shared/stores/timerStore";

import type { StepType } from "./types";

import styles from "./AccordionStep.module.css";

interface StepTimerCardProps {
  stepKey: string;
  hasActiveTimer: boolean;
  stepState: { status: string; timeLeft?: number };
  isActuallyRunning: boolean;
  isPausing: boolean;
  isPending?: boolean;
  type: StepType | undefined;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
}

export function StepTimerCard({
  stepKey,
  hasActiveTimer,
  stepState,
  isActuallyRunning,
  isPausing,
  isPending = false,
  type,
  onStart,
  onPause,
  onReset,
}: StepTimerCardProps) {
  const liveFromStore = useLiveTimeLeft(stepKey);
  const displayTimeLeft = hasActiveTimer
    ? (liveFromStore ?? stepState?.timeLeft ?? 0)
    : (stepState?.timeLeft ?? 0);
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
          {formatTimeLeft(displayTimeLeft)}
        </div>
        {(stepState.status === "NOT_STARTED" || stepState.status === "RESET") && (
          <button
            onClick={onStart}
            disabled={isPending}
            className={styles.circleBtn}
            aria-label="start"
          >
            <PlayArrowIcon />
          </button>
        )}
        {stepState.status === "IN_PROGRESS" && isActuallyRunning && (
          <button
            onClick={onPause}
            disabled={isPausing || isPending}
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
            disabled={isPausing || isPending}
            className={styles.circleBtn}
            aria-label="resume"
          >
            <PlayArrowIcon />
          </button>
        )}
        <button
          onClick={onReset}
          disabled={isPending}
          className={styles.circleBtnReset}
          aria-label="reset"
        >
          <ReplayIcon />
        </button>
      </div>
    </div>
  );
}
