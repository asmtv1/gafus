"use client";

import { useCallback, useEffect, useState } from "react";

import { getDiaryEntries } from "@shared/lib/actions/getDiaryEntries";
import { saveDiaryEntry } from "@shared/lib/actions/saveDiaryEntry";
import { markDiaryStepAsCompleted } from "@shared/lib/training/markDiaryStepAsCompleted";
import { useCacheManager } from "@shared/utils/cacheManager";

import type { StepType } from "../types";

export interface DiaryEntry {
  id: string;
  content: string;
  dayOrder: number;
  dayTitle: string;
  createdAt: Date;
}

export interface UseStepDiaryParams {
  courseId: string;
  dayOnCourseId: string;
  stepIndex: number;
  stepTitle: string;
  stepOrder: number;
  type: StepType | undefined;
  totalSteps: number;
  onRun: (stepIndex: number) => void;
}

export function useStepDiary({
  courseId,
  dayOnCourseId,
  stepIndex,
  stepTitle,
  stepOrder,
  type,
  totalSteps,
  onRun,
}: UseStepDiaryParams) {
  const [diaryContent, setDiaryContent] = useState("");
  const [isSavingDiary, setIsSavingDiary] = useState(false);
  const [diaryError, setDiaryError] = useState<string | null>(null);
  const [previousEntries, setPreviousEntries] = useState<DiaryEntry[]>([]);

  const { updateStepProgress } = useCacheManager();

  useEffect(() => {
    if (type !== "DIARY" || !courseId) return;
    getDiaryEntries(courseId).then((result) => {
      if (result.success && result.entries) {
        setPreviousEntries(
          result.entries.map((e) => ({
            id: e.id,
            content: e.content,
            dayOrder: e.dayOrder,
            dayTitle: e.dayTitle,
            createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
          })),
        );
      }
    });
  }, [type, courseId]);

  const handleSaveDiary = useCallback(async () => {
    if (type !== "DIARY") return;
    setDiaryError(null);
    if (!diaryContent.trim()) {
      setDiaryError("Введите текст записи");
      return;
    }
    setIsSavingDiary(true);
    const saveResult = await saveDiaryEntry(dayOnCourseId, diaryContent.trim());
    if (!saveResult.success) {
      setDiaryError(saveResult.error ?? "Не удалось сохранить");
      setIsSavingDiary(false);
      return;
    }
    try {
      await markDiaryStepAsCompleted(courseId, dayOnCourseId, stepIndex, stepTitle, stepOrder);
      updateStepProgress(courseId, dayOnCourseId, stepIndex, "COMPLETED", undefined, totalSteps);
      onRun(-1);
      setDiaryContent("");
      const entriesResult = await getDiaryEntries(courseId);
      if (entriesResult.success && entriesResult.entries) {
        setPreviousEntries(
          entriesResult.entries.map((e) => ({
            id: e.id,
            content: e.content,
            dayOrder: e.dayOrder,
            dayTitle: e.dayTitle,
            createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
          })),
        );
      }
    } catch {
      setDiaryError("Не удалось отметить шаг выполненным");
    }
    setIsSavingDiary(false);
  }, [
    type,
    diaryContent,
    dayOnCourseId,
    courseId,
    stepIndex,
    stepTitle,
    stepOrder,
    totalSteps,
    updateStepProgress,
    onRun,
  ]);

  return {
    diaryContent,
    setDiaryContent,
    isSavingDiary,
    diaryError,
    previousEntries,
    handleSaveDiary,
  };
}
