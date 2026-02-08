import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Text, Divider, IconButton } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, withTiming, useSharedValue } from "react-native-reanimated";
import { useEffect, useState, memo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { getStepDisplayStatus } from "@gafus/core/utils/training";
import { Button, MarkdownText, VideoPlayer } from "@/shared/components";
import type { UserStep, StepContent } from "@/shared/lib/api";
import { TestQuestionsBlock, type ChecklistQuestion } from "./TestQuestionsBlock";
import { VideoReportBlock } from "./VideoReportBlock";
import { WrittenFeedbackBlock } from "./WrittenFeedbackBlock";
import type { LocalStepState } from "@/shared/stores";
import { useTimerStore } from "@/shared/stores";
import { useTimerStore as useTimerStoreDirect } from "@/shared/stores/timerStore";
import { useVideoUrl } from "@/shared/hooks";
import { getOfflineVideoUri } from "@/shared/lib/offline/offlineStorage";
import { COLORS, SPACING } from "@/constants";

const EXTERNAL_VIDEO_PATTERNS = [
  /youtube\.com/,
  /youtu\.be/,
  /rutube\.ru/,
  /vimeo\.com/,
  /vk\.com\/video/,
  /vkvideo\.ru/,
];
function isExternalVideoUrl(url: string): boolean {
  return EXTERNAL_VIDEO_PATTERNS.some((p) => p.test(url));
}

interface AccordionStepProps {
  /** Шаг с вложенным step (API) или плоский контент шага (офлайн). */
  step: UserStep | StepContent;
  /** Индекс шага для API/store (stepIndex). */
  index: number;
  /** Номер для отображения в UI: 1, 2, 3… в рамках текущего дня. */
  stepNumber?: number;
  isOpen: boolean;
  localState: LocalStepState | null;
  courseId: string;
  dayOnCourseId: string;
  onToggle: () => void;
  onStart: () => void;
  onPause: (remainingSec: number) => void;
  onResume: () => void;
  onComplete: () => void;
  onReset?: (durationSec: number) => void;
}

/**
 * Компонент аккордеона для шага тренировки
 */
function AccordionStepComponent({
  step,
  index,
  stepNumber,
  isOpen,
  localState,
  courseId,
  dayOnCourseId,
  onToggle,
  onStart,
  onPause,
  onResume,
  onComplete,
  onReset,
}: AccordionStepProps) {
  if (__DEV__) {
    console.log("[AccordionStep] Рендеринг шага:", {
      index,
      courseId,
      dayOnCourseId,
      isOpen,
      hasStep: !!step,
      stepKeys: step ? Object.keys(step) : [],
    });
  }

  // Поддержка обеих структур: с вложенным step.step (UserStep) и плоского шага (офлайн)
  let stepData: StepContent;
  try {
    stepData = ("step" in step && step.step ? step.step : step) as StepContent;
  } catch (error) {
    if (__DEV__) {
      console.error("[AccordionStep] Ошибка при извлечении stepData:", error);
    }
    stepData = step as StepContent;
  }

  const { activeTimer, startTimer, pauseTimer, tick, stopTimer, isTimerActiveFor } = useTimerStore(
    useShallow((s) => ({
      activeTimer: s.activeTimer,
      startTimer: s.startTimer,
      pauseTimer: s.pauseTimer,
      tick: s.tick,
      stopTimer: s.stopTimer,
      isTimerActiveFor: s.isTimerActiveFor,
    })),
  );

  const status = getStepDisplayStatus(
    localState,
    "status" in step ? step : undefined,
  );
  const isCompleted = status === "COMPLETED";
  const isInProgress = status === "IN_PROGRESS";
  const isPaused = status === "PAUSED";
  const isReset = status === "RESET";
  const stepType = stepData?.type ?? "";
  const isTheory = stepType === "THEORY";
  const isPractice = stepType === "PRACTICE";
  const isBreak = stepType === "BREAK";
  const isExamination = stepType === "EXAMINATION";
  // Таймер показывается для TRAINING шагов и перерывов (не для PRACTICE, THEORY, EXAMINATION)
  const showTimer =
    stepType === "TRAINING" || isBreak || (!isTheory && !isPractice && !isExamination);

  const videoUrl = stepData?.videoUrl ?? null;
  const [videoRetryKey, setVideoRetryKey] = useState(0);
  const lastPlaybackUrlRef = useRef<string | null>(null);

  if (__DEV__) {
    console.log("[AccordionStep] Video URL:", {
      index,
      hasStepData: !!stepData,
      hasStep: !!step,
      videoUrl,
      videoUrlType: typeof videoUrl,
    });
  }

  const [userRequestedPlay, setUserRequestedPlay] = useState(false);
  const [offlineVideoUri, setOfflineVideoUri] = useState<string | null>(null);
  const requestOnlineUrl =
    isOpen &&
    userRequestedPlay &&
    videoUrl &&
    typeof videoUrl === "string" &&
    videoUrl.trim() !== "";
  const {
    url: playbackUrl,
    isLoading: isLoadingVideo,
    error: videoError,
  } = useVideoUrl(requestOnlineUrl ? videoUrl : null);

  useEffect(() => {
    if (!requestOnlineUrl || !videoUrl || !courseId) {
      setOfflineVideoUri(null);
      return;
    }
    getOfflineVideoUri(courseId, videoUrl).then((uri) => setOfflineVideoUri(uri));
  }, [requestOnlineUrl, videoUrl, courseId]);

  const effectivePlaybackUrl =
    offlineVideoUri ?? playbackUrl ?? lastPlaybackUrlRef.current;
  const showOfflineStub =
    requestOnlineUrl &&
    videoUrl &&
    isExternalVideoUrl(videoUrl) &&
    !effectivePlaybackUrl;

  useEffect(() => {
    if (!isOpen) setUserRequestedPlay(false);
  }, [isOpen]);

  useEffect(() => {
    lastPlaybackUrlRef.current = null;
  }, [videoUrl]);
  useEffect(() => {
    if (playbackUrl) lastPlaybackUrlRef.current = playbackUrl;
  }, [playbackUrl]);

  if (__DEV__ && videoUrl) {
    console.log("[AccordionStep] Video URL состояние:", {
      index,
      isLoadingVideo,
      hasPlaybackUrl: !!playbackUrl,
      playbackUrl,
      videoError,
    });
  }

  // Проверяем, активен ли таймер для этого шага
  const hasActiveTimer = isTimerActiveFor(courseId, dayOnCourseId, index);
  const isActuallyRunning = isInProgress && hasActiveTimer && activeTimer?.isRunning;

  // Обновление таймера каждую секунду (как в web)
  useEffect(() => {
    try {
      // Проверяем состояние таймера напрямую из store
      const currentTimer = useTimerStoreDirect.getState().activeTimer;
      const isTimerActive =
        currentTimer &&
        currentTimer.courseId === courseId &&
        currentTimer.dayOnCourseId === dayOnCourseId &&
        currentTimer.stepIndex === index &&
        currentTimer.isRunning;

      if (!isTimerActive) {
        return;
      }

      if (__DEV__) {
        console.log("[AccordionStep] Запуск таймера:", { index, courseId, dayOnCourseId });
      }

      const interval = setInterval(() => {
        try {
          // Проверяем, что таймер все еще активен и работает
          const timerState = useTimerStoreDirect.getState().activeTimer;
          if (!timerState || !timerState.isRunning) {
            return;
          }

          // Проверяем, что это тот же таймер
          if (
            timerState.courseId !== courseId ||
            timerState.dayOnCourseId !== dayOnCourseId ||
            timerState.stepIndex !== index
          ) {
            return;
          }

          tick();

          const updatedTimer = useTimerStoreDirect.getState().activeTimer;
          if (
            updatedTimer &&
            updatedTimer.courseId === courseId &&
            updatedTimer.dayOnCourseId === dayOnCourseId &&
            updatedTimer.stepIndex === index &&
            updatedTimer.remainingSec <= 0
          ) {
            stopTimer();
            onComplete();
          }
        } catch (error) {
          if (__DEV__) {
            console.error("[AccordionStep] Ошибка в интервале таймера:", error);
          }
        }
      }, 1000);

      return () => clearInterval(interval);
    } catch (error) {
      if (__DEV__) {
        console.error("[AccordionStep] Ошибка в useEffect таймера:", error);
      }
    }
  }, [
    hasActiveTimer,
    activeTimer?.isRunning,
    tick,
    courseId,
    dayOnCourseId,
    index,
    stopTimer,
    onComplete,
  ]);

  // Анимация высоты контента
  const heightAnim = useSharedValue(0);

  useEffect(() => {
    heightAnim.value = withTiming(isOpen ? 1 : 0, { duration: 200 });
  }, [isOpen, heightAnim]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: heightAnim.value,
    maxHeight: heightAnim.value * 3000, // чтобы контент не обрезался, скролл внутри
  }));

  // Иконка статуса
  const getStatusIcon = () => {
    if (isCompleted) {
      return <MaterialCommunityIcons name="check-circle" size={24} color={COLORS.success} />;
    }
    if (isInProgress) {
      return <MaterialCommunityIcons name="play-circle" size={24} color={COLORS.primary} />;
    }
    if (isPaused) {
      return <MaterialCommunityIcons name="pause-circle" size={24} color={COLORS.warning} />;
    }
    return <MaterialCommunityIcons name="circle-outline" size={24} color={COLORS.disabled} />;
  };

  // Иконка типа шага
  const getTypeIcon = () => {
    if (isTheory) return "book-open-variant";
    if (isPractice) return "timer";
    return "file-document";
  };

  if (__DEV__) {
    console.log("[AccordionStep] Рендеринг JSX:", {
      index,
      isOpen,
      stepType,
      hasVideoUrl: !!videoUrl,
      hasPlaybackUrl: !!playbackUrl,
      isLoadingVideo,
    });
  }

  return (
    <View style={[styles.container, isCompleted && styles.completedContainer]}>
      <View style={styles.surfaceContent}>
        {/* Заголовок (всегда видимый) */}
        <Pressable onPress={onToggle} style={styles.header}>
          <View
            style={[
              styles.stepNumber,
              isBreak && styles.stepNumberBreak,
              !isBreak && stepNumber != null && styles.stepNumberExercise,
            ]}
          >
            <Text style={styles.stepNumberText} numberOfLines={1}>
              {isBreak
                ? "Перерыв"
                : stepNumber != null
                  ? `Упражнение #${stepNumber}`
                  : `#${index + 1}`}
            </Text>
          </View>

          <View style={styles.headerContent}>
            <Text variant="titleSmall" numberOfLines={2} style={styles.title}>
              {isBreak ? stepData?.title : `«${stepData?.title ?? "Шаг"}»`}
            </Text>
            <View style={styles.meta}>
              <MaterialCommunityIcons name={getTypeIcon()} size={14} color={COLORS.textSecondary} />
              <Text style={styles.metaText}>
                {isBreak
                  ? "Перерыв"
                  : isTheory
                    ? "Теория"
                    : isPractice
                      ? "Практика"
                      : "Материал"}
              </Text>
              {(() => {
                try {
                  const duration = stepData?.durationSec;
                  if (!duration || duration === 0) {
                    return null;
                  }
                  return (
                    <>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.metaText}>{Math.ceil(duration / 60)} мин</Text>
                    </>
                  );
                } catch (error) {
                  if (__DEV__) {
                    console.error("[AccordionStep] Ошибка при отображении длительности:", error);
                  }
                  return null;
                }
              })()}
            </View>
          </View>

          <View style={styles.headerRight}>
            {getStatusIcon()}
            <MaterialCommunityIcons
              name={isOpen ? "chevron-up" : "chevron-down"}
              size={24}
              color={COLORS.textSecondary}
            />
          </View>
        </Pressable>

        {/* Контент (раскрывающийся) */}
        <Animated.View style={[styles.content, animatedStyle]}>
          {isOpen && (
            <ScrollView
              style={styles.stepContentScroll}
              contentContainerStyle={styles.stepContentScrollContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <Divider style={styles.divider} />

              {/* Информационные карточки для разных типов шагов (как в web) */}
              {isTheory && (
                <View style={styles.infoCard}>
                  <Text style={styles.infoCardTitle}>Теоретический шаг</Text>
                  {stepData.estimatedDurationSec && stepData.estimatedDurationSec > 0 && (
                    <View style={styles.estimatedTimeBadge}>
                      <Text style={styles.estimatedTimeBadgeText}>
                        Этот шаг займёт ~ {Math.round(stepData.estimatedDurationSec / 60)} мин
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {isPractice && (
                <View style={styles.infoCard}>
                  <Text style={styles.infoCardTitle}>Упражнение без таймера</Text>
                  {stepData.estimatedDurationSec && stepData.estimatedDurationSec > 0 && (
                    <View style={styles.estimatedTimeBadge}>
                      <Text style={styles.estimatedTimeBadgeText}>
                        Примерное время: ~{Math.round(stepData.estimatedDurationSec / 60)} мин
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {isExamination && (
                <View style={styles.infoCard}>
                  <Text style={styles.infoCardTitle}>Экзаменационный шаг</Text>
                  {stepData.estimatedDurationSec && stepData.estimatedDurationSec > 0 && (
                    <View style={styles.estimatedTimeBadge}>
                      <Text style={styles.estimatedTimeBadgeText}>
                        Этот шаг займёт ~ {Math.round(stepData.estimatedDurationSec / 60)} мин
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Блок экзамена: тест, письменная связь, видео (как на web) */}
              {isExamination &&
                "userStepId" in step &&
                typeof (step as { userStepId?: string }).userStepId === "string" && (
                  <View style={styles.descriptionSection}>
                    <Text style={styles.descriptionSectionTitle}>Экзамен:</Text>
                    <View style={styles.descriptionSectionContent}>
                      {"hasTestQuestions" in step &&
                        (step as { hasTestQuestions?: boolean }).hasTestQuestions &&
                        "checklist" in step &&
                        Array.isArray((step as { checklist?: unknown }).checklist) &&
                        ((step as { checklist: ChecklistQuestion[] }).checklist.length > 0) && (
                          <TestQuestionsBlock
                            checklist={(step as { checklist: ChecklistQuestion[] }).checklist}
                            userStepId={(step as { userStepId: string }).userStepId}
                            stepId={
                              (stepData && "id" in stepData && stepData.id) ||
                              ("id" in step && (step as { id: string }).id) ||
                              ""
                            }
                          />
                        )}
                      {"requiresWrittenFeedback" in step &&
                        (step as { requiresWrittenFeedback?: boolean }).requiresWrittenFeedback && (
                          <WrittenFeedbackBlock
                            userStepId={(step as { userStepId: string }).userStepId}
                            stepId={
                              (stepData && "id" in stepData && stepData.id) ||
                              ("id" in step && (step as { id: string }).id) ||
                              ""
                            }
                          />
                        )}
                      {"requiresVideoReport" in step &&
                        (step as { requiresVideoReport?: boolean }).requiresVideoReport && (
                          <VideoReportBlock
                            userStepId={(step as { userStepId: string }).userStepId}
                            stepId={
                              (stepData && "id" in stepData && stepData.id) ||
                              ("id" in step && (step as { id: string }).id) ||
                              ""
                            }
                          />
                        )}
                    </View>
                  </View>
                )}

              {/* Описание перед видео */}
              {(() => {
                const description =
                  (stepData && "description" in stepData && stepData.description) ||
                  (step && "description" in step && step.description);
                if (!description || typeof description !== "string" || description.trim() === "")
                  return null;
                return (
                  <View style={styles.descriptionSection}>
                    <Text style={styles.descriptionSectionTitle}>Описание:</Text>
                    <View style={styles.descriptionSectionContent}>
                      <MarkdownText text={description} />
                    </View>
                  </View>
                );
              })()}

              {/* Видео: сначала обложка с кнопкой Play (как на web), по нажатию — загрузка и плеер */}
              {!isBreak &&
                videoUrl &&
                typeof videoUrl === "string" &&
                videoUrl.trim() !== "" && (
                  <View style={styles.videoContainer}>
                    {!userRequestedPlay ? (
                      <Pressable
                        style={styles.videoCover}
                        onPress={() => setUserRequestedPlay(true)}
                      >
                        <MaterialCommunityIcons name="play-circle-outline" size={72} color="#fff" />
                        <Text style={styles.videoCoverText}>Смотреть видео</Text>
                      </Pressable>
                    ) : showOfflineStub ? (
                      <View style={styles.videoLoadingContainer}>
                        <Text style={styles.videoLoadingText}>
                          Для просмотра нужен интернет
                        </Text>
                      </View>
                    ) : isLoadingVideo && !offlineVideoUri ? (
                      <View style={styles.videoLoadingContainer}>
                        <Text style={styles.videoLoadingText}>Загрузка видео...</Text>
                      </View>
                    ) : videoError && !offlineVideoUri ? null : effectivePlaybackUrl ? (
                      <VideoPlayer
                        key={`${effectivePlaybackUrl}-${videoRetryKey}`}
                        uri={effectivePlaybackUrl}
                        onComplete={onComplete}
                        onRetry={() => setVideoRetryKey((k) => k + 1)}
                      />
                    ) : null}
                  </View>
                )}

              {/* Таймер для тренировочных шагов и перерывов (как в web) */}
              {showTimer &&
                (() => {
                  try {
                    const duration = stepData?.durationSec ?? 0;
                    // Используем время из активного таймера, если он запущен, иначе из localState
                    const currentTimer = useTimerStoreDirect.getState().activeTimer;
                    const timeLeft =
                      hasActiveTimer && currentTimer
                        ? currentTimer.remainingSec
                        : isReset
                          ? duration
                          : (localState?.timeLeft ?? localState?.remainingSec ?? duration);

                    // Форматирование времени MM:SS
                    const formatTime = (seconds: number): string => {
                      const mins = Math.floor(seconds / 60);
                      const secs = seconds % 60;
                      return `${mins}:${secs.toString().padStart(2, "0")}`;
                    };

                    const timerHeaderText = isBreak
                      ? "Начни перерыв"
                      : isReset
                        ? "Сброшен"
                        : "Начните занятие!";

                    return (
                      <View style={styles.timerCard}>
                        <View style={styles.timerHeader}>
                          <MaterialCommunityIcons
                            name="clock-outline"
                            size={20}
                            color={COLORS.textSecondary}
                          />
                          <Text style={styles.timerHeaderText}>{timerHeaderText}</Text>
                        </View>

                        <View style={styles.timerControls}>
                          {/* Отображение времени */}
                          <Text style={styles.timerDisplay}>{formatTime(timeLeft)}</Text>

                          {/* Кнопки управления */}
                          <View style={styles.timerButtons}>
                            {(status === "NOT_STARTED" || status === "RESET") && (
                              <IconButton
                                icon="play-circle"
                                iconColor={WEB.circleBtnBorder}
                                size={28}
                                style={styles.circleBtn}
                                onPress={() => {
                                  startTimer(courseId, dayOnCourseId, index, duration);
                                  onStart();
                                }}
                              />
                            )}
                            {status === "IN_PROGRESS" && isActuallyRunning && (
                              <IconButton
                                icon="pause-circle"
                                iconColor={WEB.circleBtnBorder}
                                size={28}
                                style={styles.circleBtn}
                                onPress={() => {
                                  const remaining = pauseTimer();
                                  if (remaining !== null) {
                                    onPause(remaining);
                                  }
                                }}
                              />
                            )}
                            {((status === "IN_PROGRESS" && !isActuallyRunning) ||
                              status === "PAUSED") && (
                              <IconButton
                                icon="play-circle"
                                iconColor={WEB.circleBtnBorder}
                                size={28}
                                style={styles.circleBtn}
                                onPress={() => {
                                  const remaining =
                                    localState?.timeLeft ?? localState?.remainingSec ?? duration;
                                  startTimer(courseId, dayOnCourseId, index, remaining);
                                  onResume();
                                }}
                              />
                            )}
                            <IconButton
                              icon="replay"
                              iconColor={WEB.circleBtnBorder}
                              size={22}
                              style={styles.circleBtnReset}
                              onPress={() => {
                                stopTimer();
                                if (onReset) {
                                  onReset(duration);
                                }
                              }}
                            />
                          </View>
                        </View>
                      </View>
                    );
                  } catch (error) {
                    if (__DEV__) {
                      console.error("[AccordionStep] Ошибка при отображении таймера:", error);
                    }
                    return null;
                  }
                })()}

              {/* Кнопки действий — как в web: PRACTICE «Я выполнил» / «Упражнение выполнено», THEORY «Прочитано» */}
              <View style={styles.actions}>
                {isPractice ? (
                  isCompleted ? (
                    <View style={styles.completedBadge}>
                      <Text style={styles.completedBadgeCheck}>✓</Text>
                      <Text style={styles.completedBadgeText}>Упражнение выполнено</Text>
                    </View>
                  ) : (
                    <View style={styles.completeAction}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.completeBtn,
                          pressed && styles.completeBtnPressed,
                        ]}
                        onPress={onComplete}
                      >
                        <Text style={styles.completeBtnText}>Я выполнил</Text>
                      </Pressable>
                    </View>
                  )
                ) : isTheory && !isCompleted ? (
                  <Button label="Прочитано" onPress={onComplete} icon="check" />
                ) : isCompleted ? (
                  <View style={styles.completedBadge}>
                    <MaterialCommunityIcons name="check" size={16} color={COLORS.success} />
                    <Text style={styles.completedText}>Выполнено</Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

// Цвета как в web AccordionStep.module.css
const WEB = {
  stepBorder: "#636128",
  stepBg: "#fff8e5",
  timerCardBg: "#fffdf3",
  timerCardBorder: "#d5d0bb",
  completeBtnBg: "#636128",
  completeBtnText: "#ece5d2",
  completedBadgeBg: "#b6c582",
  completedBadgeText: "#155724",
  circleBtnBorder: "#b6c582",
  estimatedBadgeBg: "#e0e7ff",
  estimatedBadgeText: "#1e3a8a",
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderColor: WEB.stepBorder,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: WEB.stepBg,
  },
  surfaceContent: {
    overflow: "hidden",
  },
  completedContainer: {
    backgroundColor: "#F5FFF5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: 0,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.sm,
  },
  stepNumberBreak: {
    minWidth: 56,
    width: undefined,
    paddingHorizontal: 8,
  },
  stepNumberExercise: {
    minWidth: 90,
    width: undefined,
    paddingHorizontal: 6,
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontWeight: "600",
    marginBottom: 2,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  metaDot: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  content: {
    overflow: "hidden",
  },
  stepContentScroll: {
    maxHeight: 3000,
  },
  stepContentScrollContent: {
    paddingBottom: 0,
  },
  divider: {
    marginHorizontal: SPACING.md,
  },
  descriptionSection: {
    marginTop: SPACING.md,
    paddingHorizontal: 0,
  },
  descriptionSectionTitle: {
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 6,
    fontSize: 14,
  },
  descriptionSectionContent: {
    backgroundColor: WEB.timerCardBg,
    borderWidth: 2,
    borderColor: WEB.timerCardBorder,
    borderRadius: 12,
    padding: 12,
    paddingHorizontal: 14,
  },
  actions: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  completeAction: {
    marginTop: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
  },
  completeBtn: {
    backgroundColor: WEB.completeBtnBg,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 200,
    maxWidth: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  completeBtnPressed: {
    opacity: 0.9,
  },
  completeBtnText: {
    color: WEB.completeBtnText,
    fontSize: 15,
    fontWeight: "600",
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: WEB.completedBadgeBg,
    marginTop: SPACING.sm,
    alignSelf: "center",
  },
  completedBadgeCheck: {
    fontSize: 18,
    fontWeight: "bold",
    color: WEB.completedBadgeText,
    width: 24,
    textAlign: "center",
  },
  completedBadgeText: {
    color: WEB.completedBadgeText,
    fontSize: 15,
    fontWeight: "600",
  },
  completedText: {
    color: COLORS.success,
    fontWeight: "600",
  },
  videoContainer: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: 0,
  },
  videoCover: {
    aspectRatio: 16 / 9,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  videoCoverText: {
    marginTop: SPACING.sm,
    fontSize: 16,
    color: "#fff",
  },
  infoCard: {
    padding: 14,
    paddingHorizontal: 0,
    backgroundColor: WEB.timerCardBg,
    borderWidth: 2,
    borderColor: WEB.timerCardBorder,
    borderRadius: 12,
    marginTop: 10,
    alignItems: "center",
  },
  infoCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  infoCardText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  estimatedTimeBadge: {
    marginTop: 8,
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: WEB.estimatedBadgeBg,
  },
  estimatedTimeBadgeText: {
    fontSize: 13,
    fontWeight: "500",
    color: WEB.estimatedBadgeText,
  },
  timerCard: {
    padding: 14,
    paddingHorizontal: 16,
    marginTop: 10,
    backgroundColor: WEB.timerCardBg,
    borderWidth: 2,
    borderColor: WEB.timerCardBorder,
    borderRadius: 12,
    alignItems: "center",
  },
  timerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  timerHeaderText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "600",
  },
  timerControls: {
    alignItems: "center",
  },
  timerDisplay: {
    fontSize: 48,
    fontWeight: "600",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
    marginVertical: 8,
    fontFamily: "monospace",
  },
  timerButtons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: 8,
  },
  circleBtn: {
    width: 55,
    height: 55,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: WEB.circleBtnBorder,
    backgroundColor: "transparent",
  },
  circleBtnReset: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: WEB.circleBtnBorder,
    backgroundColor: "transparent",
  },
  videoLoadingContainer: {
    aspectRatio: 16 / 9,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  videoLoadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

// Мемоизация: перерендериваем только если изменились критичные пропсы
export const AccordionStep = memo(AccordionStepComponent, (prevProps, nextProps) => {
  return (
    prevProps.step.id === nextProps.step.id &&
    prevProps.index === nextProps.index &&
    prevProps.isOpen === nextProps.isOpen &&
    prevProps.stepNumber === nextProps.stepNumber &&
    prevProps.localState?.status === nextProps.localState?.status &&
    prevProps.localState?.timeLeft === nextProps.localState?.timeLeft &&
    prevProps.localState?.remainingSec === nextProps.localState?.remainingSec
  );
});
