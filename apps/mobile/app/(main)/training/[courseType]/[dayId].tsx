import { useCallback, useMemo, useEffect } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { Text, Surface, Snackbar } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";

import { Loading } from "@/shared/components/ui";
import { MarkdownText } from "@/shared/components";
import { AccordionStep } from "@/features/training/components";
import {
  useTrainingDay,
  useStartStep,
  usePauseStep,
  useResumeStep,
  useResetStep,
  useCompleteTheoryStep,
  useCompletePracticeStep,
} from "@/shared/hooks";
import { useTrainingStore, useStepStore, useTimerStore } from "@/shared/stores";
import { COLORS, FONTS, SPACING } from "@/constants";
import { getStepContent, trainingApi } from "@/shared/lib/api";
import { getDayTitle } from "@/shared/lib/training/dayTypes";
import { showPaidCourseAccessDeniedAlert } from "@/shared/lib/utils/alerts";

/**
 * Экран дня тренировки с шагами
 */
export default function TrainingDayScreen() {
  const { courseType, dayId } = useLocalSearchParams<{
    courseType: string;
    dayId: string;
  }>();
  const router = useRouter();

  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [diaryEntries, setDiaryEntries] = useState<
    { id: string; content: string; createdAt: string; dayOnCourseId: string }[]
  >([]);

  // Загрузка данных дня
  const { data, isLoading, error, refetch, isRefetching } = useTrainingDay(courseType, dayId);

  // Stores
  const { getOpenIndex, setOpenIndex } = useTrainingStore();
  const getStepState = useStepStore((s) => s.getStepState);
  const startStep = useStepStore((s) => s.startStep);
  const pauseStep = useStepStore((s) => s.pauseStep);
  const resumeStep = useStepStore((s) => s.resumeStep);
  const completeStep = useStepStore((s) => s.completeStep);
  const initializeStep = useStepStore((s) => s.initializeStep);
  const stopTimer = useTimerStore((s) => s.stopTimer);

  // Mutations
  const startStepMutation = useStartStep();
  const pauseStepMutation = usePauseStep();
  const resumeStepMutation = useResumeStep();
  const resetStepMutation = useResetStep();
  const completeTheoryMutation = useCompleteTheoryStep();
  const completePracticeMutation = useCompletePracticeStep();

  const dayData = data?.data;
  const courseId = dayData?.courseId ?? courseType;

  useEffect(() => {
    if (!courseId || !dayId) return;
    let cancelled = false;
    (async () => {
      const res = await trainingApi.getDiaryEntries(courseId, dayId);
      if (!cancelled && res.success) {
        setDiaryEntries(res.data?.entries ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, dayId]);

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
          const stepData = getStepContent(step);
          const durationSec = stepData.durationSec ?? 300;
          const status = "status" in step ? step.status : "NOT_STARTED";

          if (__DEV__ && index < 3) {
            console.log(`[TrainingDayScreen] Инициализация шага ${index}:`, {
              index,
              hasNestedStep: "step" in step && !!step.step,
              durationSec,
              status,
              stepKeys: Object.keys(step),
            });
          }

          initializeStep(courseId, dayId, index, durationSec, status, {
            serverPaused: status === "PAUSED",
            serverRemainingSec: "remainingSec" in step ? step.remainingSec ?? undefined : undefined,
          });
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
    [courseId, dayId, openIndex, setOpenIndex],
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
    [courseId, dayId, startStep, startStepMutation],
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
    [courseId, dayId, pauseStep, pauseStepMutation],
  );

  const handleResumeStep = useCallback(
    async (stepIndex: number) => {
      try {
        resumeStep(courseId, dayId, stepIndex);
        await resumeStepMutation.mutateAsync({
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
        });
      } catch (error) {
        setSnackbar({ visible: true, message: "Ошибка возобновления" });
      }
    },
    [courseId, dayId, resumeStep, resumeStepMutation],
  );

  const handleResetStep = useCallback(
    async (stepIndex: number, durationSec: number) => {
      try {
        stopTimer();
        await resetStepMutation.mutateAsync({
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
          durationSec,
        });
      } catch (error) {
        setSnackbar({ visible: true, message: "Ошибка сброса шага" });
      }
    },
    [courseId, dayId, resetStepMutation, stopTimer],
  );

  const handleCompleteStep = useCallback(
    async (
      stepIndex: number,
      isTheory: boolean,
      stepTitle?: string,
      stepOrder?: number,
    ) => {
      console.log("[Я выполнил] handleCompleteStep вызван", {
        stepIndex,
        isTheory,
        stepTitle,
        stepOrder,
        courseId,
        dayId,
      });
      try {
        console.log("[Я выполнил] stopTimer, completeStep");
        stopTimer();
        completeStep(courseId, dayId, stepIndex);

        const params = {
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
          stepTitle,
          stepOrder,
        };
        console.log("[Я выполнил] params для API:", params);

        if (isTheory) {
          console.log("[Я выполнил] вызов completeTheoryMutation.mutateAsync");
          await completeTheoryMutation.mutateAsync(params);
        } else {
          console.log("[Я выполнил] вызов completePracticeMutation.mutateAsync");
          await completePracticeMutation.mutateAsync(params);
        }

        console.log("[Я выполнил] mutateAsync успешно, показываем snackbar");
        setSnackbar({ visible: true, message: "Шаг выполнен!" });

        const nextIndex = stepIndex + 1;
        if (dayData?.steps && nextIndex < dayData.steps.length) {
          setOpenIndex(courseId, dayId, nextIndex);
        }
      } catch (error) {
        console.error("[Я выполнил] ошибка в handleCompleteStep:", error);
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
    ],
  );

  const handleSaveDiaryForStep = useCallback(
    async (stepIndex: number, content: string, stepTitle?: string) => {
      const saveRes = await trainingApi.postDiaryEntry(dayId, content);
      if (!saveRes.success) {
        throw new Error(saveRes.error ?? "Не удалось сохранить запись");
      }

      const completeRes = await completeTheoryMutation.mutateAsync({
        courseId,
        dayOnCourseId: dayId,
        stepIndex,
        stepTitle,
        stepOrder: stepIndex,
      });
      if (!completeRes.success) {
        throw new Error(completeRes.error ?? "Не удалось завершить шаг");
      }

      const listRes = await trainingApi.getDiaryEntries(courseId, dayId);
      if (listRes.success) {
        setDiaryEntries(listRes.data?.entries ?? []);
      }
      setSnackbar({ visible: true, message: "Запись сохранена" });
    },
    [dayId, courseId, completeTheoryMutation],
  );

  // Подсчёт прогресса
  const progress = useMemo(() => {
    if (!dayData?.steps || dayData.steps.length === 0) {
      return { completed: 0, total: 0, percent: 0 };
    }

    const total = dayData.steps.length;
    const completed = dayData.steps.filter((s, index) => {
      const localState = getStepState(courseId, dayId, index);
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
    const isForbidden =
      (data && "code" in data && data.code === "FORBIDDEN") ||
      (data && typeof data.error === "string" && data.error.includes("доступ"));
    if (isForbidden) {
      showPaidCourseAccessDeniedAlert(courseType, () => router.back());
    }

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
          const err = data.error as { name?: string; message?: string; issues?: { path: string[]; message: string }[] };
          if (err.name === "ZodError") {
            errorMessage = "Ошибка валидации данных";
            if (err.issues && err.issues.length > 0) {
              errorDetails = err.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join("\n");
            }
          } else if (err.message) {
            errorMessage = String(err.message);
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
        dataErrorName:
          data?.error && typeof data.error === "object" && "name" in data.error
            ? (data.error as any).name
            : null,
        dataErrorIssues:
          data?.error && typeof data.error === "object" && "issues" in data.error
            ? (data.error as any).issues
            : null,
        dataCode: (data as any)?.code,
        dayData: dayData ? { title: dayData.title, stepsCount: dayData.steps?.length } : null,
        finalErrorMessage: errorMessage,
      });
    }

    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
          <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
            <Text style={styles.backText}>Назад</Text>
          </Pressable>
          <View style={styles.errorContainer}>
            <MaterialCommunityIcons name="alert-circle" size={48} color={COLORS.error} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            {errorDetails && <Text style={styles.errorDetails}>{errorDetails}</Text>}
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
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backText}>Назад</Text>
        </Pressable>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        >
          {/* Заголовок дня по типу (как на web Day.tsx) */}
          {dayData && (
            <View style={styles.dayHeader}>
              <Text style={styles.dayTitle}>
                {getDayTitle(dayData.type, dayData.displayDayNumber)}
              </Text>
              <View style={styles.dayHeaderDivider} />
            </View>
          )}

          {/* Прогресс дня */}
          <Surface style={styles.progressCard} elevation={1}>
            <View style={styles.progressHeader}>
              <Text variant="titleMedium">Прогресс</Text>
              <Text variant="titleMedium" style={styles.progressPercent}>
                {progress.percent}%
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
            </View>
            <Text style={styles.progressText}>
              Выполнено {progress.completed} из {progress.total} шагов
            </Text>
          </Surface>

          {/* Описание дня (как в web) */}
          {(dayData?.description && dayData.description.trim() !== "") && (
            <View style={styles.descriptionDayContainer}>
              <Pressable
                onPress={() => setIsDescriptionOpen((o) => !o)}
                style={[
                  styles.descriptionDayHeader,
                  isDescriptionOpen && styles.descriptionDayHeaderExpanded,
                ]}
              >
                <Text style={styles.descriptionDayTitle}>Описание дня</Text>
                <View style={styles.descriptionDayExpand}>
                  <Text style={styles.descriptionDayExpandText}>
                    {isDescriptionOpen ? "Скрыть" : "Подробнее"}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={24}
                    color={COLORS.primary}
                    style={[styles.descriptionDayIcon, isDescriptionOpen && styles.descriptionDayIconExpanded]}
                  />
                </View>
              </Pressable>
              {isDescriptionOpen && (
                <View style={styles.descriptionDayContent}>
                  <MarkdownText text={dayData.description} />
                </View>
              )}
            </View>
          )}

          {/* Список шагов — нумерация как на web: BREAK без номера, остальные «Упражнение #N» */}
          <View style={styles.stepsContainer}>
            {(() => {
              let exerciseCounter = 0;
              return (dayData?.steps ?? []).map((step, index) => {
                try {
                  const stepData = getStepContent(step);
                  const durationSec = stepData.durationSec ?? 300;
                  const stepType = stepData.type ?? "";
                  const stepTitle = stepData.title ?? "";
                  const isBreakStep = stepType === "BREAK";
                  const exerciseNumber = isBreakStep ? undefined : ++exerciseCounter;

                  const stepId = "id" in step ? step.id : stepData.id;
                  const uniqueKey = `${dayId}-${stepData.order ?? index}-${stepId}-${index}`;

                  if (__DEV__) {
                    console.log("[TrainingDayScreen] Рендеринг шага:", {
                      index,
                      uniqueKey,
                      stepType,
                      exerciseNumber,
                      hasStep: !!step,
                      hasStepData: !!stepData,
                    });
                  }

                  return (
                    <AccordionStep
                      key={uniqueKey}
                      step={step}
                      index={index}
                      stepNumber={exerciseNumber}
                    isOpen={openIndex === index}
                    localState={getStepState(courseId, dayId, index)}
                    courseId={courseId}
                    dayOnCourseId={dayId}
                    onToggle={() => {
                      if (__DEV__) {
                        console.log("[TrainingDayScreen] Toggle step:", index);
                      }
                      handleToggleStep(index);
                    }}
                    onStart={() => {
                      if (__DEV__) {
                        console.log("[TrainingDayScreen] Start step:", index, durationSec);
                      }
                      handleStartStep(index, durationSec);
                    }}
                    onPause={(remainingSec) => {
                      if (__DEV__) {
                        console.log("[TrainingDayScreen] Pause step:", index, remainingSec);
                      }
                      handlePauseStep(index, remainingSec);
                    }}
                    onResume={() => {
                      if (__DEV__) {
                        console.log("[TrainingDayScreen] Resume step:", index);
                      }
                      handleResumeStep(index);
                    }}
                    onComplete={() => {
                      console.log("[Я выполнил] onComplete от AccordionStep", {
                        index,
                        stepType,
                        stepTitle,
                      });
                      handleCompleteStep(
                        index,
                        stepType === "THEORY" || stepType === "DIARY",
                        stepTitle,
                        index,
                      );
                    }}
                    onReset={(durationSecReset) => {
                      if (__DEV__) {
                        console.log("[TrainingDayScreen] Reset step:", index, durationSecReset);
                      }
                      handleResetStep(index, durationSecReset);
                    }}
                    diaryEntries={diaryEntries}
                    onSaveDiary={
                      stepType === "THEORY" || stepType === "DIARY" ?
                        async (content) => handleSaveDiaryForStep(index, content, stepTitle)
                      : undefined
                    }
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
                      <Text style={{ color: COLORS.error }}>Ошибка загрузки шага {index + 1}</Text>
                    </View>
                  );
                }
              });
            })()}
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
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: COLORS.primary,
    fontWeight: "500",
  },
  dayHeader: {
    alignSelf: "stretch",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  dayTitle: {
    color: COLORS.border,
    fontFamily: FONTS.impact,
    fontWeight: "400",
    fontSize: 64,
    lineHeight: 72,
    textAlign: "center",
  },
  dayHeaderDivider: {
    alignSelf: "stretch",
    height: 2,
    backgroundColor: COLORS.border,
    borderRadius: 1,
    marginTop: SPACING.sm,
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
  descriptionDayContainer: {
    marginBottom: SPACING.lg,
    width: "100%",
    maxWidth: 500,
  },
  descriptionDayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.md,
    paddingHorizontal: 20,
    backgroundColor: "#ece5d2",
    borderWidth: 1,
    borderColor: "#636128",
    borderRadius: 12,
  },
  descriptionDayHeaderExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  descriptionDayTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#352e2e",
  },
  descriptionDayExpand: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  descriptionDayExpandText: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.primary,
  },
  descriptionDayIcon: {
    transform: [{ rotate: "0deg" }],
  },
  descriptionDayIconExpanded: {
    transform: [{ rotate: "180deg" }],
  },
  descriptionDayContent: {
    backgroundColor: "#ece5d2",
    borderWidth: 1,
    borderColor: "#636128",
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    padding: 20,
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
