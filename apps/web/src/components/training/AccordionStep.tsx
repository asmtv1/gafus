"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateStepStatusServerAction } from "@/lib/training/updateUserStepStatus";
import { formatTime } from "@/utils/date";
import { declOfNum } from "@/utils/pluralize";
import { TrainingStatus } from "@gafus/types";
import type { TrainingStep } from "@gafus/types";
import { toggleStepNotificationPause } from "@web/lib/StepNotification/toggleStepNotificationPause";
import { startUserStepServerAction } from "@web/lib/training/startUserStepServerAction";
import { deletedStepNotification } from "@web/lib/StepNotification/deletedStepNotification";

// ─── Хелперы ───────────────────────────────────────────────────────────────────
const nowSec = () => Math.floor(Date.now() / 1000);
const makeEndKey = (day: number, idx: number) => `training-${day}-${idx}-end`;
const makeLeftKey = (day: number, idx: number) => `training-${day}-${idx}-left`;

const saveToLS = (key: string, val: string | number) =>
  localStorage.setItem(key, val.toString());

const loadFromLS = (key: string): string | null => localStorage.getItem(key);

const removeKeys = (...keys: string[]) =>
  keys.forEach((k) => localStorage.removeItem(k));
// ───────────────────────────────────────────────────────────────────────────────

interface AccordionStepProps {
  step: TrainingStep;
  stepIndex: number;
  courseType: string;
  day: number;
  isOpen: boolean;
  isRunning: boolean;
  onClick: () => void;
  onRun: (index: number) => void;
  onReset: (index: number) => void;
  handleFirstStart: () => void;
  styles: { [key: string]: string };
}

export default function AccordionStep({
  step,
  stepIndex,
  courseType,
  day,
  isOpen,
  isRunning,
  onClick,
  onRun,
  onReset,
  handleFirstStart,
  styles,
}: AccordionStepProps) {
  const END_KEY = makeEndKey(day, stepIndex);
  const LEFT_KEY = makeLeftKey(day, stepIndex);

  const [timeLeft, setTimeLeft] = useState(step.durationSec);
  const [isFinished, setIsFinished] = useState(
    step.status === TrainingStatus.COMPLETED
  );
  const [isPaused, setIsPaused] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // ─── Завершение ──────────────────────────────────────────────────────────────
  const finishStep = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsFinished(true);
    onReset(stepIndex);
    removeKeys(END_KEY, LEFT_KEY);
    audioRef.current?.play();

    await updateStepStatusServerAction(
      courseType,
      day,
      stepIndex,
      TrainingStatus.COMPLETED
    );
  }, [END_KEY, LEFT_KEY, courseType, day, stepIndex, onReset]);

  // ─── Старт ───────────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (isRunning || isFinished) return;

    const endTs = nowSec() + step.durationSec;
    saveToLS(END_KEY, endTs);
    removeKeys(LEFT_KEY);

    setTimeLeft(step.durationSec);
    setIsPaused(false);
    onRun(stepIndex);
    if (stepIndex === 0) handleFirstStart();

    await startUserStepServerAction(
      courseType,
      day,
      stepIndex,
      TrainingStatus.IN_PROGRESS,
      step.durationSec
    );
  }, [
    END_KEY,
    LEFT_KEY,
    isRunning,
    isFinished,
    step.durationSec,
    day,
    stepIndex,
    handleFirstStart,
    courseType,
    onRun,
  ]);

  // ─── Пауза / Продолжение ────────────────────────────────────────────────────
  const togglePause = useCallback(async () => {
    if (isPaused) {
      // Возобновление
      await toggleStepNotificationPause(day, stepIndex, false);
      const endTs = nowSec() + timeLeft;
      saveToLS(END_KEY, endTs);
      removeKeys(LEFT_KEY);
      setIsPaused(false);
    } else {
      // Пауза
      await toggleStepNotificationPause(day, stepIndex, true);
      saveToLS(LEFT_KEY, timeLeft);
      removeKeys(END_KEY);
      setIsPaused(true);
    }
  }, [END_KEY, LEFT_KEY, isPaused, timeLeft, day, stepIndex]);

  // ─── Сброс ───────────────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    removeKeys(END_KEY, LEFT_KEY);
    setTimeLeft(step.durationSec);
    setIsFinished(false);
    setIsPaused(false);
    onReset(stepIndex);

    await updateStepStatusServerAction(
      courseType,
      day,
      stepIndex,
      TrainingStatus.NOT_STARTED
    );
    await deletedStepNotification(day, stepIndex, true);
  }, [
    END_KEY,
    LEFT_KEY,
    courseType,
    day,
    stepIndex,
    step.durationSec,
    onReset,
  ]);

  // ─── Интервал ────────────────────────────────────────────────────────────────
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const endTsStr = loadFromLS(END_KEY);
      if (!endTsStr || isPaused) return;

      const endTs = Number(endTsStr);
      const diff = Math.max(endTs - nowSec(), 0);
      setTimeLeft(diff);

      if (diff === 0 && !isFinished) finishStep();
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [END_KEY, isPaused, isFinished, finishStep]);

  // ─── Восстановление ─────────────────────────────────────────────────────────
  useEffect(() => {
    const endStr = loadFromLS(END_KEY);
    const leftStr = loadFromLS(LEFT_KEY);
    const now = nowSec();

    if (leftStr && !isNaN(Number(leftStr))) {
      const pausedTime = Number(leftStr);
      setTimeLeft(pausedTime);
      setIsPaused(true);
      setIsFinished(false);
    } else if (endStr && !isNaN(Number(endStr))) {
      const end = Number(endStr);
      if (end > now) {
        const remaining = end - now;
        setTimeLeft(remaining);
        setIsPaused(false);
        setIsFinished(false);
        setTimeout(() => onRun(stepIndex), 0);
      } else {
        finishStep();
      }
    }
  }, [END_KEY, LEFT_KEY, onRun, stepIndex, finishStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── UI кнопки ───────────────────────────────────────────────────────────────
  const renderActions = () => {
    if (isRunning && !isFinished) {
      return (
        <>
          <button onClick={togglePause} className={styles.button}>
            {isPaused ? "▶️ Продолжить" : "⏸ Пауза"}
          </button>
          <button onClick={handleReset} className={styles.button}>
            🔄 Сброс
          </button>
        </>
      );
    }

    if (!isRunning && !isFinished) {
      return (
        <button onClick={handleStart} className={styles.button}>
          ▶️ Начать
        </button>
      );
    }

    if (isFinished) {
      return (
        <>
          <p className={styles.finished}>Шаг завершён</p>
          <button onClick={handleReset} className={styles.button}>
            🔁 Пройти заново
          </button>
        </>
      );
    }

    return null;
  };

  // ─── Разметка ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.accordionItem}>
      <div className={styles.accordionHeader} onClick={onClick}>
        <h3>
          {step.title} {isRunning ? "⏱" : isFinished ? "✅" : ""}
        </h3>
      </div>

      {isOpen && (
        <div className={styles.accordionContent}>
          <p>Описание шага: {step.description}</p>
          <p>
            Длительность: {formatTime(step.durationSec)}{" "}
            {declOfNum(Math.round(step.durationSec / 60), [
              "минута",
              "минуты",
              "минут",
            ])}
          </p>
          {isRunning && !isFinished && <p>Осталось: {formatTime(timeLeft)}</p>}
          <div className={styles.actions}>{renderActions()}</div>
          <audio
            ref={audioRef}
            src="/music/success.mp3"
            crossOrigin="anonymous"
            preload="auto"
          />
        </div>
      )}
    </div>
  );
}
