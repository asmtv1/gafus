"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChecklistQuestion } from "@gafus/types";

import { useStepStore } from "@shared/stores/stepStore";
import { useTimerStore } from "@shared/stores/timerStore";
import { useCacheManager } from "@shared/utils/cacheManager";
import { useSyncStatus } from "@shared/hooks/useSyncStatus";
import { markPracticeStepAsCompleted } from "@shared/lib/training/markPracticeStepAsCompleted";
import styles from "./AccordionStep.module.css";
import { AccessTimeIcon, PauseIcon, PlayArrowIcon, ReplayIcon } from "@/utils/muiImports";
import { getEmbeddedVideoInfo } from "@/utils";
import { TestQuestions } from "./TestQuestions";
import { WrittenFeedback } from "./WrittenFeedback";
import { VideoReport } from "./VideoReport";
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
  initialStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED";
  videoUrl?: string | null;
  imageUrls?: string[];
  onRun: (stepIndex: number) => void;
  onReset: (stepIndex: number) => void;
  
  // Новые поля для типов экзамена
  type?: "TRAINING" | "EXAMINATION" | "THEORY" | "BREAK" | "PRACTICE";
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

  const {
    stepStates,
    initializeStep,
    resumeStep,
    resetStep,
    updateTimeLeft,
    finishStep,
  } = useStepStore();
  const timerStore = useTimerStore();
  const {
    startStepWithServer,
    finishStepWithServer,
    resetStepWithServer,
    pauseStepWithServer,
    resumeStepWithServer,
    startTimer,
    stopTimer,
    canStartStep,
  } = timerStore;
  const { startSync, finishSync, addPendingChange, removePendingChange } = useSyncStatus();

  // Централизованный менеджер кэша
  const { updateStepProgress } = useCacheManager();
  
  // Получаем офлайн URL для видео
  const offlineVideoUrl = useOfflineMediaUrl(courseType, videoUrl);
  
  // Логируем для отладки
  useEffect(() => {
    if (videoUrl) {
      console.log("[AccordionStep] Video URL for offline lookup:", {
        courseType,
        videoUrl,
        offlineVideoUrl,
      });
    }
  }, [courseType, videoUrl, offlineVideoUrl]);
  
  // Получаем информацию о видео для определения типа (внешнее/CDN)
  const videoInfo = useMemo(
    () => {
      const url = offlineVideoUrl || videoUrl;
      return url ? getEmbeddedVideoInfo(url) : null;
    },
    [offlineVideoUrl, videoUrl],
  );
  // Инициализируем шаг при монтировании
  useEffect(() => {
    initializeStep(courseId, dayOnCourseId, stepIndex, durationSec, initialStatus);
  }, [courseId, dayOnCourseId, stepIndex, durationSec, initialStatus, initializeStep]);

  // Получаем состояние шага
  const stepKey = useMemo(() => `${courseId}-${dayOnCourseId}-${stepIndex}`, [courseId, dayOnCourseId, stepIndex]);
  const stepState = stepStates[stepKey];

  // Получаем состояние таймера через хук
  const { timers } = useTimerStore();
  const hasActiveTimer = timers.has(stepKey);
  const isActuallyRunning = stepState?.status === "IN_PROGRESS" && hasActiveTimer;

  // Восстанавливаем таймер при перезагрузке страницы
  useEffect(() => {
    // Если шаг был в процессе выполнения - восстанавливаем таймер
    if (stepState?.status === "IN_PROGRESS") {
      // Проверяем, что таймер действительно нужен (есть время)
      if (stepState.timeLeft > 0) {
        // Даем время на полную инициализацию
        const timer = setTimeout(() => {
          // Проверяем, что таймер еще не запущен для этого шага
          const existingTimer = timers.get(stepKey);

          if (!existingTimer) {
            // Восстанавливаем таймер с флагом isRestore = true
            startTimer(
              courseId,
              dayOnCourseId,
              stepIndex,
              (timeLeft: number) => updateTimeLeft(courseId, dayOnCourseId, stepIndex, timeLeft),
              async () => {
                finishStep(courseId, dayOnCourseId, stepIndex);

                // Обновляем статус на сервере
                try {
                  await finishStepWithServer(courseId, dayOnCourseId, stepIndex, stepTitle, stepOrder);
                } catch (error) {
                  // Не показываем ошибку пользователя, так как действие добавлено в очередь синхронизации
                }

                onRun(-1);
              },
              true, // isRestore = true
            );
          } else {
            // Timer already exists, skipping restoration
          }
        }, 500); // Увеличиваем задержку для полной инициализации

        return () => clearTimeout(timer);
      }
    }
  }, [
    stepState?.status,
    stepState?.timeLeft,
    startTimer,
    courseId,
    dayOnCourseId,
    stepIndex,
    updateTimeLeft,
    finishStep,
    finishStepWithServer,
    stepKey,
    stepOrder,
    stepTitle,
    timers,
    onRun,
  ]);

  // Вспомогательная функция для запуска таймера
  const startStepTimer = useCallback(
    (isResume = false) => {
      if (!canStartStep(courseId, dayOnCourseId, stepIndex)) {
        alert("Один шаг уже активен. Сначала остановите его!");
        return false;
      }

      if (isResume) {
        resumeStep(courseId, dayOnCourseId, stepIndex);
      }

      const timerStarted = startTimer(
        courseId,
        dayOnCourseId,
        stepIndex,
        (timeLeft: number) => updateTimeLeft(courseId, dayOnCourseId, stepIndex, timeLeft),
        async () => {
          // 1. Обновляем кэш на всех уровнях (шаг, день, курс) - это также обновляет локальное состояние
          updateStepProgress(courseId, dayOnCourseId, stepIndex, 'COMPLETED', undefined, totalSteps);

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
      updateTimeLeft,
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
      // Проверяем, может ли шаг быть запущен
      if (!canStartStep(courseId, dayOnCourseId, stepIndex)) {
        alert("Один шаг уже активен. Сначала остановите его!");
        return;
      }

      // Запускаем шаг на сервере
      await startStepWithServer(courseId, dayOnCourseId, stepIndex, durationSec);

      // Обновляем кэш на всех уровнях при запуске шага (включая локальное состояние)
      updateStepProgress(courseId, dayOnCourseId, stepIndex, 'IN_PROGRESS', durationSec, totalSteps);

      // Устанавливаем как активный
      onRun(stepIndex);

      // Запускаем таймер
      if (!startStepTimer(false)) {
        return;
      }
    } catch (error) {
      // Не показываем ошибку пользователю, так как действие добавлено в очередь синхронизации
      
      // Все равно выполняем локальный запуск
      updateStepProgress(courseId, dayOnCourseId, stepIndex, 'IN_PROGRESS', durationSec, totalSteps);
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
        // Если таймер работает - ставим на паузу
        setIsPausing(true);
        try {
          // pauseStepWithServer сам обновит состояние через stepStore
          await pauseStepWithServer(courseId, dayOnCourseId, stepIndex);
          // Обновляем кэш дня/курса
          updateStepProgress(courseId, dayOnCourseId, stepIndex, 'PAUSED', undefined, totalSteps);
        } catch (error) {
          // Не показываем ошибку пользователю, так как действие добавлено в очередь синхронизации
        } finally {
          setIsPausing(false);
        }
      } else {
        // Если таймер не работает, но статус IN_PROGRESS - возобновляем
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
          updateStepProgress(courseId, dayOnCourseId, stepIndex, 'IN_PROGRESS', undefined, totalSteps);
          startStepTimer(true);
        } catch (error) {
          // Не показываем ошибку пользователю, так как действие добавлено в очередь синхронизации
        } finally {
          setIsPausing(false);
        }
      }
    } else if (stepState?.status === "PAUSED") {
      // Если на паузе - возобновляем
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
        updateStepProgress(courseId, dayOnCourseId, stepIndex, 'IN_PROGRESS', undefined, totalSteps);
        startStepTimer(true);
      } catch (error) {
        // Не показываем ошибку пользователю, так как действие добавлено в очередь синхронизации
      } finally {
        setIsPausing(false);
      }
    }
  }, [stepState?.status, stepState?.timeLeft, isActuallyRunning, pauseStepWithServer, courseId, dayOnCourseId, stepIndex, updateStepProgress, resumeStepWithServer, durationSec, startStepTimer, totalSteps]);

  const handleReset = useCallback(async () => {
    try {
      // Сбрасываем шаг на сервере с исходным durationSec
      await resetStepWithServer(courseId, dayOnCourseId, stepIndex, durationSec);

      // Останавливаем таймер
      stopTimer(courseId, dayOnCourseId, stepIndex);

      // Сбрасываем локальное состояние
      resetStep(courseId, dayOnCourseId, stepIndex, durationSec);

      // Уведомляем родителя
      onReset(stepIndex);
    } catch (error) {
      // Не показываем ошибку пользователю, так как действие добавлено в очередь синхронизации
      
      // Все равно выполняем локальный сброс
      stopTimer(courseId, dayOnCourseId, stepIndex);
      resetStep(courseId, dayOnCourseId, stepIndex, durationSec);
      onReset(stepIndex);
    }
  }, [resetStepWithServer, courseId, dayOnCourseId, stepIndex, durationSec, stopTimer, resetStep, onReset, stepKey, stepState?.status, stepState?.timeLeft]);

  const handleCompletePractice = useCallback(async () => {
    try {
      // 1. Обновляем кэш на всех уровнях (шаг, день, курс) - это также обновляет локальное состояние
      updateStepProgress(courseId, dayOnCourseId, stepIndex, 'COMPLETED', undefined, totalSteps);

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
  }, [courseId, dayOnCourseId, stepIndex, stepTitle, stepOrder, updateStepProgress, totalSteps, onRun, addPendingChange, startSync, finishSync, removePendingChange]);


  if (!stepState) return null;

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

      {/* Таймер только для тренировочных шагов и перерывов */}
      {type !== "EXAMINATION" && type !== "THEORY" && type !== "PRACTICE" && (
        <div className={styles.timerCard}>
          <div className={styles.timerHeader}>
            <AccessTimeIcon fontSize="small" />
            <span>{type === "BREAK" ? "Начни перерыв" : "Начните занятие!"}</span>
          </div>
          <div className={styles.controlRow}>
          <div className={styles.timerDisplay}>
            {`${Math.floor(stepState.timeLeft / 60)}:${(stepState.timeLeft % 60)
              .toString()
              .padStart(2, "0")}`}
          </div>
            {stepState.status === "NOT_STARTED" && (
              <button onClick={handleStart} className={styles.circleBtn} aria-label="start">
                <PlayArrowIcon />
              </button>
            )}
            {stepState.status === "IN_PROGRESS" && isActuallyRunning && (
              <button onClick={togglePause} disabled={isPausing} className={styles.circleBtn} aria-label="pause">
                <PauseIcon />
              </button>
            )}
            {(stepState.status === "IN_PROGRESS" && !isActuallyRunning) || stepState.status === "PAUSED" ? (
              <button onClick={togglePause} disabled={isPausing} className={styles.circleBtn} aria-label="resume">
                <PlayArrowIcon />
              </button>
            ) : null}
            <button onClick={handleReset} className={styles.circleBtnReset} aria-label="reset">
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
            <div className={styles.completedBadge}>
              Упражнение выполнено
            </div>
          )}
        </div>
      )}
    </div>
  );

}
