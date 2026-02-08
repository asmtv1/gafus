"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { createWebLogger } from "@gafus/logger";

import { useStepState, useStepStore } from "@shared/stores/stepStore";
import { useTimerStore } from "@shared/stores/timerStore";
import { useCacheManager } from "@shared/utils/cacheManager";
import { useSyncStatus } from "@shared/hooks/useSyncStatus";

const logger = createWebLogger("accordion-step");

export interface UseStepTimerParams {
  courseId: string;
  dayOnCourseId: string;
  stepIndex: number;
  durationSec: number;
  initialStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED" | "RESET";
  stepTitle: string;
  stepOrder: number;
  totalSteps: number;
  onRun: (stepIndex: number) => void;
  onReset: (stepIndex: number) => void;
}

export function useStepTimer({
  courseId,
  dayOnCourseId,
  stepIndex,
  durationSec,
  initialStatus,
  stepTitle,
  stepOrder,
  totalSteps,
  onRun,
  onReset,
}: UseStepTimerParams) {
  const [isPausing, setIsPausing] = useState(false);
  const [liveTimeLeft, setLiveTimeLeft] = useState<number | null>(null);
  const isMountedRef = useRef(true);

  const stepState = useStepState(courseId, dayOnCourseId, stepIndex);
  const initializeStep = useStepStore((s) => s.initializeStep);
  const resumeStep = useStepStore((s) => s.resumeStep);
  const resetStep = useStepStore((s) => s.resetStep);
  const finishStep = useStepStore((s) => s.finishStep);
  const {
    timers,
    startTimer,
    stopTimer,
    canStartStep,
    startStepWithServer,
    finishStepWithServer,
    pauseStepWithServer,
    resumeStepWithServer,
    resetStepWithServer,
  } = useTimerStore(
    useShallow((s) => ({
      timers: s.timers,
      startTimer: s.startTimer,
      stopTimer: s.stopTimer,
      canStartStep: s.canStartStep,
      startStepWithServer: s.startStepWithServer,
      finishStepWithServer: s.finishStepWithServer,
      pauseStepWithServer: s.pauseStepWithServer,
      resumeStepWithServer: s.resumeStepWithServer,
      resetStepWithServer: s.resetStepWithServer,
    })),
  );
  const { startSync, finishSync, addPendingChange, removePendingChange } = useSyncStatus();
  const { updateStepProgress } = useCacheManager();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    initializeStep(courseId, dayOnCourseId, stepIndex, durationSec, initialStatus);
  }, [courseId, dayOnCourseId, stepIndex, durationSec, initialStatus, initializeStep]);

  const stepKey = useMemo(
    () => `${courseId}-${dayOnCourseId}-${stepIndex}`,
    [courseId, dayOnCourseId, stepIndex],
  );

  const hasActiveTimer = timers.has(stepKey);
  const isActuallyRunning = stepState?.status === "IN_PROGRESS" && hasActiveTimer;
  const displayTimeLeft = hasActiveTimer
    ? (liveTimeLeft ?? stepState?.timeLeft ?? 0)
    : (stepState?.timeLeft ?? 0);

  const restoreTimerWithCallbacks = useCallback(() => {
    setLiveTimeLeft(stepState?.timeLeft ?? null);
    startTimer(
      courseId,
      dayOnCourseId,
      stepIndex,
      (timeLeft: number) => {
        if (isMountedRef.current) setLiveTimeLeft(timeLeft);
      },
      async () => {
        setLiveTimeLeft(null);
        finishStep(courseId, dayOnCourseId, stepIndex);
        try {
          await finishStepWithServer(
            courseId,
            dayOnCourseId,
            stepIndex,
            stepTitle,
            stepOrder,
          );
        } catch {
          // Ошибка обрабатывается в очереди синхронизации
        }
        onRun(-1);
      },
      true,
    );
  }, [
    courseId,
    dayOnCourseId,
    stepIndex,
    stepState?.timeLeft,
    stepTitle,
    stepOrder,
    startTimer,
    finishStep,
    finishStepWithServer,
    onRun,
  ]);

  useEffect(() => {
    if (stepState?.status !== "IN_PROGRESS" || stepState.timeLeft <= 0) return;

    const timer = setTimeout(() => {
      const currentTimers = useTimerStore.getState().timers;
      const existingTimer = currentTimers.get(stepKey);
      if (existingTimer) {
        stopTimer(courseId, dayOnCourseId, stepIndex);
        restoreTimerWithCallbacks();
      } else {
        restoreTimerWithCallbacks();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [
    stepState?.status,
    stepState?.timeLeft,
    stepKey,
    courseId,
    dayOnCourseId,
    stepIndex,
    stopTimer,
    restoreTimerWithCallbacks,
  ]);

  const startStepTimer = useCallback(
    (isResume = false) => {
      const canStart = canStartStep(courseId, dayOnCourseId, stepIndex);
      if (!isResume && !canStart) {
        alert("Один шаг уже активен. Сначала остановите его!");
        return false;
      }

      if (isResume) {
        resumeStep(courseId, dayOnCourseId, stepIndex);
        setLiveTimeLeft(stepState?.timeLeft ?? null);
      }
      const timerStarted = startTimer(
        courseId,
        dayOnCourseId,
        stepIndex,
        (timeLeft: number) => {
          if (isMountedRef.current) setLiveTimeLeft(timeLeft);
        },
        async () => {
          setLiveTimeLeft(null);
          updateStepProgress(
            courseId,
            dayOnCourseId,
            stepIndex,
            "COMPLETED",
            undefined,
            totalSteps,
          );
          onRun(-1);
          addPendingChange();
          startSync();
          try {
            await finishStepWithServer(courseId, dayOnCourseId, stepIndex, stepTitle, stepOrder);
            finishSync(true);
            removePendingChange();
          } catch {
            finishSync(false);
          }
        },
        isResume,
      );

      if (!timerStarted) {
        alert("Один шаг уже активен. Сначала остановите его!");
        return false;
      }
      return true;
    },
    [
      canStartStep,
      courseId,
      dayOnCourseId,
      stepIndex,
      resumeStep,
      startTimer,
      stepState?.timeLeft,
      finishStepWithServer,
      stepTitle,
      stepOrder,
      onRun,
      updateStepProgress,
      addPendingChange,
      finishSync,
      removePendingChange,
      startSync,
      totalSteps,
    ],
  );

  const handleStart = useCallback(async () => {
    try {
      if (!canStartStep(courseId, dayOnCourseId, stepIndex)) {
        alert("Один шаг уже активен. Сначала остановите его!");
        return;
      }
      await startStepWithServer(courseId, dayOnCourseId, stepIndex, durationSec);
      updateStepProgress(
        courseId,
        dayOnCourseId,
        stepIndex,
        "IN_PROGRESS",
        durationSec,
        totalSteps,
      );
      onRun(stepIndex);
      if (!startStepTimer(false)) return;
    } catch (error) {
      logger.error("[AccordionStep] handleStart error", error as Error);
      updateStepProgress(
        courseId,
        dayOnCourseId,
        stepIndex,
        "IN_PROGRESS",
        durationSec,
        totalSteps,
      );
      onRun(stepIndex);
      startStepTimer(false);
    }
  }, [
    canStartStep,
    courseId,
    dayOnCourseId,
    stepIndex,
    startStepWithServer,
    durationSec,
    onRun,
    startStepTimer,
    updateStepProgress,
    totalSteps,
  ]);

  const togglePause = useCallback(async () => {
    if (stepState?.status === "IN_PROGRESS") {
      if (isActuallyRunning) {
        setIsPausing(true);
        try {
          const timeToSave = liveTimeLeft ?? stepState?.timeLeft ?? durationSec;
          await pauseStepWithServer(courseId, dayOnCourseId, stepIndex, timeToSave);
          updateStepProgress(courseId, dayOnCourseId, stepIndex, "PAUSED", undefined, totalSteps);
        } catch (error) {
          logger.error("[AccordionStep] togglePause PAUSE error", error as Error);
        } finally {
          setLiveTimeLeft(null);
          setIsPausing(false);
        }
      } else {
        setIsPausing(true);
        try {
          await resumeStepWithServer(
            courseId,
            dayOnCourseId,
            stepIndex,
            stepState?.timeLeft ?? durationSec,
          );
          updateStepProgress(
            courseId,
            dayOnCourseId,
            stepIndex,
            "IN_PROGRESS",
            undefined,
            totalSteps,
          );
          startStepTimer(true);
        } catch (error) {
          logger.error("[AccordionStep] togglePause RESUME error", error as Error);
        } finally {
          setIsPausing(false);
        }
      }
    } else if (stepState?.status === "PAUSED") {
      setIsPausing(true);
      try {
        await resumeStepWithServer(
          courseId,
          dayOnCourseId,
          stepIndex,
          stepState?.timeLeft ?? durationSec,
        );
        updateStepProgress(
          courseId,
          dayOnCourseId,
          stepIndex,
          "IN_PROGRESS",
          undefined,
          totalSteps,
        );
        startStepTimer(true);
      } catch (error) {
        logger.error("[AccordionStep] togglePause RESUME from PAUSED error", error as Error);
      } finally {
        setIsPausing(false);
      }
    }
  }, [
    stepState?.status,
    stepState?.timeLeft,
    isActuallyRunning,
    liveTimeLeft,
    pauseStepWithServer,
    courseId,
    dayOnCourseId,
    stepIndex,
    updateStepProgress,
    resumeStepWithServer,
    durationSec,
    startStepTimer,
    totalSteps,
  ]);

  const handleReset = useCallback(async () => {
    try {
      await resetStepWithServer(courseId, dayOnCourseId, stepIndex, durationSec);
      setLiveTimeLeft(null);
      onReset(stepIndex);
    } catch (error) {
      logger.error("[AccordionStep] handleReset error", error as Error);
      stopTimer(courseId, dayOnCourseId, stepIndex);
      setLiveTimeLeft(null);
      resetStep(courseId, dayOnCourseId, stepIndex, durationSec);
      onReset(stepIndex);
    }
  }, [
    resetStepWithServer,
    courseId,
    dayOnCourseId,
    stepIndex,
    durationSec,
    stopTimer,
    resetStep,
    onReset,
  ]);

  return {
    stepState,
    displayTimeLeft,
    isActuallyRunning,
    isPausing,
    handleStart,
    togglePause,
    handleReset,
    startStepTimer,
  };
}
