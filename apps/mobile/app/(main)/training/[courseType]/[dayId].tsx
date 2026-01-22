import { useCallback, useMemo, useEffect } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { Text, Surface, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";

import { Loading } from "@/shared/components/ui";
import { AccordionStep } from "@/features/training/components";
import {
  useTrainingDay,
  useStartStep,
  usePauseStep,
  useResumeStep,
  useCompleteTheoryStep,
  useCompletePracticeStep,
} from "@/shared/hooks";
import { useTrainingStore, useStepStore, useTimerStore } from "@/shared/stores";
import { COLORS, SPACING } from "@/constants";

/**
 * Экран дня тренировки с шагами
 */
export default function TrainingDayScreen() {
  const { courseType, dayId } = useLocalSearchParams<{
    courseType: string;
    dayId: string;
  }>();

  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

  // Загрузка данных дня
  const { data, isLoading, error, refetch, isRefetching } = useTrainingDay(
    courseType,
    dayId
  );

  // Stores
  const { getOpenIndex, setOpenIndex } = useTrainingStore();
  const { getStepState, startStep, pauseStep, completeStep, initializeStep, resetStep } = useStepStore();
  const { stopTimer } = useTimerStore();

  // Mutations
  const startStepMutation = useStartStep();
  const pauseStepMutation = usePauseStep();
  const resumeStepMutation = useResumeStep();
  const completeTheoryMutation = useCompleteTheoryStep();
  const completePracticeMutation = useCompletePracticeStep();

  const dayData = data?.data;
  const courseId = courseType; // Используем courseType как courseId для ключей

  // Логирование состояния загрузки
  useEffect(() => {
    if (__DEV__) {
      console.log("[TrainingDayScreen] Состояние загрузки:", {
        isLoading,
        isRefetching,
        hasData: !!data,
        hasSuccess: data?.success,
        hasDayData: !!dayData,
        stepsCount: dayData?.steps?.length ?? 0,
        error: error?.message,
        courseType,
        dayId,
      });
    }
  }, [isLoading, isRefetching, data, dayData, error, courseType, dayId]);

  // Инициализация всех шагов при загрузке (как в web-версии)
  useEffect(() => {
    if (dayData?.steps && dayData.steps.length > 0) {
      if (__DEV__) {
        console.log("[TrainingDayScreen] Инициализация шагов:", {
          stepsCount: dayData.steps.length,
          firstStepKeys: Object.keys(dayData.steps[0] || {}),
          firstStep: dayData.steps[0],
        });
      }

      try {
        let initializedCount = 0;
        dayData.steps.forEach((step, index) => {
          // Используем stepIndex из данных, если есть, иначе index или order
          const stepIndex = step.stepIndex ?? step.order ?? index;
          // Проверяем структуру данных: может быть step.step или напрямую step
          const stepData = "step" in step && step.step ? step.step : step;
          const durationSec = stepData.durationSec ?? 300;
          const status = step.status || "NOT_STARTED";

          if (__DEV__ && index < 3) {
            console.log(`[TrainingDayScreen] Инициализация шага ${index}:`, {
              stepIndex,
              hasNestedStep: "step" in step && !!step.step,
              durationSec,
              status,
              stepKeys: Object.keys(step),
            });
          }

          initializeStep(
            courseId,
            dayId,
            stepIndex,
            durationSec,
            status,
            {
              serverPaused: status === "PAUSED",
              serverRemainingSec: step.remainingSec ?? step.remainingSecOnServer ?? undefined,
            }
          );
          initializedCount++;
        });

        if (__DEV__) {
          console.log("[TrainingDayScreen] Инициализировано шагов:", initializedCount);
        }
      } catch (error) {
        if (__DEV__) {
          console.error("[TrainingDayScreen] Ошибка инициализации шагов:", error);
        }
      }
    } else {
      if (__DEV__) {
        console.warn("[TrainingDayScreen] Нет шагов для инициализации:", {
          hasDayData: !!dayData,
          hasSteps: !!dayData?.steps,
          stepsLength: dayData?.steps?.length ?? 0,
        });
      }
    }
  }, [dayData?.steps, courseId, dayId, initializeStep]);

  // Текущий открытый шаг
  const openIndex = getOpenIndex(courseId, dayId) ?? -1;

  // Обработчики
  const handleToggleStep = useCallback(
    (index: number) => {
      setOpenIndex(courseId, dayId, openIndex === index ? null : index);
    },
    [courseId, dayId, openIndex, setOpenIndex]
  );

  const handleStartStep = useCallback(
    async (stepIndex: number, durationSec: number) => {
      try {
        // Локальное обновление
        startStep(courseId, dayId, stepIndex, durationSec);

        // Отправка на сервер
        await startStepMutation.mutateAsync({
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
          status: "IN_PROGRESS",
          durationSec,
        });
      } catch (error) {
        setSnackbar({ visible: true, message: "Ошибка старта шага" });
      }
    },
    [courseId, dayId, startStep, startStepMutation]
  );

  const handlePauseStep = useCallback(
    async (stepIndex: number, remainingSec: number) => {
      try {
        pauseStep(courseId, dayId, stepIndex, remainingSec);

        await pauseStepMutation.mutateAsync({
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
          timeLeftSec: remainingSec,
        });
      } catch (error) {
        setSnackbar({ visible: true, message: "Ошибка паузы" });
      }
    },
    [courseId, dayId, pauseStep, pauseStepMutation]
  );

  const handleResumeStep = useCallback(
    async (stepIndex: number) => {
      try {
        await resumeStepMutation.mutateAsync({
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
        });
      } catch (error) {
        setSnackbar({ visible: true, message: "Ошибка возобновления" });
      }
    },
    [courseId, dayId, resumeStepMutation]
  );

  const handleResetStep = useCallback(
    async (stepIndex: number, durationSec: number) => {
      try {
        // Останавливаем таймер если активен
        stopTimer();

        // Локальное обновление - сбрасываем в NOT_STARTED
        resetStep(courseId, dayId, stepIndex, durationSec);

        // TODO: Отправка на сервер (если нужно)
        // await resetStepMutation.mutateAsync({...});
      } catch (error) {
        setSnackbar({ visible: true, message: "Ошибка сброса шага" });
      }
    },
    [courseId, dayId, resetStep, stopTimer]
  );

  const handleCompleteStep = useCallback(
    async (stepIndex: number, isTheory: boolean, stepTitle?: string) => {
      try {
        // Останавливаем таймер если активен
        stopTimer();

        // Локальное обновление
        completeStep(courseId, dayId, stepIndex);

        // Отправка на сервер
        const params = {
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
          stepTitle,
        };

        if (isTheory) {
          await completeTheoryMutation.mutateAsync(params);
        } else {
          await completePracticeMutation.mutateAsync(params);
        }

        setSnackbar({ visible: true, message: "Шаг выполнен!" });

        // Автоматически открываем следующий шаг
        const nextIndex = stepIndex + 1;
        if (dayData?.steps && nextIndex < dayData.steps.length) {
          setOpenIndex(courseId, dayId, nextIndex);
        }
      } catch (error) {
        setSnackbar({ visible: true, message: "Ошибка сохранения" });
      }
    },
    [
      courseId,
      dayId,
      stopTimer,
      completeStep,
      completeTheoryMutation,
      completePracticeMutation,
      dayData?.steps,
      setOpenIndex,
    ]
  );

  // Подсчёт прогресса
  const progress = useMemo(() => {
    if (!dayData?.steps || dayData.steps.length === 0) {
      return { completed: 0, total: 0, percent: 0 };
    }

    const total = dayData.steps.length;
    const completed = dayData.steps.filter((s, index) => {
      // Используем stepIndex из данных, если есть, иначе index или order
      const stepIndex = s.stepIndex ?? s.order ?? index;
      const localState = getStepState(courseId, dayId, stepIndex);
      return (localState?.status || s.status) === "COMPLETED";
    }).length;

    return {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [dayData?.steps, courseId, dayId, getStepState]);

  if (isLoading) {
    if (__DEV__) {
      console.log("[TrainingDayScreen] Показываем загрузку");
    }
    return <Loading fullScreen message="Загрузка шагов..." />;
  }

  if (error || !data?.success) {
    // Формируем понятное сообщение об ошибке
    let errorMessage = "Ошибка загрузки дня";
    let errorDetails: string | null = null;

    if (error instanceof Error) {
      errorMessage = error.message || errorMessage;
      errorDetails = error.stack || null;
    } else if (data && !data.success) {
      if (data.error) {
        // Обрабатываем ZodError
        if (typeof data.error === "object" && data.error !== null) {
          if ("name" in data.error && data.error.name === "ZodError") {
            errorMessage = "Ошибка валидации данных";
            const zodError = data.error as { issues?: Array<{ path: string[]; message: string }> };
            if (zodError.issues && zodError.issues.length > 0) {
              errorDetails = zodError.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join("\n");
            }
          } else if ("message" in data.error) {
            errorMessage = String(data.error.message);
          } else {
            errorMessage = "Ошибка сервера";
            errorDetails = JSON.stringify(data.error, null, 2);
          }
        } else if (typeof data.error === "string") {
          errorMessage = data.error;
        }
      } else if ((data as any).code) {
        errorMessage = `Ошибка: ${(data as any).code}`;
      }
    }

    if (__DEV__) {
      console.error("[TrainingDayScreen] Ошибка отображения:", {
        hasError: !!error,
        errorMessage: error?.message,
        errorStack: error instanceof Error ? error.stack : undefined,
        hasData: !!data,
        dataSuccess: data?.success,
        dataErrorType: data?.error ? typeof data.error : null,
        dataErrorName: data?.error && typeof data.error === "object" && "name" in data.error ? (data.error as any).name : null,
        dataErrorIssues: data?.error && typeof data.error === "object" && "issues" in data.error ? (data.error as any).issues : null,
        dataCode: (data as any)?.code,
        dayData: dayData ? { title: dayData.title, stepsCount: dayData.steps?.length } : null,
        finalErrorMessage: errorMessage,
      });
    }

    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "День тренировки",
          }}
        />
        <SafeAreaView style={styles.container}>
          <View style={styles.errorContainer}>
            <MaterialCommunityIcons name="alert-circle" size={48} color={COLORS.error} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            {errorDetails && (
              <Text style={styles.errorDetails}>{errorDetails}</Text>
            )}
            {__DEV__ && (
              <Text style={styles.errorDetails}>
                {`courseType: ${courseType}\ndayId: ${dayId}`}
              </Text>
            )}
            <Pressable
              onPress={() => {
                if (__DEV__) {
                  console.log("[TrainingDayScreen] Повторная загрузка");
                }
                refetch();
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Попробовать снова</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Отладочное логирование (убрано для предотвращения бесконечных логов)
  // if (__DEV__) {
  //   console.log("[TrainingDayScreen] Рендеринг контента:", {
  //     hasDayData: !!dayData,
  //     title: dayData?.title,
  //     stepsCount: dayData?.steps?.length ?? 0,
  //     progress: progress.percent,
  //   });
  // }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: dayData?.title || "День тренировки",
        }}
      />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
          }
        >
          {/* Прогресс дня */}
          <Surface style={styles.progressCard} elevation={1}>
            <View style={styles.progressHeader}>
              <Text variant="titleMedium">Прогресс</Text>
              <Text variant="titleMedium" style={styles.progressPercent}>
                {progress.percent}%
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${progress.percent}%` }]}
              />
            </View>
            <Text style={styles.progressText}>
              Выполнено {progress.completed} из {progress.total} шагов
            </Text>
          </Surface>

          {/* Список шагов */}
          <View style={styles.stepsContainer}>
            {dayData?.steps.map((step, index) => {
              try {
                // Используем stepIndex из данных, если есть, иначе index или order
                const stepIndex = step.stepIndex ?? step.order ?? index;
                // Проверяем структуру данных: может быть step.step или напрямую step
                const stepData = "step" in step && step.step ? step.step : step;
                const durationSec = stepData.durationSec ?? 300;
                const stepType = stepData.type || step.type;
                const stepTitle = stepData.title || step.title;
                
                // Уникальный ключ: комбинация dayId, order и index для гарантии уникальности
                const uniqueKey = `${dayId}-${step.order ?? index}-${step.id || index}`;
                
                if (__DEV__) {
                  console.log("[TrainingDayScreen] Рендеринг шага:", {
                    index,
                    stepIndex,
                    uniqueKey,
                    stepType,
                    hasStep: !!step,
                    hasStepData: !!stepData,
                  });
                }
                
                return (
                  <AccordionStep
                    key={uniqueKey}
                    step={step}
                    index={stepIndex}
                    isOpen={openIndex === stepIndex}
                    localState={getStepState(courseId, dayId, stepIndex)}
                    courseId={courseId}
                    dayOnCourseId={dayId}
                    onToggle={() => {
                      if (__DEV__) {
                        console.log("[TrainingDayScreen] Toggle step:", stepIndex);
                      }
                      handleToggleStep(stepIndex);
                    }}
                    onStart={() => {
                      if (__DEV__) {
                        console.log("[TrainingDayScreen] Start step:", stepIndex, durationSec);
                      }
                      handleStartStep(stepIndex, durationSec);
                    }}
                    onPause={(remainingSec) => {
                      if (__DEV__) {
                        console.log("[TrainingDayScreen] Pause step:", stepIndex, remainingSec);
                      }
                      handlePauseStep(stepIndex, remainingSec);
                    }}
                    onResume={() => {
                      if (__DEV__) {
                        console.log("[TrainingDayScreen] Resume step:", stepIndex);
                      }
                      handleResumeStep(stepIndex);
                    }}
                    onComplete={() => {
                      if (__DEV__) {
                        console.log("[TrainingDayScreen] Complete step:", stepIndex);
                      }
                      handleCompleteStep(
                        stepIndex,
                        stepType === "THEORY",
                        stepTitle
                      );
                    }}
                    onReset={(durationSec) => {
                      if (__DEV__) {
                        console.log("[TrainingDayScreen] Reset step:", stepIndex, durationSec);
                      }
                      handleResetStep(stepIndex, durationSec);
                    }}
                  />
                );
              } catch (error) {
                if (__DEV__) {
                  console.error("[TrainingDayScreen] Ошибка при рендеринге шага:", error, {
                    index,
                    hasStep: !!step,
                  });
                }
                return (
                  <View key={`error-${index}`} style={{ padding: SPACING.md }}>
                    <Text style={{ color: COLORS.error }}>
                      Ошибка загрузки шага {index + 1}
                    </Text>
                  </View>
                );
              }
            })}
          </View>
        </ScrollView>

        {/* Snackbar */}
        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ visible: false, message: "" })}
          duration={2000}
        >
          {snackbar.message}
        </Snackbar>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  progressCard: {
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  progressPercent: {
    color: COLORS.primary,
    fontWeight: "bold",
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: SPACING.sm,
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  stepsContainer: {
    gap: SPACING.sm,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  errorText: {
    color: COLORS.error,
    marginTop: SPACING.md,
    textAlign: "center",
  },
  errorDetails: {
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    fontSize: 12,
    textAlign: "center",
  },
  retryButton: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
