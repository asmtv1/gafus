"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TrainingStatus } from "@prisma/client";
import { updateStepStatusServerAction } from "@/lib/training/updateUserStepStatus";
import { formatTime } from "@/utils/date";
import { declOfNum } from "@/utils/pluralize";
import type { TrainingStep } from "@/types/training";

// ─── Хелперы ───────────────────────────────────────────────────────────────────
const nowSec = () => Math.floor(Date.now() / 1000);
const makeEndKey = (day: number, idx: number) => `training-${day}-${idx}-end`;
const saveEnd = (key: string, ts: number) =>
  localStorage.setItem(key, ts.toString());
const loadEnd = (key: string) => Number(localStorage.getItem(key) ?? 0);
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

  // секунда ≈ базовая точность UI
  const [timeLeft, setTimeLeft] = useState(step.durationSec);
  const [isFinished, setIsFinished] = useState(
    step.status === TrainingStatus.COMPLETED
  );
  const [isPaused, setIsPaused] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // ─── Завершить шаг ───────────────────────────────────────────────────────────
  const finishStep = useCallback(async () => {
    audioRef.current?.play();
    clearInterval(intervalRef.current!);
    setIsFinished(true);
    onReset(stepIndex);

    localStorage.removeItem(END_KEY);
    await updateStepStatusServerAction(
      courseType,
      day,
      stepIndex,
      TrainingStatus.COMPLETED
    );
  }, [courseType, day, stepIndex, onReset, END_KEY]);

  // ─── Старт ───────────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (isRunning || isFinished) return;

    const endTs = nowSec() + step.durationSec;
    saveEnd(END_KEY, endTs);

    onRun(stepIndex);
    setIsPaused(false);
    setTimeLeft(step.durationSec);

    if (stepIndex === 0) handleFirstStart();

    await updateStepStatusServerAction(
      courseType,
      day,
      stepIndex,
      TrainingStatus.IN_PROGRESS
    );
  }, [
    isRunning,
    isFinished,
    courseType,
    day,
    stepIndex,
    step.durationSec,
    handleFirstStart,
    END_KEY,
    onRun,
  ]);

  // ─── Пауза/Резюм ─────────────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    if (isPaused) {
      const endTs = nowSec() + timeLeft;
      saveEnd(END_KEY, endTs);
      setIsPaused(false);
    } else {
      setIsPaused(true);
    }
  }, [isPaused, timeLeft, END_KEY]);

  // ─── Сброс ───────────────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    clearInterval(intervalRef.current!);
    localStorage.removeItem(END_KEY);
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
  }, [courseType, day, stepIndex, step.durationSec, onReset, END_KEY]);

  // ─── Основной «тик» (1 раз в сек) ────────────────────────────────────────────
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const endTs = loadEnd(END_KEY);

      if (!endTs || isPaused) return;

      const diff = Math.max(endTs - nowSec(), 0);
      setTimeLeft(diff);

      if (diff === 0 && !isFinished) finishStep();
    }, 1000);

    return () => clearInterval(intervalRef.current!);
  }, [isPaused, isFinished, finishStep, END_KEY]);

  // ─── Восстанавливаем таймер при монтировании ────────────────────────────────
  useEffect(() => {
    const storedEnd = loadEnd(END_KEY);
    if (storedEnd > nowSec()) {
      // осталось времени
      setTimeLeft(storedEnd - nowSec());
      setIsPaused(false);
      setIsFinished(false);
      onRun(stepIndex); // восстановим глобальный «бежит шаг»
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
