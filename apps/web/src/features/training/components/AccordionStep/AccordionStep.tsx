"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChecklistQuestion } from "@gafus/types";

import { useShallow } from "zustand/react/shallow";
import { useStepState, useStepStore } from "@shared/stores/stepStore";
import { useTimerStore } from "@shared/stores/timerStore";
import { useCacheManager } from "@shared/utils/cacheManager";
import { useSyncStatus } from "@shared/hooks/useSyncStatus";
import { markPracticeStepAsCompleted } from "@shared/lib/training/markPracticeStepAsCompleted";
import { markDiaryStepAsCompleted } from "@shared/lib/training/markDiaryStepAsCompleted";
import { saveDiaryEntry } from "@shared/lib/actions/saveDiaryEntry";
import { getDiaryEntries } from "@shared/lib/actions/getDiaryEntries";
import styles from "./AccordionStep.module.css";
import { AccessTimeIcon, PauseIcon, PlayArrowIcon, ReplayIcon } from "@shared/utils/muiImports";
import { getEmbeddedVideoInfo } from "@gafus/core/utils";
import { TestQuestions } from "../TestQuestions";
import { WrittenFeedback } from "../WrittenFeedback";
import { VideoReport } from "../VideoReport";
import ImageViewer from "@shared/components/ui/ImageViewer";
import { useOfflineMediaUrl } from "@shared/lib/offline/offlineMediaResolver";
import { VideoPlayerSection } from "@shared/components/video/VideoPlayerSection";

