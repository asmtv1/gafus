"use client";

import { useCallback, useMemo } from "react";

import { Day } from "@/features/training";
import type { TrainingDetail } from "@gafus/types";
import {
  completeDailyCourseStepServerAction,
  pauseDailyCourseStepServerAction,
  resetDailyCourseStepServerAction,
  resumeDailyCourseStepServerAction,
  startDailyCourseStepServerAction,
} from "@shared/lib/daily-course/actions";

interface DailyCourseDayClientProps {
  scheduleId: string;
  training: TrainingDetail;
}

export function DailyCourseDayClient({ scheduleId, training }: DailyCourseDayClientProps) {
  const startStep = useCallback(
    (stepIndex: number, durationSec: number) =>
      startDailyCourseStepServerAction(scheduleId, stepIndex, durationSec),
    [scheduleId],
  );
  const completeStep = useCallback(
    (stepIndex: number) => completeDailyCourseStepServerAction(scheduleId, stepIndex),
    [scheduleId],
  );
  const pauseStep = useCallback(
    (stepIndex: number, timeLeftSec: number) =>
      pauseDailyCourseStepServerAction(scheduleId, stepIndex, timeLeftSec),
    [scheduleId],
  );
  const resumeStep = useCallback(
    (stepIndex: number) => resumeDailyCourseStepServerAction(scheduleId, stepIndex),
    [scheduleId],
  );
  const resetStep = useCallback(
    (stepIndex: number) => resetDailyCourseStepServerAction(scheduleId, stepIndex),
    [scheduleId],
  );

  const serverActions = useMemo(
    () => ({ startStep, completeStep, pauseStep, resumeStep, resetStep }),
    [completeStep, pauseStep, resetStep, resumeStep, startStep],
  );

  return (
    <Day
      training={training}
      courseType="daily-course"
      titleOverride="Курс дня"
      serverActions={serverActions}
    />
  );
}
