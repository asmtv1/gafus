"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChecklistQuestion } from "@gafus/types";

import { useStepStore } from "@shared/stores/stepStore";
import { useTimerStore } from "@shared/stores/timerStore";
import { useCacheManager } from "@shared/utils/cacheManager";
import { useSyncStatus } from "@shared/hooks/useSyncStatus";
import styles from "./AccordionStep.module.css";
import { AccessTimeIcon, PauseIcon, PlayArrowIcon, ReplayIcon } from "@/utils/muiImports";
import { getEmbeddedVideoInfo } from "@/utils";
import { TestQuestions } from "./TestQuestions";
import { WrittenFeedback } from "./WrittenFeedback";
import { VideoReport } from "./VideoReport";
import ImageViewer from "@shared/components/ui/ImageViewer";

interface AccordionStepProps {
  courseId: string;
  day: number;
  stepIndex: number;
  durationSec: number;
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
  type?: "TRAINING" | "EXAMINATION";
  checklist?: ChecklistQuestion[];
  requiresVideoReport?: boolean;
  requiresWrittenFeedback?: boolean;
  hasTestQuestions?: boolean;
  userStepId?: string;
  stepId: string;
}

export function AccordionStep({
  courseId,
  day,
  stepIndex,
  durationSec,
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
    pauseStep,
    resumeStep,
    resetStep,
    updateTimeLeft,
    finishStep,
  } = useStepStore();
  const {
    startTimer,
    stopTimer,
    startStepWithServer,
    finishStepWithServer,
    resetStepWithServer,
    pauseStepWithServer,
    resumeStepWithServer,
    canStartStep,
  } = useTimerStore();
  const { startSync, finishSync, addPendingChange, removePendingChange } = useSyncStatus();

  // Централизованный менеджер кэша
  const { updateStepProgress } = useCacheManager();
  
  // Получаем информацию о видео
  const videoInfo = useMemo(() => (videoUrl ? getEmbeddedVideoInfo(videoUrl) : null), [videoUrl]);
  // Инициализируем шаг при монтировании
  useEffect(() => {
    initializeStep(courseId, day, stepIndex, durationSec, initialStatus);
  }, [courseId, day, stepIndex, durationSec, initialStatus, initializeStep]);

  // Получаем состояние шага
  const stepKey = useMemo(() => `${courseId}-${day}-${stepIndex}`, [courseId, day, stepIndex]);
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
              day,
              stepIndex,
              (timeLeft: number) => updateTimeLeft(courseId, day, stepIndex, timeLeft),
              async () => {
                finishStep(courseId, day, stepIndex);

                // Обновляем статус на сервере
                try {
                  await finishStepWithServer(courseId, day, stepIndex, stepTitle, stepOrder);
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
    day,
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
      if (!canStartStep(courseId, day, stepIndex)) {
        alert("Один шаг уже активен. Сначала остановите его!");
        return false;
      }

      if (isResume) {
        resumeStep(courseId, day, stepIndex);
      }

      const timerStarted = startTimer(
        courseId,
        day,
        stepIndex,
        (timeLeft: number) => updateTimeLeft(courseId, day, stepIndex, timeLeft),
        async () => {
          // 1. Обновляем кэш на всех уровнях (шаг, день, курс) - это также обновляет локальное состояние
          updateStepProgress(courseId, day, stepIndex, 'COMPLETED', undefined, totalSteps);

          // 2. Обновляем UI немедленно (оптимистичное обновление)
          onRun(-1);

          // 4. Отправляем на сервер с ретраями и индикатором синхронизации
          addPendingChange();
          startSync();
          
          try {
            await finishStepWithServer(courseId, day, stepIndex, stepTitle, stepOrder);
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
      day,
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
      if (!canStartStep(courseId, day, stepIndex)) {
        alert("Один шаг уже активен. Сначала остановите его!");
        return;
      }

      // Запускаем шаг на сервере
      await startStepWithServer(courseId, day, stepIndex, durationSec);

      // Обновляем кэш на всех уровнях при запуске шага (включая локальное состояние)
      updateStepProgress(courseId, day, stepIndex, 'IN_PROGRESS', durationSec, totalSteps);

      // Устанавливаем как активный
      onRun(stepIndex);

      // Запускаем таймер
      if (!startStepTimer(false)) {
        return;
      }
    } catch (error) {
      // Не показываем ошибку пользователю, так как действие добавлено в очередь синхронизации
      
      // Все равно выполняем локальный запуск
      updateStepProgress(courseId, day, stepIndex, 'IN_PROGRESS', durationSec, totalSteps);
      onRun(stepIndex);
      startStepTimer(false);
    }
  }, [
    canStartStep,
    courseId,
    day,
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
          // Используем новую офлайн функцию паузы
          await pauseStepWithServer(courseId, day, stepIndex);

          // Обновляем локальное состояние + кэш дня/курса
          pauseStep(courseId, day, stepIndex);
          updateStepProgress(courseId, day, stepIndex, 'PAUSED', undefined, totalSteps);
        } catch (error) {
          // Не показываем ошибку пользователю, так как действие добавлено в очередь синхронизации
        } finally {
          setIsPausing(false);
        }
      } else {
        // Если таймер не работает, но статус IN_PROGRESS - возобновляем
        setIsPausing(true);
        try {
          // Используем новую офлайн функцию возобновления
          await resumeStepWithServer(
            courseId,
            day,
            stepIndex,
            stepState?.timeLeft ?? durationSec,
          );
          // Обновляем кэш дня/курса
          updateStepProgress(courseId, day, stepIndex, 'IN_PROGRESS', undefined, totalSteps);
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
        // Используем новую офлайн функцию возобновления
        await resumeStepWithServer(
          courseId,
          day,
          stepIndex,
          stepState?.timeLeft ?? durationSec,
        );
        // Обновляем кэш дня/курса
        updateStepProgress(courseId, day, stepIndex, 'IN_PROGRESS', undefined, totalSteps);
        startStepTimer(true);
      } catch (error) {
        // Не показываем ошибку пользователю, так как действие добавлено в очередь синхронизации
      } finally {
        setIsPausing(false);
      }
    }
  }, [stepState?.status, stepState?.timeLeft, isActuallyRunning, pauseStepWithServer, courseId, day, stepIndex, pauseStep, updateStepProgress, resumeStepWithServer, durationSec, startStepTimer, totalSteps]);

  const handleReset = useCallback(async () => {
    try {
      // Сбрасываем шаг на сервере
      await resetStepWithServer(courseId, day, stepIndex);

      // Останавливаем таймер
      stopTimer(courseId, day, stepIndex);

      // Сбрасываем локальное состояние
      resetStep(courseId, day, stepIndex, durationSec);

      // Уведомляем родителя
      onReset(stepIndex);
    } catch (error) {
      // Не показываем ошибку пользователю, так как действие добавлено в очередь синхронизации
      
      // Все равно выполняем локальный сброс
      stopTimer(courseId, day, stepIndex);
      resetStep(courseId, day, stepIndex, durationSec);
      onReset(stepIndex);
    }
  }, [resetStepWithServer, courseId, day, stepIndex, durationSec, stopTimer, resetStep, onReset]);


  if (!stepState) return null;

  return (
    <div className={styles.stepContainer}>
      {/* Таймер только для тренировочных шагов */}
      {type !== "EXAMINATION" && (
        <div className={styles.timerCard}>
          <div className={styles.timerHeader}>
            <AccessTimeIcon fontSize="small" />
            <span>Начните занятие!</span>
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

      {/* Для экзаменационных шагов показываем заголовок */}
      {type === "EXAMINATION" && (
        <div className={styles.timerCard}>
          <div className={styles.timerHeader}>
            <span>Экзаменационный шаг</span>
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

      {/* Изображения шага */}
      {imageUrls && imageUrls.length > 0 && (
        <div className={styles.stepInfo}>
          <div>
            <div className={styles.sectionTitle}>Изображения:</div>
            <div className={styles.imagesGrid}>
              {imageUrls.map((imageUrl, index) => (
                <ImageViewer
                  key={index}
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

      {videoInfo && (
        <div className={styles.videoContainer}>
          <div
            className={`${styles.videoWrapper} ${videoInfo.isShorts ? styles.verticalPlayer : styles.horizontalPlayer}`}
          >
            {videoInfo.isCDN ? (
              <video
                src={videoInfo.embedUrl}
                controls
                className={styles.videoIframe}
                controlsList="nodownload"
                preload="metadata"
              >
                Ваш браузер не поддерживает воспроизведение видео.
              </video>
            ) : (
              <iframe
                src={videoInfo.embedUrl}
                title="Видео упражнения"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className={styles.videoIframe}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );

}