// Обертка для ImageViewer с поддержкой офлайн-режима
function OfflineImageViewer({
  courseType,
  src,
  alt,
  width,
  height,
  className,
  thumbnailClassName,
  priority,
  loading,
}: {
  courseType: string;
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  thumbnailClassName?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
}) {
  const offlineSrc = useOfflineMediaUrl(courseType, src);
  return (
    <ImageViewer
      src={offlineSrc || src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      thumbnailClassName={thumbnailClassName}
      priority={priority}
      loading={loading}
    />
  );
}

interface AccordionStepProps {
  courseId: string;
  courseType: string;
  dayOnCourseId: string; // ID дня для функций сохранения
  stepIndex: number;
  durationSec: number;
  estimatedDurationSec?: number | null;
  stepTitle: string;
  stepDescription?: string;
  stepOrder: number;
  totalSteps: number;
  initialStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED" | "RESET";
  videoUrl?: string | null;
  imageUrls?: string[];
  onRun: (stepIndex: number) => void;
  onReset: (stepIndex: number) => void;

  // Новые поля для типов экзамена
  type?: "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE" | "DIARY";
  checklist?: ChecklistQuestion[];
  requiresVideoReport?: boolean;
  requiresWrittenFeedback?: boolean;
  hasTestQuestions?: boolean;
  userStepId?: string;
  stepId: string;
}

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
  // Состояние для отслеживания загрузки
  const [isPausing, setIsPausing] = useState(false);
  // «Живое» время таймера во время сессии (не пишем в stepStore на каждый тик)
  const [liveTimeLeft, setLiveTimeLeft] = useState<number | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Состояние для шага «Дневник успехов»
  const [diaryContent, setDiaryContent] = useState("");
  const [isSavingDiary, setIsSavingDiary] = useState(false);
  const [diaryError, setDiaryError] = useState<string | null>(null);
  const [previousEntries, setPreviousEntries] = useState<
    { id: string; content: string; dayOrder: number; dayTitle: string; createdAt: Date }[]
  >([]);

  const stepState = useStepState(courseId, dayOnCourseId, stepIndex);
  const initializeStep = useStepStore((s) => s.initializeStep);
  const resumeStep = useStepStore((s) => s.resumeStep);
  const resetStep = useStepStore((s) => s.resetStep);
  const updateTimeLeft = useStepStore((s) => s.updateTimeLeft);
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

  // Централизованный менеджер кэша
  const { updateStepProgress } = useCacheManager();

  // Получаем офлайн URL для видео
  const offlineVideoUrl = useOfflineMediaUrl(courseType, videoUrl);

  // Получаем информацию о видео для определения типа (внешнее/CDN)
  const videoInfo = useMemo(() => {
    const url = offlineVideoUrl || videoUrl;
    return url ? getEmbeddedVideoInfo(url) : null;
  }, [offlineVideoUrl, videoUrl]);
  // Инициализируем шаг при монтировании
  useEffect(() => {
    initializeStep(courseId, dayOnCourseId, stepIndex, durationSec, initialStatus);
  }, [courseId, dayOnCourseId, stepIndex, durationSec, initialStatus, initializeStep]);

  const stepKey = useMemo(
    () => `${courseId}-${dayOnCourseId}-${stepIndex}`,
    [courseId, dayOnCourseId, stepIndex],
  );

  // Загрузка предыдущих записей дневника при открытии шага DIARY
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

  // Получаем состояние таймера (уже из селектора выше)
  const hasActiveTimer = timers.has(stepKey);
  const isActuallyRunning = stepState?.status === "IN_PROGRESS" && hasActiveTimer;
  const displayTimeLeft = hasActiveTimer
    ? (liveTimeLeft ?? stepState?.timeLeft ?? 0)
    : (stepState?.timeLeft ?? 0);

  // Восстанавливаем таймер при перезагрузке страницы или возврате на шаг
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
      true, // isRestore = true
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
        // Таймер уже тикает в фоне (пользователь уходил со страницы), но колбэки от старого
        // экземпляра — новый компонент не получает onTimeUpdate. Перезапускаем с новыми колбэками.
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

  // Вспомогательная функция для запуска таймера
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
          // 1. Обновляем кэш на всех уровнях (шаг, день, курс) - это также обновляет локальное состояние
          updateStepProgress(
            courseId,
            dayOnCourseId,
            stepIndex,
            "COMPLETED",
            undefined,
            totalSteps,
          );

          // 2. Обновляем UI немедленно (оптимистичное обновление)
          onRun(-1);

          // 4. Отправляем на сервер с ретраями и индикатором синхронизации
          addPendingChange();
          startSync();

          try {
            await finishStepWithServer(courseId, dayOnCourseId, stepIndex, stepTitle, stepOrder);
            finishSync(true);
            removePendingChange();
          } catch (error) {
            finishSync(false);
            // При ошибке добавляем в очередь синхронизации (уже обработано в finishStepWithServer)
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

      // Запускаем шаг на сервере
      await startStepWithServer(courseId, dayOnCourseId, stepIndex, durationSec);

      // Обновляем кэш на всех уровнях при запуске шага (включая локальное состояние)
      updateStepProgress(
        courseId,
        dayOnCourseId,
        stepIndex,
        "IN_PROGRESS",
        durationSec,
        totalSteps,
      );

      // Устанавливаем как активный
      onRun(stepIndex);

      if (!startStepTimer(false)) return;
    } catch (error) {
      console.error("[AccordionStep] handleStart error", error);
      // Не показываем ошибку пользователю, так как действие добавлено в очередь синхронизации

      // Все равно выполняем локальный запуск
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
          console.error("[AccordionStep] togglePause PAUSE error", error);
          // Не показываем ошибку пользователю, так как действие добавлено в очередь синхронизации
        } finally {
          setLiveTimeLeft(null);
          setIsPausing(false);
        }
      } else {
        setIsPausing(true);
        try {
          // resumeStepWithServer сам обновит состояние через stepStore
          await resumeStepWithServer(
            courseId,
            dayOnCourseId,
            stepIndex,
            stepState?.timeLeft ?? durationSec,
          );
          // Обновляем кэш дня/курса
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
          console.error("[AccordionStep] togglePause RESUME error", error);
        } finally {
          setIsPausing(false);
        }
      }
    } else if (stepState?.status === "PAUSED") {
      setIsPausing(true);
      try {
        // resumeStepWithServer сам обновит состояние через stepStore
        await resumeStepWithServer(
          courseId,
          dayOnCourseId,
          stepIndex,
          stepState?.timeLeft ?? durationSec,
        );
        // Обновляем кэш дня/курса
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
        console.error("[AccordionStep] togglePause RESUME from PAUSED error", error);
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
      console.error("[AccordionStep] handleReset error", error);
      // Локальный сброс: resetStepWithServer уже делает stopTimer+resetStep внутри
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
    stepKey,
    stepState?.status,
    stepState?.timeLeft,
  ]);

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
      } catch (error) {
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
    } catch (error) {
      console.error("Failed to complete practice step:", error);
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

  const handleSaveDiary = useCallback(async () => {
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
    } catch (error) {
      setDiaryError("Не удалось отметить шаг выполненным");
    }
    setIsSavingDiary(false);
  }, [
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

  if (!stepState) return null;

  const showStart = stepState.status === "NOT_STARTED" || stepState.status === "RESET";
  const showPause = stepState.status === "IN_PROGRESS" && isActuallyRunning;
  const showResume =
    (stepState.status === "IN_PROGRESS" && !isActuallyRunning) || stepState.status === "PAUSED";

  return (
    <div className={styles.stepContainer}>
      {/* Для экзаменационных шагов показываем заголовок */}
      {type === "EXAMINATION" && (
        <div className={styles.timerCard}>
          <div className={styles.timerHeader}>
            <span>Экзаменационный шаг</span>
          </div>
          {typeof estimatedDurationSec === "number" && estimatedDurationSec > 0 && (
            <div className={styles.estimatedTimeBadge}>
              Этот шаг займёт ~ {Math.round(estimatedDurationSec / 60)} мин
            </div>
          )}
        </div>
      )}

      {/* Для теоретических шагов показываем заголовок */}
      {type === "THEORY" && (
        <div className={styles.timerCard}>
          <div className={styles.timerHeader}>
            <span>Теоретический шаг</span>
          </div>
          {typeof estimatedDurationSec === "number" && estimatedDurationSec > 0 && (
            <div className={styles.estimatedTimeBadge}>
              Этот шаг займёт ~ {Math.round(estimatedDurationSec / 60)} мин
            </div>
          )}
        </div>
      )}

      {/* Для перерыва показываем заголовок */}
      {type === "BREAK" && (
        <div className={styles.timerCard}>
          <div className={styles.timerHeader}>
            <span>Перерыв</span>
          </div>
        </div>
      )}

      {/* Для практических шагов (без таймера) показываем заголовок и кнопку */}
      {type === "PRACTICE" && (
        <div className={styles.timerCard}>
          <div className={styles.timerHeader}>
            <span>Упражнение без таймера</span>
          </div>
          {typeof estimatedDurationSec === "number" && estimatedDurationSec > 0 && (
            <div className={styles.estimatedTimeBadge}>
              Примерное время: ~{Math.round(estimatedDurationSec / 60)} мин
            </div>
          )}
        </div>
      )}

      {/* Для шага «Дневник успехов» */}
      {type === "DIARY" && (
        <div className={styles.timerCard}>
          <div className={styles.timerHeader}>
            <span>Дневник успехов</span>
          </div>
        </div>
      )}

      {stepDescription && (
        <div className={styles.stepInfo}>
          <div>
            <div className={styles.sectionTitle}>Описание:</div>
            <div className={`${styles.cardSection} ${styles.markdownContent}`}>
              <ReactMarkdown>{stepDescription}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* Изображения шага (не показываем для перерыва) */}
      {imageUrls && imageUrls.length > 0 && type !== "BREAK" && (
        <div className={styles.stepInfo}>
          <div>
            <div className={styles.sectionTitle}>Изображения:</div>
            <div className={styles.imagesGrid}>
              {imageUrls.map((imageUrl, index) => (
                <OfflineImageViewer
                  key={index}
                  courseType={courseType}
                  src={imageUrl}
                  alt={`Изображение ${index + 1} для шага "${stepTitle}"`}
                  width={300}
                  height={200}
                  className={styles.stepImage}
                  thumbnailClassName={styles.imageContainer}
                  priority={index === 0} // Первое изображение загружаем с приоритетом
                  loading={index === 0 ? "eager" : "lazy"}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Экзаменационные компоненты */}
      {type === "EXAMINATION" && (
        <div className={styles.stepInfo}>
          <div>
            <div className={styles.sectionTitle}>Экзамен:</div>
            <div className={styles.cardSection}>
              {hasTestQuestions && checklist && userStepId && (
                <TestQuestions
                  checklist={checklist}
                  userStepId={userStepId}
                  stepId={stepId}
                  onComplete={(answers) => {
                    // Результаты сохраняются в компоненте
                  }}
                  onReset={() => {
                    // Сброс выполняется в компоненте
                  }}
                />
              )}

              {requiresWrittenFeedback && userStepId && (
                <WrittenFeedback
                  userStepId={userStepId}
                  stepId={stepId}
                  onComplete={(feedback) => {
                    // Результаты сохраняются в компоненте
                  }}
                  onReset={() => {
                    // Сброс выполняется в компоненте
                  }}
                />
              )}

              {requiresVideoReport && userStepId && (
                <VideoReport
                  userStepId={userStepId}
                  stepId={stepId}
                  onComplete={(videoBlob) => {
                    // Результаты сохраняются в компоненте
                  }}
                  onReset={() => {
                    // Сброс выполняется в компоненте
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Видео (не показываем для перерыва) */}
      {videoUrl && type !== "BREAK" && (
        <VideoPlayerSection
          videoUrl={offlineVideoUrl || videoUrl}
          originalVideoUrl={videoUrl}
          courseType={courseType}
          videoInfo={videoInfo}
        />
      )}

      {/* Таймер только для тренировочных шагов и перерывов (DIARY исключён) */}
      {type !== "EXAMINATION" && type !== "THEORY" && type !== "PRACTICE" && type !== "DIARY" && (
        <div className={styles.timerCard}>
          <div className={styles.timerHeader}>
            <AccessTimeIcon fontSize="small" />
            <span>
              {type === "BREAK"
                ? "Начни перерыв"
                : stepState.status === "RESET"
                  ? "Сброшен"
                  : "Начните занятие!"}
            </span>
          </div>
          <div className={styles.controlRow}>
            <div className={styles.timerDisplay}>
              {`${Math.floor(displayTimeLeft / 60)}:${(displayTimeLeft % 60)
                .toString()
                .padStart(2, "0")}`}
            </div>
            {(stepState.status === "NOT_STARTED" || stepState.status === "RESET") && (
              <button
                onClick={handleStart}
                className={styles.circleBtn}
                aria-label="start"
              >
                <PlayArrowIcon />
              </button>
            )}
            {stepState.status === "IN_PROGRESS" && isActuallyRunning && (
              <button
                onClick={togglePause}
                disabled={isPausing}
                className={styles.circleBtn}
                aria-label="pause"
              >
                <PauseIcon />
              </button>
            )}
            {(stepState.status === "IN_PROGRESS" && !isActuallyRunning) ||
            stepState.status === "PAUSED" ? (
              <button
                onClick={togglePause}
                disabled={isPausing}
                className={styles.circleBtn}
                aria-label="resume"
              >
                <PlayArrowIcon />
              </button>
            ) : null}
            <button
              onClick={handleReset}
              className={styles.circleBtnReset}
              aria-label="reset"
            >
              <ReplayIcon />
            </button>
          </div>
        </div>
      )}

      {type === "PRACTICE" && (
        <div className={styles.completeAction}>
          {stepState.status !== "COMPLETED" ? (
            <button onClick={handleCompletePractice} className={styles.completeBtn}>
              Я выполнил
            </button>
          ) : (
            <div className={styles.completedBadge}>Упражнение выполнено</div>
          )}
        </div>
      )}

      {type === "DIARY" && (
        <div className={styles.stepInfo}>
          {stepState.status !== "COMPLETED" ? (
            <>
              <div className={styles.sectionTitle}>Ваша запись:</div>
              <textarea
                className={styles.diaryTextarea}
                value={diaryContent}
                onChange={(e) => setDiaryContent(e.target.value)}
                placeholder="Опишите свои успехи за сегодня..."
                rows={5}
                maxLength={10000}
              />
              {diaryError && (
                <div className={styles.diaryError} role="alert">
                  {diaryError}
                </div>
              )}
              <button
                type="button"
                onClick={handleSaveDiary}
                disabled={isSavingDiary || !diaryContent.trim()}
                className={styles.completeBtn}
              >
                {isSavingDiary ? "Сохранение…" : "Сохранить"}
              </button>
            </>
          ) : (
            <div className={styles.completedBadge}>Запись сохранена</div>
          )}
          {previousEntries.length > 0 && (
            <>
              <div className={styles.sectionTitle}>Предыдущие записи:</div>
              <ul className={styles.diaryEntriesList}>
                {previousEntries.map((e) => (
                  <li key={e.id} className={styles.diaryEntryItem}>
                    <strong>День {e.dayOrder}. {e.dayTitle}</strong>
                    <span className={styles.diaryEntryDate}>
                      {e.createdAt.toLocaleDateString("ru-RU")}
                    </span>
                    <p className={styles.diaryEntryContent}>{e.content}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
