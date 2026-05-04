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
  serverActions?: {
    startStep?: (stepIndex: number, durationSec: number) => Promise<{ success: boolean }>;
    completeStep?: (stepIndex: number) => Promise<{ success: boolean }>;
    pauseStep?: (stepIndex: number, timeLeftSec: number) => Promise<{ success: boolean }>;
    resumeStep?: (stepIndex: number) => Promise<{ success: boolean }>;
    resetStep?: (stepIndex: number) => Promise<{ success: boolean }>;
  };
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
  serverActions,
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

  const runStartStepWithServer = useCallback(
    async (nextDurationSec: number) => {
      if (serverActions?.startStep) {
        await serverActions.startStep(stepIndex, nextDurationSec);
        return;
      }
      await startStepWithServer(courseId, dayOnCourseId, stepIndex, nextDurationSec);
    },
    [courseId, dayOnCourseId, serverActions, startStepWithServer, stepIndex],
  );

  const runCompleteStepWithServer = useCallback(
    async () => {
      if (serverActions?.completeStep) {
        await serverActions.completeStep(stepIndex);
        return;
      }
      await finishStepWithServer(courseId, dayOnCourseId, stepIndex, stepTitle, stepOrder);
    },
    [
      courseId,
      dayOnCourseId,
      finishStepWithServer,
      serverActions,
      stepIndex,
      stepOrder,
      stepTitle,
    ],
  );

  const runPauseStepWithServer = useCallback(
    async (timeLeftSec: number) => {
      if (serverActions?.pauseStep) {
        await serverActions.pauseStep(stepIndex, timeLeftSec);
        return;
      }
      await pauseStepWithServer(courseId, dayOnCourseId, stepIndex, timeLeftSec);
    },
    [courseId, dayOnCourseId, pauseStepWithServer, serverActions, stepIndex],
  );

  const runResumeStepWithServer = useCallback(
    async (nextDurationSec: number) => {
      if (serverActions?.resumeStep) {
        await serverActions.resumeStep(stepIndex);
        return;
      }
      await resumeStepWithServer(courseId, dayOnCourseId, stepIndex, nextDurationSec);
    },
    [courseId, dayOnCourseId, resumeStepWithServer, serverActions, stepIndex],
  );

  const runResetStepWithServer = useCallback(
    async () => {
      if (serverActions?.resetStep) {
        await serverActions.resetStep(stepIndex);
        resetStep(courseId, dayOnCourseId, stepIndex, durationSec);
        return;
      }
      await resetStepWithServer(courseId, dayOnCourseId, stepIndex, durationSec);
    },
    [
      courseId,
      dayOnCourseId,
      durationSec,
      resetStep,
      resetStepWithServer,
      serverActions,
      stepIndex,
    ],
  );

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
          await runCompleteStepWithServer();
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
    startTimer,
    setLiveTimeLeft,
    finishStep,
    runCompleteStepWithServer,
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
            await runCompleteStepWithServer();
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
      onRun,
      updateStepProgress,
      addPendingChange,
      finishSync,
      removePendingChange,
      startSync,
      totalSteps,
      runCompleteStepWithServer,
    ],
  );

  const handleStart = useCallback(() => {
    if (!canStartStep(courseId, dayOnCourseId, stepIndex)) {
      alert("Один шаг уже активен. Сначала остановите его!");
      return;
    }
    startTransition(async () => {
      try {
        await runStartStepWithServer(durationSec);
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
    durationSec,
    onRun,
    startStepTimer,
    updateStepProgress,
    totalSteps,
    startTransition,
    runStartStepWithServer,
  ]);

  const togglePause = useCallback(() => {
    if (stepState?.status === "IN_PROGRESS") {
      if (isActuallyRunning) {
        setIsPausing(true);
        startTransition(async () => {
          try {
            const liveFromStore = useTimerStore.getState().liveTimeLeftByStepKey[stepKey];
            const timeToSave = liveFromStore ?? stepState?.timeLeft ?? durationSec;
            await runPauseStepWithServer(timeToSave);
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
            await runResumeStepWithServer(stepState?.timeLeft ?? durationSec);
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
          await runResumeStepWithServer(stepState?.timeLeft ?? durationSec);
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
    courseId,
    dayOnCourseId,
    stepIndex,
    updateStepProgress,
    durationSec,
    startStepTimer,
    setLiveTimeLeft,
    stepKey,
    totalSteps,
    startTransition,
    runPauseStepWithServer,
    runResumeStepWithServer,
  ]);

  const handleReset = useCallback(() => {
    startTransition(async () => {
      try {
        await runResetStepWithServer();
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
    runResetStepWithServer,
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
