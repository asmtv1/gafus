import { useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Linking,
  Platform,
} from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WebView } from "react-native-webview";
import { Loading, MascotSpinner } from "@/shared/components/ui";
import { MarkdownText } from "@/shared/components";
import { AccordionStep } from "@/features/training";
import {
  useTrainingDay,
  useStartStep,
  usePauseStep,
  useResumeStep,
  useResetStep,
  useCompleteTheoryStep,
  useCompletePracticeStep,
} from "@/shared/hooks";
import { useDayStepStatuses, useTrainingStore, useStepStore, useTimerStore } from "@/shared/stores";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import { getStepContent, paymentsApi, trainingApi } from "@/shared/lib/api";
import type { DiaryEntry } from "@/shared/lib/api/training";
import { getDayTitle } from "@/shared/lib/training/dayTypes";
import { WEB_BASE } from "@/shared/lib/utils/alerts";
import { runAppleCourseIapPurchase } from "@/shared/lib/payments/appleCourseIapPurchase";
import { isPaymentSuccessReturnUrl } from "@/shared/lib/payments/returnUrl";
import { reportClientError } from "@/shared/lib/tracer";
import { trackEvent } from "@/shared/lib/analytics";
import { useIsOffline } from "@/shared/hooks/useNetworkStatus";
import {
  getRewardedAccessPrompt,
  openAppSubscriptionPaywall,
  RewardedAccessGate,
} from "@/features/app-subscription";
import { openTargetWithRewardedAd, rewardedAdsApi } from "@/features/rewarded-ads";

/**
 * Экран дня тренировки с шагами
 */
