import { View, StyleSheet, Pressable } from "react-native";
import { Text, Surface, Divider, IconButton } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { useEffect, useState } from "react";

import { StepTimer } from "./StepTimer";
import { Button } from "@/shared/components/ui";
import { VideoPlayer } from "@/shared/components";
import type { UserStep } from "@/shared/lib/api";
import type { LocalStepState } from "@/shared/stores";
import { useStepStore, useTimerStore } from "@/shared/stores";
import { useTimerStore as useTimerStoreDirect } from "@/shared/stores/timerStore";
import { useVideoUrl } from "@/shared/hooks";
import { COLORS, SPACING } from "@/constants";

interface AccordionStepProps {
  step: UserStep;
  index: number;
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
export function AccordionStep({
  step,
  index,
  isOpen,
  localState,
  courseId,
  dayOnCourseId,
  onToggle,
  onStart,
  onPause,
  onResume,
  onComplete,
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

  // Поддержка обеих структур данных: с вложенным step.step и без него
  let stepData;
  try {
    stepData = "step" in step && step.step ? step.step : step;
  } catch (error) {
    if (__DEV__) {
      console.error("[AccordionStep] Ошибка при извлечении stepData:", error);
    }
    stepData = step;
  }
  
  const { updateTimeLeft } = useStepStore();
  const timerStore = useTimerStore();
  const { activeTimer, startTimer, pauseTimer, tick, stopTimer, isTimerActiveFor } = timerStore;
  
  const status = localState?.status || step.status;
  const isCompleted = status === "COMPLETED";
  const isInProgress = status === "IN_PROGRESS";
  const isPaused = status === "PAUSED";
  const stepType = stepData?.type || step?.type;
  const isTheory = stepType === "THEORY";
  const isPractice = stepType === "PRACTICE";
  const isBreak = stepType === "BREAK";
  const isExamination = stepType === "EXAMINATION";
  // Таймер показывается для TRAINING шагов и перерывов (не для PRACTICE, THEORY, EXAMINATION)
  const showTimer = stepType === "TRAINING" || isBreak || (!isTheory && !isPractice && !isExamination);
  
  // Получаем videoUrl для хука (должен быть на верхнем уровне)
  const videoUrl = stepData?.videoUrl || step?.videoUrl;
  
  if (__DEV__) {
    console.log("[AccordionStep] Video URL:", {
      index,
      hasStepData: !!stepData,
      hasStep: !!step,
      videoUrl,
      videoUrlType: typeof videoUrl,
    });
  }
  
  const { url: playbackUrl, isLoading: isLoadingVideo, error: videoError } = useVideoUrl(
    videoUrl && typeof videoUrl === "string" && videoUrl.trim() !== "" ? videoUrl : null
  );
  
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
      const isTimerActive = currentTimer && 
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
          if (timerState.courseId !== courseId ||
              timerState.dayOnCourseId !== dayOnCourseId ||
              timerState.stepIndex !== index) {
            return;
          }
          
          tick();
          
          // Обновляем timeLeft в stepStore после каждого тика
          const updatedTimer = useTimerStoreDirect.getState().activeTimer;
          if (updatedTimer && 
              updatedTimer.courseId === courseId &&
              updatedTimer.dayOnCourseId === dayOnCourseId &&
              updatedTimer.stepIndex === index) {
            updateTimeLeft(courseId, dayOnCourseId, index, updatedTimer.remainingSec);
            
            if (updatedTimer.remainingSec <= 0) {
              stopTimer();
              onComplete();
            }
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
  }, [hasActiveTimer, activeTimer?.isRunning, tick, updateTimeLeft, courseId, dayOnCourseId, index, stopTimer, onComplete]);

  // Анимация высоты контента
  const heightAnim = useSharedValue(0);

  useEffect(() => {
    heightAnim.value = withTiming(isOpen ? 1 : 0, { duration: 200 });
  }, [isOpen, heightAnim]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: heightAnim.value,
    maxHeight: heightAnim.value * 500, // Достаточная максимальная высота
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
    <Surface style={[styles.container, isCompleted && styles.completedContainer]} elevation={1}>
      <View style={styles.surfaceContent}>
        {/* Заголовок (всегда видимый) */}
        <Pressable onPress={onToggle} style={styles.header}>
        <View style={styles.stepNumber}>
          <Text style={styles.stepNumberText}>{index + 1}</Text>
        </View>

        <View style={styles.headerContent}>
          <Text variant="titleSmall" numberOfLines={2} style={styles.title}>
            {stepData?.title || step?.title || "Шаг без названия"}
          </Text>
          <View style={styles.meta}>
            <MaterialCommunityIcons
              name={getTypeIcon()}
              size={14}
              color={COLORS.textSecondary}
            />
            <Text style={styles.metaText}>
              {isTheory ? "Теория" : isPractice ? "Практика" : "Материал"}
            </Text>
            {(() => {
              try {
                const duration = stepData?.durationSec || step?.durationSec;
                if (!duration || duration === 0) {
                  return null;
                }
                return (
                  <>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>
                      {Math.ceil(duration / 60)} мин
                    </Text>
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
          <>
            <Divider style={styles.divider} />

            {/* Видео для всех шагов (кроме перерывов) */}
            {!isBreak && videoUrl && typeof videoUrl === "string" && videoUrl.trim() !== "" && (() => {
              if (isLoadingVideo) {
                return (
                  <View style={styles.videoContainer}>
                    <View style={styles.videoLoadingContainer}>
                      <Text style={styles.videoLoadingText}>Загрузка видео...</Text>
                    </View>
                  </View>
                );
              }
              
              if (videoError || !playbackUrl) {
                if (__DEV__) {
                  console.warn("[AccordionStep] Ошибка загрузки видео:", videoError || "URL не получен");
                }
                return null;
              }
              
              return (
                <View style={styles.videoContainer}>
                  <VideoPlayer
                    uri={playbackUrl}
                    onComplete={onComplete}
                  />
                </View>
              );
            })()}

            {/* Описание */}
            {(() => {
              try {
                const description = stepData?.description || step?.description;
                if (!description || typeof description !== "string") {
                  return null;
                }
                // Простая обработка markdown для отображения
                const cleanDescription = description
                  .replace(/#{1,6}\s/g, "") // Удаляем заголовки
                  .replace(/\*\*/g, "") // Удаляем жирный текст
                  .replace(/---/g, "") // Удаляем разделители
                  .replace(/\n{3,}/g, "\n\n"); // Убираем множественные переносы
                
                return (
                  <View style={styles.descriptionContainer}>
                    <Text style={styles.description}>
                      {cleanDescription}
                    </Text>
                  </View>
                );
              } catch (error) {
                if (__DEV__) {
                  console.error("[AccordionStep] Ошибка при отображении описания:", error);
                }
                return null;
              }
            })()}

            {/* Информационные карточки для разных типов шагов */}
            {isTheory && (
              <View style={styles.infoCard}>
                <Text style={styles.infoCardTitle}>Теоретический шаг</Text>
                {stepData.estimatedDurationSec && stepData.estimatedDurationSec > 0 && (
                  <Text style={styles.infoCardText}>
                    Примерное время: ~{Math.round(stepData.estimatedDurationSec / 60)} мин
                  </Text>
                )}
              </View>
            )}

            {isPractice && (
              <View style={styles.infoCard}>
                <Text style={styles.infoCardTitle}>Упражнение без таймера</Text>
                {stepData.estimatedDurationSec && stepData.estimatedDurationSec > 0 && (
                  <Text style={styles.infoCardText}>
                    Примерное время: ~{Math.round(stepData.estimatedDurationSec / 60)} мин
                  </Text>
                )}
              </View>
            )}

            {isExamination && (
              <View style={styles.infoCard}>
                <Text style={styles.infoCardTitle}>Экзаменационный шаг</Text>
                {stepData.estimatedDurationSec && stepData.estimatedDurationSec > 0 && (
                  <Text style={styles.infoCardText}>
                    Этот шаг займёт ~{Math.round(stepData.estimatedDurationSec / 60)} мин
                  </Text>
                )}
              </View>
            )}

            {/* Таймер для тренировочных шагов и перерывов (как в web) */}
            {showTimer && (() => {
              try {
                const duration = stepData?.durationSec || step?.durationSec || 0;
                // Используем время из активного таймера, если он запущен, иначе из localState
                const currentTimer = useTimerStoreDirect.getState().activeTimer;
                const timeLeft = (hasActiveTimer && currentTimer) 
                  ? currentTimer.remainingSec 
                  : (localState?.timeLeft ?? localState?.remainingSec ?? duration);
                
                // Форматирование времени MM:SS
                const formatTime = (seconds: number): string => {
                  const mins = Math.floor(seconds / 60);
                  const secs = seconds % 60;
                  return `${mins}:${secs.toString().padStart(2, "0")}`;
                };

              return (
                <View style={styles.timerCard}>
                  <View style={styles.timerHeader}>
                    <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.textSecondary} />
                    <Text style={styles.timerHeaderText}>
                      {isBreak ? "Начни перерыв" : "Начните занятие!"}
                    </Text>
                  </View>
                  
                  <View style={styles.timerControls}>
                    {/* Отображение времени */}
                    <Text style={styles.timerDisplay}>
                      {formatTime(timeLeft)}
                    </Text>
                    
                    {/* Кнопки управления */}
                    <View style={styles.timerButtons}>
                      {status === "NOT_STARTED" && (
                        <IconButton
                          icon="play-circle"
                          iconColor={COLORS.primary}
                          size={48}
                          onPress={() => {
                            // Запускаем таймер в store
                            startTimer(courseId, dayOnCourseId, index, duration);
                            onStart();
                          }}
                        />
                      )}
                      {status === "IN_PROGRESS" && isActuallyRunning && (
                        <IconButton
                          icon="pause-circle"
                          iconColor={COLORS.warning}
                          size={48}
                          onPress={() => {
                            // Останавливаем таймер в store
                            const remaining = pauseTimer();
                            if (remaining !== null) {
                              onPause(remaining);
                            }
                          }}
                        />
                      )}
                      {((status === "IN_PROGRESS" && !isActuallyRunning) || status === "PAUSED") && (
                        <IconButton
                          icon="play-circle"
                          iconColor={COLORS.primary}
                          size={48}
                          onPress={() => {
                            const remaining = localState?.timeLeft ?? localState?.remainingSec ?? duration;
                            // Возобновляем таймер в store
                            startTimer(courseId, dayOnCourseId, index, remaining);
                            onResume();
                          }}
                        />
                      )}
                      {/* Кнопка рестарт (всегда видна) */}
                      <IconButton
                        icon="replay"
                        iconColor={COLORS.textSecondary}
                        size={40}
                        onPress={() => {
                          // Останавливаем текущий таймер
                          stopTimer();
                          // Сбрасываем шаг в NOT_STARTED (на паузу)
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

            {/* Кнопки действий */}
            <View style={styles.actions}>
              {isCompleted ? (
                <View style={styles.completedBadge}>
                  <MaterialCommunityIcons name="check" size={16} color={COLORS.success} />
                  <Text style={styles.completedText}>Выполнено</Text>
                </View>
              ) : isTheory ? (
                <Button
                  label="Прочитано"
                  onPress={onComplete}
                  icon="check"
                />
              ) : !isInProgress && !isPaused ? (
                <Button
                  label="Начать"
                  onPress={onStart}
                  icon="play"
                />
              ) : (
                <View />
              )}
            </View>
          </>
        )}
      </Animated.View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    marginBottom: SPACING.sm,
  },
  surfaceContent: {
    overflow: "hidden",
    borderRadius: 12,
  },
  completedContainer: {
    backgroundColor: "#F5FFF5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
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
  divider: {
    marginHorizontal: SPACING.md,
  },
  descriptionContainer: {
    padding: SPACING.md,
    paddingTop: SPACING.sm,
  },
  description: {
    color: COLORS.textSecondary,
    lineHeight: 20,
    fontSize: 14,
  },
  actions: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    padding: SPACING.sm,
    backgroundColor: COLORS.success + "15",
    borderRadius: 8,
  },
  completedText: {
    color: COLORS.success,
    fontWeight: "600",
  },
  videoContainer: {
    padding: SPACING.md,
    paddingTop: SPACING.sm,
  },
  infoCard: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginVertical: SPACING.sm,
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
  timerCard: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginVertical: SPACING.sm,
  },
  timerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  timerHeaderText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "500",
  },
  timerControls: {
    alignItems: "center",
  },
  timerDisplay: {
    fontSize: 48,
    fontWeight: "bold",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
    marginBottom: SPACING.md,
    fontFamily: "monospace",
  },
  timerButtons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
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
