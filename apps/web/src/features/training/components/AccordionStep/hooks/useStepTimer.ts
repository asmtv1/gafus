"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useShallow } from "zustand/react/shallow";

import { getStepKey } from "@gafus/core/utils/training";
import { reportClientError } from "@gafus/error-handling";

import { useStepState, useStepStore } from "@shared/stores/stepStore";
import { useHasActiveTimer, useTimerStore } from "@shared/stores/timerStore";
import { useCacheManager } from "@shared/utils/cacheManager";
import { useSyncStatus } from "@shared/hooks/useSyncStatus";

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
  const [isPending, startTransition] = useTransition();
  const isMountedRef = useRef(true);

  const stepKey = getStepKey(courseId, dayOnCourseId, stepIndex);
  const stepState = useStepState(courseId, dayOnCourseId, stepIndex);
  const initializeStep = useStepStore((s) => s.initializeStep);
  const resumeStep = useStepStore((s) => s.resumeStep);
  const resetStep = useStepStore((s) => s.resetStep);
  const finishStep = useStepStore((s) => s.finishStep);
  const hasActiveTimer = useHasActiveTimer(stepKey);
  const {
    startTimer,
    stopTimer,
    setLiveTimeLeft,
    canStartStep,
    startStepWithServer,
    finishStepWithServer,
    pauseStepWithServer,
    resumeStepWithServer,
    resetStepWithServer,
  } = useTimerStore(
    useShallow((s) => ({
      startTimer: s.startTimer,
      stopTimer: s.stopTimer,
      setLiveTimeLeft: s.setLiveTimeLeft,
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

  const isActuallyRunning = stepState?.status === "IN_PROGRESS" && hasActiveTimer;

  const restoreTimerWithCallbacks = useCallback(() => {
    setLiveTimeLeft(stepKey, stepState?.timeLeft ?? 0);
    startTimer(
      courseId,
      dayOnCourseId,
      stepIndex,
      (timeLeft: number) => {
        if (isMountedRef.current) setLiveTimeLeft(stepKey, timeLeft);
      },
      async () => {
        setLiveTimeLeft(stepKey, null);
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
    stepKey,
    stepState?.timeLeft,
    stepTitle,
    stepOrder,
    startTimer,
    setLiveTimeLeft,
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
        setLiveTimeLeft(stepKey, stepState?.timeLeft ?? 0);
      }
      const timerStarted = startTimer(
        courseId,
        dayOnCourseId,
        stepIndex,
        (timeLeft: number) => {
          if (isMountedRef.current) setLiveTimeLeft(stepKey, timeLeft);
        },
        async () => {
          setLiveTimeLeft(stepKey, null);
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
          } catch (finishErr) {
            reportClientError(finishErr, {
              issueKey: "useStepTimer",
              severity: "warning",
              keys: { operation: "finish_step_server", stepIndex, courseId },
            });
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
      setLiveTimeLeft,
      stepKey,
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

  const handleStart = useCallback(() => {
    if (!canStartStep(courseId, dayOnCourseId, stepIndex)) {
      alert("Один шаг уже активен. Сначала остановите его!");
      return;
    }
    startTransition(async () => {
      try {
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
        reportClientError(error, {
          issueKey: "AccordionStep",
          keys: { step: "handleStart", stepIndex, courseId },
        });
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
    });
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
    startTransition,
  ]);

  const togglePause = useCallback(() => {
    if (stepState?.status === "IN_PROGRESS") {
      if (isActuallyRunning) {
        setIsPausing(true);
        startTransition(async () => {
          try {
            const liveFromStore = useTimerStore.getState().liveTimeLeftByStepKey[stepKey];
            const timeToSave = liveFromStore ?? stepState?.timeLeft ?? durationSec;
            await pauseStepWithServer(courseId, dayOnCourseId, stepIndex, timeToSave);
            updateStepProgress(courseId, dayOnCourseId, stepIndex, "PAUSED", undefined, totalSteps);
          } catch (error) {
            reportClientError(error, {
              issueKey: "AccordionStep",
              keys: { step: "togglePause-PAUSE", stepIndex, courseId },
            });
          } finally {
            setLiveTimeLeft(stepKey, null);
            setIsPausing(false);
          }
        });
      } else {
        setIsPausing(true);
        startTransition(async () => {
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
            reportClientError(error, {
              issueKey: "AccordionStep",
              keys: { step: "togglePause-RESUME", stepIndex, courseId },
            });
          } finally {
            setIsPausing(false);
          }
        });
      }
    } else if (stepState?.status === "PAUSED") {
      setIsPausing(true);
      startTransition(async () => {
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
          reportClientError(error, {
            issueKey: "AccordionStep",
            keys: { step: "togglePause-RESUME-from-PAUSED", stepIndex, courseId },
          });
        } finally {
          setIsPausing(false);
        }
      });
    }
  }, [
    stepState?.status,
    stepState?.timeLeft,
    isActuallyRunning,
    pauseStepWithServer,
    courseId,
    dayOnCourseId,
    stepIndex,
    updateStepProgress,
    resumeStepWithServer,
    durationSec,
    startStepTimer,
    setLiveTimeLeft,
    stepKey,
    totalSteps,
    startTransition,
  ]);

  const handleReset = useCallback(() => {
    startTransition(async () => {
      try {
        await resetStepWithServer(courseId, dayOnCourseId, stepIndex, durationSec);
        setLiveTimeLeft(stepKey, null);
        onReset(stepIndex);
      } catch (error) {
        reportClientError(error, {
          issueKey: "AccordionStep",
          keys: { step: "handleReset", stepIndex, courseId },
        });
        stopTimer(courseId, dayOnCourseId, stepIndex);
        setLiveTimeLeft(stepKey, null);
        resetStep(courseId, dayOnCourseId, stepIndex, durationSec);
        onReset(stepIndex);
      }
    });
  }, [
    resetStepWithServer,
    courseId,
    dayOnCourseId,
    stepIndex,
    stepKey,
    durationSec,
    stopTimer,
    setLiveTimeLeft,
    resetStep,
    onReset,
    startTransition,
  ]);

  return {
    stepState,
    stepKey,
    hasActiveTimer,
    isActuallyRunning,
    isPausing,
    isPending,
    handleStart,
    togglePause,
    handleReset,
    startStepTimer,
  };
}
