import { useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Text, Surface, Snackbar, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { WebView } from "react-native-webview";

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
import { getStepContent, paymentsApi, trainingApi } from "@/shared/lib/api";
import { getDayTitle } from "@/shared/lib/training/dayTypes";
import { WEB_BASE } from "@/shared/lib/utils/alerts";
import { isPaymentSuccessReturnUrl } from "@/shared/lib/payments/returnUrl";

/**
 * Экран дня тренировки с шагами
 */
export default function TrainingDayScreen() {
  const theme = useTheme();
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
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [isPaymentChecking, setIsPaymentChecking] = useState(false);
  const hasHandledPaymentReturnRef = useRef(false);

  // Загрузка данных дня
  const { data, isLoading, error, refetch, isRefetching } = useTrainingDay(courseType, dayId);

  const isForbidden =
    (data && "code" in data && data.code === "FORBIDDEN") ||
    (data && typeof data.error === "string" && data.error.includes("доступ"));

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
      if (cancelled) return;
      if (res.success) {
        setDiaryEntries(res.data?.entries ?? []);
      } else {
        setDiaryEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, dayId]);

  // Инициализация всех шагов при загрузке (как в web-версии)
  useEffect(() => {
    if (dayData?.steps && dayData.steps.length > 0) {
      try {
        dayData.steps.forEach((step, index) => {
          const stepData = getStepContent(step);
          const durationSec = stepData.durationSec ?? 300;
          const status = "status" in step ? step.status : "NOT_STARTED";
          initializeStep(courseId, dayId, index, durationSec, status, {
            serverPaused: status === "PAUSED",
            serverRemainingSec: "remainingSec" in step ? step.remainingSec ?? undefined : undefined,
          });
        });
      } catch (err) {
        if (__DEV__) {
          console.error("[TrainingDayScreen] Ошибка инициализации шагов:", err);
        }
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
        const activeTimer = useTimerStore.getState().activeTimer;
        if (activeTimer?.isRunning) {
          const isOtherStep =
            activeTimer.courseId !== courseId ||
            activeTimer.dayOnCourseId !== dayId ||
            activeTimer.stepIndex !== stepIndex;
          if (isOtherStep) {
            setSnackbar({ visible: true, message: "Сначала остановите текущий шаг" });
            return;
          }
        }

        const currentStepState = getStepState(courseId, dayId, stepIndex);
        if (currentStepState?.status === "IN_PROGRESS") {
          return;
        }

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
    [courseId, dayId, getStepState, startStep, startStepMutation],
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
        stopTimer(courseId, dayId, stepIndex);
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
        stopTimer(courseId, dayId, stepIndex);
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

  const pollAccessAfterPayment = useCallback(async () => {
    setIsPaymentChecking(true);
    await refetch();
    const delays = [2000, 3000, 5000];
    for (const delayMs of delays) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const next = await refetch();
      if (next.data?.success) {
        setSnackbar({ visible: true, message: "Оплата подтверждена. Доступ открыт." });
        setIsPaymentChecking(false);
        return;
      }
    }
    setSnackbar({
      visible: true,
      message: "Оплата обрабатывается. Обновите экран через несколько секунд.",
    });
    setIsPaymentChecking(false);
  }, [refetch]);

  const handleCreatePayment = useCallback(async () => {
    if (isCreatingPayment) return;
    if (!courseId) {
      setSnackbar({ visible: true, message: "Данные курса не загружены. Обновите экран." });
      return;
    }
    setIsCreatingPayment(true);

    const response = await paymentsApi.createPayment({ courseId });
    if (!response.success || !response.data?.confirmationUrl) {
      const messageByCode: Record<string, string> = {
        RATE_LIMIT: "Слишком много попыток. Повторите через минуту.",
        NETWORK_ERROR: "Нет подключения к интернету.",
        CONFIG: "Платежи временно недоступны.",
        NOT_FOUND: "Курс не найден.",
      };
      const fallback = response.error ?? "Не удалось создать платёж";
      setSnackbar({
        visible: true,
        message: response.code ? (messageByCode[response.code] ?? fallback) : fallback,
      });
      setIsCreatingPayment(false);
      return;
    }

    hasHandledPaymentReturnRef.current = false;
    setPaymentUrl(response.data.confirmationUrl);
    setIsCreatingPayment(false);
  }, [courseId, isCreatingPayment]);

  const handleClosePaymentWebView = useCallback(
    async (isReturnUrl: boolean) => {
      setPaymentUrl(null);
      if (isReturnUrl) {
        await pollAccessAfterPayment();
      } else {
        await refetch();
      }
    },
    [pollAccessAfterPayment, refetch],
  );

  const handlePaymentNavigation = useCallback(
    async (url?: string) => {
      if (!url || hasHandledPaymentReturnRef.current) return;
      const expectedHost = new URL(WEB_BASE).host;
      if (!isPaymentSuccessReturnUrl(url, expectedHost)) return;
      hasHandledPaymentReturnRef.current = true;
      await handleClosePaymentWebView(true);
    },
    [handleClosePaymentWebView],
  );

  useEffect(() => {
    if (!isForbidden) return;
    router.replace(`/training/${courseType}`);
  }, [courseType, isForbidden, router]);

  if (isLoading) {
    return <Loading fullScreen message="Загрузка шагов..." />;
  }

  if (error || !data?.success) {
    if (isForbidden) {
      return (
        <>
          <Stack.Screen options={{ headerShown: false }} />
          <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
            <Loading fullScreen message="Переход к оплате..." />
            <Snackbar
              visible={snackbar.visible}
              onDismiss={() => setSnackbar({ visible: false, message: "" })}
              duration={2000}
            >
              {snackbar.message}
            </Snackbar>
            {paymentUrl && (
              <View style={styles.webViewOverlay}>
                <View style={styles.webViewHeader}>
                  <Pressable onPress={() => void handleClosePaymentWebView(false)}>
                    <Text style={styles.webViewCloseText}>Закрыть</Text>
                  </Pressable>
                  {isPaymentChecking && <ActivityIndicator color={COLORS.primary} />}
                </View>
                <WebView
                  source={{ uri: paymentUrl }}
                  onNavigationStateChange={(state) => {
                    void handlePaymentNavigation(state.url);
                  }}
                  onLoadEnd={(event) => {
                    void handlePaymentNavigation(event.nativeEvent.url);
                  }}
                  startInLoadingState={true}
                />
              </View>
            )}
          </SafeAreaView>
        </>
      );
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
              onPress={() => refetch()}
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
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
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

          {/* Прогресс дня — цвета из темы (светлая/тёмная) */}
          <Surface style={styles.progressCard} elevation={1}>
            <View style={styles.progressHeader}>
              <Text variant="titleMedium">Прогресс</Text>
              <Text variant="titleMedium" style={[styles.progressPercent, { color: theme.colors.primary }]}>
                {progress.percent}%
              </Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: theme.colors.surfaceVariant }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress.percent}%`, backgroundColor: theme.colors.primary },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: theme.colors.onSurfaceVariant }]}>
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
                    onToggle={() => handleToggleStep(index)}
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
                    onComplete={() =>
                      handleCompleteStep(
                        index,
                        stepType === "THEORY" || stepType === "DIARY",
                        stepTitle,
                        index,
                      )
                    }
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
        {paymentUrl && (
          <View style={styles.webViewOverlay}>
            <View style={styles.webViewHeader}>
              <Pressable onPress={() => void handleClosePaymentWebView(false)}>
                <Text style={styles.webViewCloseText}>Закрыть</Text>
              </Pressable>
              {isPaymentChecking && <ActivityIndicator color={COLORS.primary} />}
            </View>
            <WebView
              source={{ uri: paymentUrl }}
              onNavigationStateChange={(state) => {
                void handlePaymentNavigation(state.url);
              }}
              onLoadEnd={(event) => {
                void handlePaymentNavigation(event.nativeEvent.url);
              }}
              startInLoadingState={true}
            />
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
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
    fontWeight: "bold",
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: SPACING.sm,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
  },
  webViewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.surface,
  },
  webViewHeader: {
    height: 52,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  webViewCloseText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
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
