"use client";

import { useCallback, useMemo } from "react";

import { createWebLogger } from "@gafus/logger";

import { useCacheManager } from "@shared/utils/cacheManager";
import { useSyncStatus } from "@shared/hooks/useSyncStatus";
import { markPracticeStepAsCompleted } from "@shared/lib/training/markPracticeStepAsCompleted";
import { getEmbeddedVideoInfo } from "@gafus/core/utils";
import { isStepWithTimer } from "@gafus/core/utils/training";

import styles from "./AccordionStep.module.css";
import { useOfflineMediaUrl } from "@shared/lib/offline/offlineMediaResolver";
import { VideoPlayerSection } from "@shared/components/video/VideoPlayerSection";

import { useStepDiary } from "./hooks/useStepDiary";
import { useStepTimer } from "./hooks/useStepTimer";
import { StepContent } from "./StepContent";
import { StepDiaryBlock } from "./StepDiaryBlock";
import { StepExaminationBlock } from "./StepExaminationBlock";
import { StepPracticeBlock } from "./StepPracticeBlock";
import { StepTimerCard } from "./StepTimerCard";
import { StepTypeHeader } from "./StepTypeHeader";
import type { AccordionStepProps } from "./types";

const logger = createWebLogger("accordion-step");

export function AccordionStep({
  courseId,
  courseType,
  dayOnCourseId,
  stepIndex,
  durationSec,
  estimatedDurationSec,
  stepTitle,
  stepDescription,
  stepOrder,
  totalSteps,
  initialStatus,
  videoUrl,
  imageUrls,
  onRun,
  onReset,
  type,
  checklist,
  requiresVideoReport,
  requiresWrittenFeedback,
  hasTestQuestions,
  userStepId,
  stepId,
}: AccordionStepProps) {
  const {
    stepState,
    displayTimeLeft,
    isActuallyRunning,
    isPausing,
    handleStart,
    togglePause,
    handleReset,
  } = useStepTimer({
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
  });

  const {
    diaryContent,
    setDiaryContent,
    isSavingDiary,
    diaryError,
    previousEntries,
    handleSaveDiary,
  } = useStepDiary({
    courseId,
    dayOnCourseId,
    stepIndex,
    stepTitle,
    stepOrder,
    type,
    totalSteps,
    onRun,
  });

  const { startSync, finishSync, addPendingChange, removePendingChange } = useSyncStatus();
  const { updateStepProgress } = useCacheManager();

  const offlineVideoUrl = useOfflineMediaUrl(courseType, videoUrl);
  const videoInfo = useMemo(() => {
    const url = offlineVideoUrl || videoUrl;
    return url ? getEmbeddedVideoInfo(url) : null;
  }, [offlineVideoUrl, videoUrl]);

  const handleCompletePractice = useCallback(async () => {
    try {
      // 1. Обновляем кэш на всех уровнях (шаг, день, курс) - это также обновляет локальное состояние
      updateStepProgress(courseId, dayOnCourseId, stepIndex, "COMPLETED", undefined, totalSteps);

      // 2. Обновляем UI немедленно (оптимистичное обновление)
      onRun(-1);

      // 3. Отправляем на сервер с ретраями и индикатором синхронизации
      addPendingChange();
      startSync();

      try {
        await markPracticeStepAsCompleted(courseId, dayOnCourseId, stepIndex, stepTitle, stepOrder);
        finishSync(true);
        removePendingChange();
      } catch {
        finishSync(false);
        // При ошибке добавляем в очередь синхронизации
        const { useOfflineStore } = await import("@shared/stores/offlineStore");
        const offlineStore = useOfflineStore.getState();
        offlineStore.addToSyncQueue({
          type: "step-status-update",
          data: {
            courseId,
            dayOnCourseId,
            stepIndex,
            status: "COMPLETED",
            stepTitle,
            stepOrder,
          },
          maxRetries: 3,
        });
      }
    } catch (err) {
      logger.error("Failed to complete practice step", err as Error);
    }
  }, [
    courseId,
    dayOnCourseId,
    stepIndex,
    stepTitle,
    stepOrder,
    updateStepProgress,
    totalSteps,
    onRun,
    addPendingChange,
    startSync,
    finishSync,
    removePendingChange,
  ]);

  if (!stepState) return null;

  return (
    <div className={styles.stepContainer}>
      <StepTypeHeader type={type} estimatedDurationSec={estimatedDurationSec} />

      <StepContent
        stepDescription={stepDescription}
        imageUrls={imageUrls}
        courseType={courseType}
        stepTitle={stepTitle}
        type={type}
      />

      {type === "EXAMINATION" && (
        <StepExaminationBlock
          checklist={checklist}
          userStepId={userStepId}
          stepId={stepId}
          hasTestQuestions={hasTestQuestions}
          requiresWrittenFeedback={requiresWrittenFeedback}
          requiresVideoReport={requiresVideoReport}
        />
      )}

      {videoUrl && type !== "BREAK" && (
        <VideoPlayerSection
          videoUrl={offlineVideoUrl || videoUrl}
          originalVideoUrl={videoUrl}
          courseType={courseType}
          videoInfo={videoInfo}
        />
      )}

      {isStepWithTimer(type) && (
        <StepTimerCard
          displayTimeLeft={displayTimeLeft}
          stepState={stepState}
          isActuallyRunning={isActuallyRunning}
          isPausing={isPausing}
          type={type}
          onStart={handleStart}
          onPause={togglePause}
          onReset={handleReset}
        />
      )}

      {type === "PRACTICE" && (
        <StepPracticeBlock
          stepStatus={stepState.status}
          onCompletePractice={handleCompletePractice}
        />
      )}

      {type === "DIARY" && (
        <StepDiaryBlock
          diaryContent={diaryContent}
          setDiaryContent={setDiaryContent}
          isSavingDiary={isSavingDiary}
          diaryError={diaryError}
          previousEntries={previousEntries}
          stepStatus={stepState.status}
          onSaveDiary={handleSaveDiary}
        />
      )}
    </div>
  );
}