export default function TrainingDayScreen() {
  const { courseType, dayId } = useLocalSearchParams<{
    courseType: string;
    dayId: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [isPaymentChecking, setIsPaymentChecking] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [unlockingStepIndex, setUnlockingStepIndex] = useState<number | null>(null);
  const [stepAccessError, setStepAccessError] = useState<string | null>(null);
  const rewardedUnlockInFlightRef = useRef(false);
  const hasHandledPaymentReturnRef = useRef(false);
  const recoveredCompletedStepsRef = useRef<Set<string>>(new Set());
  /** Инкремент при сохранении дневника: отбрасываем устаревший ответ GET, пришедший после локального обновления. */
  const diaryListFetchGenerationRef = useRef(0);
  const isOffline = useIsOffline();

  // Загрузка данных дня
  const { data, isLoading, error, refetch, isRefetching } = useTrainingDay(courseType, dayId);

  const isForbidden =
    (data && "code" in data && data.code === "FORBIDDEN") ||
    (data && typeof data.error === "string" && data.error.includes("доступ"));
  const isPersonalizationRequired =
    data != null && "code" in data && data.code === "PERSONALIZATION_REQUIRED";

  // Stores
  /** Нельзя брать только getOpenIndex/setOpenIndex через shallow — функции стабильны, подписки на openIndexes нет */
  const setOpenIndex = useTrainingStore((s) => s.setOpenIndex);
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
  const localStepStatuses = useDayStepStatuses(courseId, dayId, dayData?.steps?.length ?? 0);

  const openIndexRaw = useTrainingStore((s) => {
    if (!courseId || !dayId) return null;
    const key = s.getDayKey(courseId, dayId);
    return s.openIndexes[key] ?? null;
  });
  const openIndex = openIndexRaw ?? -1;
  const activeLockedStep =
    openIndex >= 0 &&
    dayData?.steps?.[openIndex]?.locked &&
    dayData.steps[openIndex].monetizationTarget
      ? dayData.steps[openIndex]
      : null;
  const activeRewardedTarget = activeLockedStep?.monetizationTarget ?? null;
  const rewardedStatusQuery = useQuery({
    queryKey: [
      "rewarded-ads",
      "status",
      activeRewardedTarget?.targetType ?? null,
      activeRewardedTarget?.targetId ?? null,
    ],
    queryFn: () => rewardedAdsApi.getStatus(activeRewardedTarget!),
    enabled: Boolean(activeRewardedTarget),
    staleTime: 30_000,
  });
  const rewardedStatus =
    rewardedStatusQuery.data?.success && rewardedStatusQuery.data.data
      ? rewardedStatusQuery.data.data
      : null;
  const rewardedPrompt = getRewardedAccessPrompt({
    isLoading: rewardedStatusQuery.isFetching,
    status: rewardedStatus,
  });
  const loadingRewardedPrompt = getRewardedAccessPrompt({
    isLoading: true,
    status: null,
  });

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    const genAtStart = diaryListFetchGenerationRef.current;
    (async () => {
      /** Без upToDayOnCourseId — как web useStepDiary: полный список по курсу, без риска обрезать день. */
      const res = await trainingApi.getDiaryEntries(courseId);
      if (cancelled) return;
      if (diaryListFetchGenerationRef.current !== genAtStart) return;
      if (res.success) {
        const raw = res.data?.entries ?? [];
        setDiaryEntries(raw.map((e) => ({ ...e })));
      } else {
        setDiaryEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

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
            serverRemainingSec:
              "remainingSec" in step ? (step.remainingSec ?? undefined) : undefined,
          });
        });
      } catch (err) {
        reportClientError(err instanceof Error ? err : new Error(String(err)), {
          issueKey: "TrainingDay",
          keys: { operation: "init_steps", dayId, courseId },
        });
      }
    }
  }, [dayData?.steps, courseId, dayId, initializeStep]);

  useEffect(() => {
    if (isOffline || !dayData?.steps?.length || !courseId || !dayId) return;

    let cancelled = false;
    const recoverCompletedSteps = async () => {
      let recoveredAny = false;

      for (let index = 0; index < dayData.steps.length; index += 1) {
        const serverStep = dayData.steps[index];
        const serverStatus = "status" in serverStep ? serverStep.status : "NOT_STARTED";
        if (serverStatus === "COMPLETED") continue;

        const localState = useStepStore.getState().getStepState(courseId, dayId, index);
        if (localState?.status !== "COMPLETED") continue;

        const recoveryKey = `${courseId}:${dayId}:${index}`;
        if (recoveredCompletedStepsRef.current.has(recoveryKey)) continue;
        recoveredCompletedStepsRef.current.add(recoveryKey);

        const stepData = getStepContent(serverStep);
        const params = {
          courseId,
          dayOnCourseId: dayId,
          stepIndex: index,
          stepTitle: stepData.title,
          stepOrder: stepData.order,
        };

        const response =
          stepData.type === "THEORY" || stepData.type === "DIARY"
            ? await trainingApi.completeTheoryStep(params)
            : await trainingApi.completePracticeStep(params);

        if (!response.success) {
          recoveredCompletedStepsRef.current.delete(recoveryKey);
          reportClientError(new Error(response.error ?? "Не удалось восстановить прогресс шага"), {
            issueKey: "TrainingDay",
            keys: {
              operation: "recover_completed_step",
              courseId,
              dayId,
              stepIndex: String(index),
              code: response.code ?? "",
            },
          });
          continue;
        }

        recoveredAny = true;
      }

      if (recoveredAny && !cancelled) {
        void refetch();
      }
    };

    void recoverCompletedSteps();

    return () => {
      cancelled = true;
    };
  }, [courseId, dayData?.steps, dayId, isOffline, refetch]);

  // Обработчики
  const unlockStepWithRewardedAd = useCallback(
    async (index: number) => {
      if (rewardedUnlockInFlightRef.current) return;
      const target = dayData?.steps?.[index]?.monetizationTarget;
      if (!target || target.targetType !== "COURSE_STEP") return;

      rewardedUnlockInFlightRef.current = true;
      setStepAccessError(null);
      setUnlockingStepIndex(index);
      try {
        const result = await openTargetWithRewardedAd(target);
        if (!result.success) {
          setStepAccessError(result.message);
          setSnackbar({ visible: true, message: result.message });
          return;
        }
        if (result.data) {
          trackEvent({
            eventName: "rewarded_access_granted",
            platform: "mobile",
            pathOrScreen: `/training/${courseType}/${dayId}`,
            targetType: result.data.targetType,
            targetId: result.data.targetId,
            expiresAt: result.data.expiresAt,
            provider: "YANDEX",
          });
        }
        await Promise.all([refetch(), rewardedStatusQuery.refetch()]);
        setOpenIndex(courseId, dayId, index);
      } catch (error) {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TrainingDay",
          keys: {
            operation: "open_step_with_rewarded_ad",
            dayId,
            courseId,
            stepIndex: String(index),
          },
        });
        const message = "Ошибка сервиса Гафус. Попробуйте ещё раз или обратитесь к администрации";
        setStepAccessError(message);
        setSnackbar({ visible: true, message });
      } finally {
        rewardedUnlockInFlightRef.current = false;
        setUnlockingStepIndex(null);
      }
    },
    [courseId, courseType, dayData?.steps, dayId, refetch, rewardedStatusQuery, setOpenIndex],
  );

  const handleToggleStep = useCallback(
    (index: number) => {
      const step = dayData?.steps?.[index];
      if (step?.locked && step.monetizationTarget) {
        setStepAccessError(null);
        setOpenIndex(courseId, dayId, openIndex === index ? null : index);
        return;
      }
      setOpenIndex(courseId, dayId, openIndex === index ? null : index);
    },
    [courseId, dayData?.steps, dayId, openIndex, setOpenIndex],
  );

  const handleSubscriptionPaywall = useCallback(() => {
    openAppSubscriptionPaywall({ reason: "required", contentMode: "subscription" });
  }, []);

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
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TrainingDay",
          keys: { operation: "start", dayId, courseId },
        });
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
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TrainingDay",
          keys: { operation: "pause", dayId, courseId },
        });
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
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TrainingDay",
          keys: { operation: "resume", dayId, courseId },
        });
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
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TrainingDay",
          keys: { operation: "reset", dayId, courseId },
        });
        setSnackbar({ visible: true, message: "Ошибка сброса шага" });
      }
    },
    [courseId, dayId, resetStepMutation, stopTimer],
  );

  const handleCompleteStep = useCallback(
    async (stepIndex: number, isTheory: boolean, stepTitle?: string, stepOrder?: number) => {
      try {
        stopTimer(courseId, dayId, stepIndex);
        completeStep(courseId, dayId, stepIndex);

        const params = {
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
          stepTitle,
          stepOrder,
        };

        const result = isTheory
          ? await completeTheoryMutation.mutateAsync(params)
          : await completePracticeMutation.mutateAsync(params);

        if (!result.success) {
          throw new Error(result.error ?? "Не удалось сохранить прогресс");
        }

        setSnackbar({ visible: true, message: "Шаг выполнен!" });

        const nextIndex = stepIndex + 1;
        if (dayData?.steps && nextIndex < dayData.steps.length) {
          setOpenIndex(courseId, dayId, nextIndex);
        }
      } catch (error) {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TrainingDay",
          keys: { operation: "complete", dayId, courseId },
        });
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
      diaryListFetchGenerationRef.current += 1;
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

      const listRes = await trainingApi.getDiaryEntries(courseId);
      if (listRes.success) {
        const raw = listRes.data?.entries ?? [];
        setDiaryEntries(raw.map((e) => ({ ...e })));
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
      return (localStepStatuses[index] ?? s.status) === "COMPLETED";
    }).length;

    return {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [dayData?.steps, localStepStatuses]);

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

  const _handleCreatePayment = useCallback(async () => {
    if (isCreatingPayment) return;
    if (!courseType) {
      setSnackbar({ visible: true, message: "Данные курса не загружены. Обновите экран." });
      return;
    }
    setIsCreatingPayment(true);

    if (Platform.OS === "ios") {
      const iapResult = await runAppleCourseIapPurchase(
        dayData?.courseId ? { courseId: dayData.courseId } : { courseType },
      );
      if (!iapResult.ok) {
        if (!iapResult.userCancelled) {
          setSnackbar({ visible: true, message: iapResult.message });
        }
        setIsCreatingPayment(false);
        return;
      }
      setIsCreatingPayment(false);
      await pollAccessAfterPayment();
      return;
    }

    const payParams = dayData?.courseId ? { courseId: dayData.courseId } : { courseType };
    const response = await paymentsApi.createPayment(payParams);
    if (!response.success || !response.data?.confirmationUrl) {
      const messageByCode: Record<string, string> = {
        RATE_LIMIT: "Слишком много попыток. Повторите через минуту.",
        NETWORK_ERROR: "Нет подключения к интернету.",
        CONFIG: "Платежи временно недоступны.",
        CONFIG_WEB_APP_URL: "Платежи временно недоступны (конфиг WEB_APP_URL).",
        CONFIG_YOOKASSA: "Платежи временно недоступны (конфиг YooKassa).",
        NOT_FOUND: "Курс не найден.",
        APPLE_IAP_REQUIRED: "На этом устройстве оплата курса только через App Store.",
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
  }, [courseType, dayData?.courseId, isCreatingPayment, pollAccessAfterPayment]);

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

  useEffect(() => {
    if (!isPersonalizationRequired) return;
    router.replace(`/training/${courseType}?personalize=1`);
  }, [courseType, isPersonalizationRequired, router]);

  if (isLoading) {
    return <Loading fullScreen message="Загрузка шагов..." />;
  }

  if (error || !data?.success) {
    if (isPersonalizationRequired) {
      return (
        <>
          <Stack.Screen options={{ headerShown: false }} />
          <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
            <Loading fullScreen message="Переход к персонализации..." />
          </SafeAreaView>
        </>
      );
    }

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
                <View style={[styles.webViewHeader, { paddingTop: insets.top }]}>
                  <Pressable
                    hitSlop={12}
                    onPress={() => {
                      void hapticFeedback.light();
                      void handleClosePaymentWebView(false);
                    }}
                  >
                    <Text style={styles.webViewCloseText}>Закрыть</Text>
                  </Pressable>
                  {isPaymentChecking && <MascotSpinner size="small" />}
                </View>
                <WebView
                  source={{ uri: paymentUrl }}
                  style={styles.webViewFlex}
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
          const err = data.error as {
            name?: string;
            message?: string;
            issues?: { path: string[]; message: string }[];
          };
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
      } else if (data && "code" in data && typeof data.code === "string") {
        errorMessage = `Ошибка: ${data.code}`;
      }
    }

    const debugDataError = data?.error;
    const debugDataCode = data && "code" in data ? data.code : undefined;

    if (__DEV__) {
      console.error("[TrainingDayScreen] Ошибка отображения:", {
        hasError: !!error,
        errorMessage: error?.message,
        errorStack: error instanceof Error ? error.stack : undefined,
        hasData: !!data,
        dataSuccess: data?.success,
        dataErrorType: data?.error ? typeof data.error : null,
        dataErrorName:
          debugDataError && typeof debugDataError === "object" && "name" in debugDataError
            ? (debugDataError as { name?: unknown }).name
            : null,
        dataErrorIssues:
          debugDataError && typeof debugDataError === "object" && "issues" in debugDataError
            ? (debugDataError as { issues?: unknown }).issues
            : null,
        dataCode: debugDataCode,
        dayData: dayData ? { title: dayData.title, stepsCount: dayData.steps?.length } : null,
        finalErrorMessage: errorMessage,
      });
    }

    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
          <Pressable
            style={styles.backRow}
            onPress={() => {
              void hapticFeedback.light();
              router.back();
            }}
            hitSlop={12}
          >
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
                void hapticFeedback.light();
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
          nestedScrollEnabled
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

          {/* Прогресс дня — всегда в фирменной палитре, независимо от темы телефона */}
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>Прогресс</Text>
              <Text style={styles.progressPercent}>{progress.percent}%</Text>
            </View>
            <View
              style={styles.progressBar}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Прогресс дня"
              accessibilityValue={{ min: 0, max: 100, now: progress.percent }}
            >
              <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
            </View>
            <Text style={styles.progressText}>
              Выполнено {progress.completed} из {progress.total} шагов
            </Text>
          </View>

          {/* Описание дня (как в web) */}
          {dayData?.description && dayData.description.trim() !== "" && (
            <View style={styles.descriptionDayContainer}>
              <Pressable
                onPress={() => setIsDescriptionOpen((o) => !o)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  isDescriptionOpen ? "Скрыть описание дня" : "Подробнее описание дня"
                }
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
                    style={[
                      styles.descriptionDayIcon,
                      isDescriptionOpen && styles.descriptionDayIconExpanded,
                    ]}
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

          {/* Кнопка экспорта «Ваш путь» — только для дня типа summary с включённой опцией, только онлайн */}
          {dayData?.type === "summary" && dayData?.showCoursePathExport === true && (
            <View style={styles.exportPathBlock}>
              <Pressable
                style={[
                  styles.exportPathButton,
                  (isOffline || isExporting) && styles.exportPathButtonDisabled,
                ]}
                onPress={async () => {
                  void hapticFeedback.light();
                  if (isOffline) {
                    setSnackbar({
                      visible: true,
                      message: "Сгенерировать PDF можно только при наличии сети",
                    });
                    return;
                  }
                  setIsExporting(true);
                  try {
                    const url = `${WEB_BASE}/api/course-path-export?courseId=${encodeURIComponent(courseId)}`;
                    const canOpen = await Linking.canOpenURL(url);
                    if (canOpen) {
                      await Linking.openURL(url);
                    } else {
                      setSnackbar({ visible: true, message: "Не удалось открыть ссылку" });
                    }
                  } catch (err) {
                    reportClientError(err instanceof Error ? err : new Error(String(err)), {
                      issueKey: "TrainingDay",
                      keys: { operation: "export", dayId, courseId },
                    });
                    setSnackbar({ visible: true, message: "Ошибка при экспорте" });
                  } finally {
                    setIsExporting(false);
                  }
                }}
                disabled={isOffline || isExporting}
              >
                {isExporting ? (
                  <MascotSpinner size="small" />
                ) : (
                  <MaterialCommunityIcons name="file-download-outline" size={22} color="#fff" />
                )}
                <Text style={styles.exportPathButtonText}>
                  {isExporting ? "Экспорт…" : "Экспортировать «Ваш путь»"}
                </Text>
              </Pressable>
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
                  const isLockedRewardedStep = Boolean(step.locked && step.monetizationTarget);

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
                        void handleStartStep(index, durationSec);
                      }}
                      onPause={(remainingSec) => {
                        void handlePauseStep(index, remainingSec);
                      }}
                      onResume={() => {
                        void handleResumeStep(index);
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
                        void handleResetStep(index, durationSecReset);
                      }}
                      diaryEntries={diaryEntries}
                      onSaveDiary={stepType === "DIARY" ? handleSaveDiaryForStep : undefined}
                      accessGate={
                        isLockedRewardedStep ? (
                          <RewardedAccessGate
                            title="Продолжить обучение"
                            subtitle="С подпиской будет доступно всё!"
                            prompt={openIndex === index ? rewardedPrompt : loadingRewardedPrompt}
                            errorText={openIndex === index ? stepAccessError : null}
                            isBusy={unlockingStepIndex === index}
                            onPrimaryPress={() => void unlockStepWithRewardedAd(index)}
                            onSubscriptionPress={handleSubscriptionPaywall}
                          />
                        ) : undefined
                      }
                    />
                  );
                } catch (error) {
                  reportClientError(error instanceof Error ? error : new Error(String(error)), {
                    issueKey: "TrainingDay",
                    keys: { operation: "render_step", index, dayId, courseId },
                  });
                  return (
                    <View key={`error-${index}`} style={styles.stepErrorContainer}>
                      <Text style={styles.stepErrorText}>Ошибка загрузки шага {index + 1}</Text>
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
            <View style={[styles.webViewHeader, { paddingTop: insets.top }]}>
              <Pressable
                hitSlop={12}
                onPress={() => {
                  void hapticFeedback.light();
                  void handleClosePaymentWebView(false);
                }}
              >
                <Text style={styles.webViewCloseText}>Закрыть</Text>
              </Pressable>
              {isPaymentChecking && <MascotSpinner size="small" />}
            </View>
            <WebView
              source={{ uri: paymentUrl }}
              style={styles.webViewFlex}
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
  stepErrorContainer: {
    padding: SPACING.md,
  },
  stepErrorText: {
    color: COLORS.error,
  },
  progressCard: {
    padding: 20,
    borderRadius: 16,
    borderCurve: "continuous",
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.cardBackground,
    boxShadow: "0 2px 8px rgba(53, 46, 46, 0.14)",
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  progressTitle: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
  },
  progressPercent: {
    color: COLORS.primary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.borderLight,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  progressText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  webViewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.surface,
  },
  webViewFlex: {
    flex: 1,
  },
  webViewHeader: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 44,
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
  exportPathBlock: {
    marginBottom: SPACING.lg,
    width: "100%",
    maxWidth: 500,
  },
  exportPathButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#636128",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#636128",
  },
  exportPathButtonDisabled: {
    opacity: 0.7,
  },
  exportPathButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#fff",
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
