import { useCallback, useMemo, useEffect, useRef } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, Linking } from "react-native";
import { Text, Snackbar } from "react-native-paper";
import { useFocusEffect, useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Button, Loading } from "@/shared/components/ui";
import { AppBackButton, MarkdownText } from "@/shared/components";
import { TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { AccordionStep, GafusStepUnlock } from "@/features/training";
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
import { getStepContent, trainingApi } from "@/shared/lib/api";
import { WEB_BASE } from "@/shared/lib/utils/alerts";
import type { DiaryEntry } from "@/shared/lib/api/training";
import { getDayTitle } from "@/shared/lib/training/dayTypes";
import { reportClientError } from "@/shared/lib/tracer";
import { trackEvent } from "@/shared/lib/analytics";
import { useIsOffline } from "@/shared/hooks/useNetworkStatus";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { usePracticePendingScreen } from "@/features/training/usePracticePendingScreen";
import { useVerifiedOnlineCompletion } from "@/features/training/useVerifiedOnlineCompletion";
import { PendingPracticeNotice } from "@/features/training/PendingPracticeNotice";
import {
  readOwnPendingTimers,
  type PendingTimer,
} from "@/shared/lib/offline/newOnlyV2TimerPending";
import { openAppSubscriptionPaywall } from "@/features/app-subscription";

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
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [isExporting, setIsExporting] = useState(false);
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
  const verifiedProfile = useAuthStore((state) => state.user);
  const ownerId = verifiedProfile?.id ?? null;
  const onlineReceipt = useVerifiedOnlineCompletion(
    verifiedProfile,
    newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null,
    `${courseId}:${dayId}`,
  );
  const { pendingPractice, pendingReadStatus, refreshPendingPractice, activate, deactivate } =
    usePracticePendingScreen(ownerId, courseId, dayId);
  const [pendingTimers, setPendingTimers] = useState<PendingTimer[]>([]);
  const timerBinding = useRef<{ owner: string; epoch: string } | null>(null);
  const timerGeneration = useRef(0);
  const practiceScreenGeneration = useRef(0);
  const refreshPendingTimers = useCallback(async () => {
    const generation = ++timerGeneration.current;
    setPendingTimers([]);
    timerBinding.current = null;
    const before = newOnlyV2NativeQueues.getVerifiedBinding();
    if (
      !ownerId ||
      !before ||
      before.principalId !== ownerId ||
      useAuthStore.getState().user?.id !== ownerId
    )
      return;
    try {
      const timers = await readOwnPendingTimers(newOnlyV2NativeQueues, ownerId, courseId, dayId);
      const after = newOnlyV2NativeQueues.getVerifiedBinding();
      if (
        generation !== timerGeneration.current ||
        !after ||
        after.principalId !== ownerId ||
        after.authEpoch !== before.authEpoch ||
        useAuthStore.getState().user?.id !== ownerId
      )
        return;
      timerBinding.current = { owner: ownerId, epoch: before.authEpoch };
      setPendingTimers(timers);
    } catch {
      if (generation === timerGeneration.current) setPendingTimers([]);
    }
  }, [ownerId, courseId, dayId]);
  useFocusEffect(
    useCallback(() => {
      ++practiceScreenGeneration.current;
      activate();
      void refreshPendingPractice();
      void refreshPendingTimers();
      return () => {
        ++practiceScreenGeneration.current;
        deactivate();
        ++timerGeneration.current;
        timerBinding.current = null;
        setPendingTimers([]);
      };
    }, [activate, deactivate, refreshPendingPractice, refreshPendingTimers, verifiedProfile]),
  );
  const verifiedTimerBinding = newOnlyV2NativeQueues.getVerifiedBinding();
  const visiblePendingTimers =
    timerBinding.current?.owner === ownerId &&
    verifiedTimerBinding?.principalId === ownerId &&
    verifiedTimerBinding.authEpoch === timerBinding.current.epoch &&
    useAuthStore.getState().user?.id === ownerId
      ? pendingTimers
      : [];

  const localStepStatuses = useDayStepStatuses(courseId, dayId, dayData?.steps?.length ?? 0);

  const openIndexRaw = useTrainingStore((s) => {
    if (!courseId || !dayId) return null;
    const key = s.getDayKey(courseId, dayId);
    return s.openIndexes[key] ?? null;
  });
  const openIndex = openIndexRaw ?? -1;
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

  // Phase1 policy: ownerless persisted stepStore completion is NOT a durable
  // owner/authEpoch-attested receipt. NEVER auto-send complete*Step POST on
  // focus/restart to "recover" it. Phase2 replay/ACK is explicitly closed.
  // Server-confirmed status and current-session exact v2 pending stay read-only.

  // Обработчики
  const handleToggleStep = useCallback(
    (index: number) => {
      const step = dayData?.steps?.[index];
      if (step?.locked && step.monetizationTarget) {
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
    async (stepIndex: number, durationSec: number): Promise<boolean> => {
      const ownerAtStart = useAuthStore.getState().user;
      const epochAtStart = newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null;
      try {
        const activeTimer = useTimerStore.getState().activeTimer;
        if (activeTimer?.isRunning) {
          const isOtherStep =
            activeTimer.courseId !== courseId ||
            activeTimer.dayOnCourseId !== dayId ||
            activeTimer.stepIndex !== stepIndex;
          if (isOtherStep) {
            setSnackbar({ visible: true, message: "Сначала остановите текущий шаг" });
            return false;
          }
        }

        const currentStepState = getStepState(courseId, dayId, stepIndex);
        if (currentStepState?.status === "IN_PROGRESS") {
          return false;
        }

        // New offline event must be durable before optimistic timer mutation.
        const startingOffline = isOffline;
        const result = await startStepMutation.mutateAsync({
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
          status: "IN_PROGRESS",
          durationSec,
        });
        if (!result.success) throw new Error("Не удалось начать шаг");
        if (
          useAuthStore.getState().user !== ownerAtStart ||
          (newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null) !== epochAtStart
        )
          return false;
        startStep(courseId, dayId, stepIndex, durationSec);
        if (startingOffline && "code" in result && result.code === "OFFLINE_QUEUED") {
          setSnackbar({
            visible: true,
            message: "Начало шага сохранено только на устройстве · не отправлено",
          });
        }
        return true;
      } catch (error) {
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TrainingDay",
          keys: { operation: "start", dayId, courseId },
        });
        setSnackbar({ visible: true, message: "Ошибка старта шага" });
        return false;
      }
    },
    [courseId, dayId, getStepState, isOffline, startStep, startStepMutation],
  );

  const handlePauseStep = useCallback(
    async (stepIndex: number, remainingSec: number): Promise<boolean> => {
      const ownerAtAction = useAuthStore.getState().user;
      const epochAtAction = newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null;
      try {
        const result = await pauseStepMutation.mutateAsync({
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
          timeLeftSec: remainingSec,
        });
        if (!result.success) throw new Error("Не удалось сохранить паузу");
        if (
          useAuthStore.getState().user !== ownerAtAction ||
          (newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null) !== epochAtAction
        )
          return false;
        if ("code" in result && result.code === "OFFLINE_QUEUED") {
          setSnackbar({
            visible: true,
            message: "Пауза сохранена только на устройстве · не отправлена",
          });
        }
        return true;
      } catch (error) {
        if (
          useAuthStore.getState().user !== ownerAtAction ||
          (newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null) !== epochAtAction
        )
          return false;
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TrainingDay",
          keys: { operation: "pause", dayId, courseId },
        });
        setSnackbar({ visible: true, message: "Ошибка паузы" });
        return false;
      }
    },
    [courseId, dayId, pauseStepMutation],
  );

  const handleResumeStep = useCallback(
    async (stepIndex: number): Promise<boolean> => {
      const ownerAtAction = useAuthStore.getState().user;
      const epochAtAction = newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null;
      try {
        const result = await resumeStepMutation.mutateAsync({
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
        });
        if (!result.success) throw new Error("Не удалось возобновить шаг");
        if (
          useAuthStore.getState().user !== ownerAtAction ||
          (newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null) !== epochAtAction
        )
          return false;
        if ("code" in result && result.code === "OFFLINE_QUEUED") {
          setSnackbar({
            visible: true,
            message: "Возобновление сохранено только на устройстве · не отправлено",
          });
        }
        return true;
      } catch (error) {
        if (
          useAuthStore.getState().user !== ownerAtAction ||
          (newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null) !== epochAtAction
        )
          return false;
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TrainingDay",
          keys: { operation: "resume", dayId, courseId },
        });
        setSnackbar({ visible: true, message: "Ошибка возобновления" });
        return false;
      }
    },
    [courseId, dayId, resumeStepMutation],
  );

  const handleResetStep = useCallback(
    async (stepIndex: number, durationSec: number): Promise<boolean> => {
      const ownerAtAction = useAuthStore.getState().user;
      const epochAtAction = newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null;
      try {
        const result = await resetStepMutation.mutateAsync({
          courseId,
          dayOnCourseId: dayId,
          stepIndex,
          durationSec,
        });
        if (!result.success) throw new Error("Не удалось сбросить шаг");
        if (
          useAuthStore.getState().user !== ownerAtAction ||
          (newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null) !== epochAtAction
        )
          return false;
        stopTimer(courseId, dayId, stepIndex);
        if ("code" in result && result.code === "OFFLINE_QUEUED") {
          setSnackbar({
            visible: true,
            message: "Сброс сохранён только на устройстве · не отправлен",
          });
        }
        return true;
      } catch (error) {
        if (
          useAuthStore.getState().user !== ownerAtAction ||
          (newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null) !== epochAtAction
        )
          return false;
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TrainingDay",
          keys: { operation: "reset", dayId, courseId },
        });
        setSnackbar({ visible: true, message: "Ошибка сброса шага" });
        return false;
      }
    },
    [courseId, dayId, resetStepMutation, stopTimer],
  );

  const handleCompleteStep = useCallback(
    async (stepIndex: number, isTheory: boolean, stepTitle?: string, stepOrder?: number) => {
      const requestGeneration = practiceScreenGeneration.current;
      const currentOwner = useAuthStore.getState().user?.id ?? null;
      const initialBinding = newOnlyV2NativeQueues.getVerifiedBinding();
      const initialEpoch = initialBinding?.authEpoch ?? null;
      try {
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

        if (
          requestGeneration !== practiceScreenGeneration.current ||
          useAuthStore.getState().user !== verifiedProfile ||
          (newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null) !== initialEpoch
        )
          return;
        if ("code" in result && result.code === "OFFLINE_QUEUED") {
          const after = newOnlyV2NativeQueues.getVerifiedBinding();
          if (
            !currentOwner ||
            !initialBinding ||
            initialBinding.principalId !== currentOwner ||
            !after ||
            after.principalId !== currentOwner ||
            after.authEpoch !== initialBinding.authEpoch ||
            useAuthStore.getState().user?.id !== currentOwner
          )
            return;
        }
        if (!result.success) {
          throw new Error(result.error ?? "Не удалось сохранить прогресс");
        }

        if ("code" in result && result.code === "OFFLINE_QUEUED") {
          // The durable v2 write has resolved; refresh the owner-scoped preview now.
          void refreshPendingPractice();
          void refreshPendingTimers();
        }
        if (!("code" in result && result.code === "OFFLINE_QUEUED"))
          onlineReceipt.markConfirmed(stepIndex);
        stopTimer(courseId, dayId, stepIndex);
        setSnackbar({
          visible: true,
          message:
            "code" in result && result.code === "OFFLINE_QUEUED"
              ? "Шаг сохранён только на устройстве · не отправлен"
              : "Шаг выполнен!",
        });

        const nextIndex = stepIndex + 1;
        if (dayData?.steps && nextIndex < dayData.steps.length) {
          setOpenIndex(courseId, dayId, nextIndex);
        }
      } catch (error) {
        if (
          requestGeneration !== practiceScreenGeneration.current ||
          useAuthStore.getState().user !== verifiedProfile ||
          (newOnlyV2NativeQueues.getVerifiedBinding()?.authEpoch ?? null) !== initialEpoch
        )
          return;
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "TrainingDay",
          keys: { operation: "complete", dayId, courseId },
        });
        setSnackbar({
          visible: true,
          message: isOffline
            ? "Результат локального сохранения не подтверждён · проверьте записи перед повтором"
            : "Ошибка сохранения",
        });
      }
    },
    [
      courseId,
      dayId,
      stopTimer,
      completeTheoryMutation,
      completePracticeMutation,
      refreshPendingPractice,
      refreshPendingTimers,
      isOffline,
      onlineReceipt.markConfirmed,
      verifiedProfile,
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
            <Loading fullScreen message="Возврат к курсу..." />
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
          <AppBackButton
            style={styles.backRow}
            onPress={() => {
              void hapticFeedback.light();
              router.back();
            }}
          />
          <View style={styles.errorContainer}>
            <MaterialCommunityIcons name="alert-circle" size={48} color={COLORS.error} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            {errorDetails && <Text style={styles.errorDetails}>{errorDetails}</Text>}
            {__DEV__ && (
              <Text style={styles.errorDetails}>
                {`courseType: ${courseType}\ndayId: ${dayId}`}
              </Text>
            )}
            <Button
              label="Попробовать снова"
              fullWidth={false}
              height={34}
              fontFamily={null}
              fontWeight="600"
              fontSize={14}
              lineHeight={18}
              horizontalPadding={SPACING.md}
              verticalPadding={SPACING.sm}
              borderRadius={8}
              style={styles.retryButtonLayout}
              onPress={() => {
                void hapticFeedback.light();
                refetch();
              }}
            />
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <AppBackButton style={styles.backRow} onPress={() => router.back()} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        >
          {visiblePendingTimers.length > 0 ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text>Локальные изменения шагов · только на устройстве · не отправлено</Text>
              {visiblePendingTimers.map((item) => (
                <Text key={item.stepIndex}>
                  Шаг {item.stepIndex + 1}:{" "}
                  {item.status === "IN_PROGRESS"
                    ? "В процессе"
                    : item.status === "PAUSED"
                      ? "Пауза"
                      : item.status === "RESET"
                        ? "Сброшен"
                        : "Завершён локально"}
                </Text>
              ))}
            </View>
          ) : null}
          <PendingPracticeNotice entries={pendingPractice} status={pendingReadStatus} />
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
                style={({ pressed }) => [
                  styles.descriptionDayHeader,
                  isDescriptionOpen && styles.descriptionDayHeaderExpanded,
                  pressed && styles.descriptionDayHeaderPressed,
                ]}
                accessibilityState={{ expanded: isDescriptionOpen }}
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
                  <MaterialCommunityIcons name="file-download-outline" size={22} color="#fff" />
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
                  const isLockedGafusStep = Boolean(step.locked && step.monetizationTarget);

                  return (
                    <AccordionStep
                      key={uniqueKey}
                      step={step}
                      index={index}
                      stepNumber={exerciseNumber}
                      isOpen={openIndex === index}
                      localState={getStepState(courseId, dayId, index)}
                      verifiedLocalCompleted={
                        onlineReceipt.isConfirmed(index) ||
                        visiblePendingTimers.some(
                          (row) => row.stepIndex === index && row.status === "COMPLETED",
                        )
                      }
                      courseId={courseId}
                      offlineCourseType={courseType}
                      dayOnCourseId={dayId}
                      onToggle={() => handleToggleStep(index)}
                      onStart={() => handleStartStep(index, durationSec)}
                      onPause={(remainingSec) => handlePauseStep(index, remainingSec)}
                      onResume={() => handleResumeStep(index)}
                      onComplete={() =>
                        handleCompleteStep(
                          index,
                          stepType === "THEORY" || stepType === "DIARY",
                          stepTitle,
                          index,
                        )
                      }
                      onReset={(durationSecReset) => handleResetStep(index, durationSecReset)}
                      diaryEntries={diaryEntries}
                      onSaveDiary={stepType === "DIARY" ? handleSaveDiaryForStep : undefined}
                      accessGate={
                        isLockedGafusStep ? (
                          <>
                            {openIndex === index && step.monetizationTarget && (
                              <GafusStepUnlock
                                key={step.monetizationTarget.targetId}
                                dayOnCourseId={dayId}
                                stepOnDayId={step.monetizationTarget.targetId}
                                onUnlocked={refetch}
                              />
                            )}
                            {openIndex === index && <Button
                              label="Оформить подписку"
                              variant="caramel"
                              gradient={false}
                              buttonColor="#D4AF37"
                              textColor="#3F3218"
                              borderRadius={16}
                              onPress={handleSubscriptionPaywall}
                            />}
                          </>
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
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(99, 97, 40, 0.12)",
    borderTopColor: "rgba(255, 255, 255, 0.96)",
    backgroundColor: "#FFFDF5",
    boxShadow: "0 7px 14px rgba(53, 52, 16, 0.22)",
    elevation: 7,
  },
  descriptionDayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 66,
    paddingVertical: 13,
    paddingHorizontal: 18,
    backgroundColor: "transparent",
    borderRadius: 20,
    borderCurve: "continuous",
  },
  descriptionDayHeaderExpanded: {
    backgroundColor: "#FAF6EA",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  descriptionDayHeaderPressed: {
    backgroundColor: "#F4EEDC",
  },
  descriptionDayTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontFamily: FONTS.montserratBold,
    color: "#352e2e",
  },
  descriptionDayExpand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 36,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 18,
    backgroundColor: "rgba(99, 97, 40, 0.09)",
  },
  descriptionDayExpandText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.montserratMedium,
    color: COLORS.primary,
  },
  descriptionDayIcon: {
    transform: [{ rotate: "0deg" }],
  },
  descriptionDayIconExpanded: {
    transform: [{ rotate: "180deg" }],
  },
  descriptionDayContent: {
    backgroundColor: "#FFFDF5",
    borderTopWidth: 1,
    borderTopColor: "rgba(99, 97, 40, 0.14)",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderCurve: "continuous",
    overflow: "hidden",
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
  retryButtonLayout: {
    marginTop: SPACING.md,
  },
});
