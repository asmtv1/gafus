import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  useWindowDimensions,
  Modal,
  FlatList,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Text, Divider, IconButton } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useCallback, useEffect, useMemo, useState, memo, useRef } from "react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/shared/components/ui";

import {
  formatTimeLeft,
  getStepDisplayStatus,
  isStepWithTimer,
  shouldShowEstimatedDuration,
  STEP_STATUS_LABELS,
  STEP_TYPE_LABELS,
} from "@gafus/core-client/utils/training";
import { getEmbeddedVideoInfo } from "@gafus/core-client/utils/video";
import type { StepType, TrainingStatus } from "@gafus/types";
import { MarkdownText, VideoPlayer } from "@/shared/components";
import type { UserStep, StepContent } from "@/shared/lib/api";
import type { DiaryEntry } from "@/shared/lib/api/training";
import { TestQuestionsBlock, type ChecklistQuestion } from "./TestQuestionsBlock";
import { VideoReportBlock } from "./VideoReportBlock";
import { WrittenFeedbackBlock } from "./WrittenFeedbackBlock";
import { SurveyBlock } from "./SurveyBlock";
import type { LocalStepState } from "@/shared/stores";
import { useTimerStore } from "@/shared/stores";
import { useTimerStore as useTimerStoreDirect } from "@/shared/stores/timerStore";
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { useVerifiedV2StepTimerRestore } from "../useVerifiedV2StepTimerRestore";
import { maskUnattestedCompletedStep } from "../attestedStepStatus";
import { useVideoProgress, useVideoUrl } from "@/shared/hooks";
import { useIsOffline } from "@/shared/hooks/useNetworkStatus";
import { WebView } from "react-native-webview";
import { getOfflineVideoPosterUri, getOfflineVideoUri } from "@/shared/lib/offline/offlineStorage";
import { getVideoIdFromUrl } from "@/shared/lib/utils/videoUrl";
import { resolveImageUrl } from "@/shared/lib/utils/resolveImageUrl";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING } from "@/shared/config";
import { WEB, styles, STEP_STATUS_CONFIG } from "./AccordionStep.presentation";

/** Как web StepDiaryBlock: toLocaleDateString("ru-RU"). */
function formatDiaryEntryDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU");
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
  /** Folder key for downloaded courses (course.type, not database course.id). */
  offlineCourseType?: string;
  dayOnCourseId: string;
  onToggle: () => void;
  onStart: () => Promise<boolean>;
  onPause: (remainingSec: number) => Promise<boolean>;
  onResume: () => Promise<boolean>;
  onComplete: () => void;
  onReset?: (durationSec: number) => Promise<boolean>;
  diaryEntries?: DiaryEntry[];
  /** Стабильная ссылка из экрана дня: (stepIndex, content, stepTitle?) — без замыкания на каждый map. */
  onSaveDiary?: (stepIndex: number, content: string, stepTitle?: string) => Promise<void>;
  accessGate?: ReactNode;
  /** Verified owner/epoch-scoped durable pending completion for this exact occurrence. */
  verifiedLocalCompleted?: boolean;
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
  offlineCourseType,
  dayOnCourseId,
  onToggle,
  onStart,
  onPause,
  onResume,
  onComplete,
  onReset,
  diaryEntries = [],
  onSaveDiary,
  accessGate,
  verifiedLocalCompleted = false,
}: AccordionStepProps) {
  // Поддержка обеих структур: с вложенным step.step (UserStep) и плоского шага (офлайн)
  let stepData: StepContent;
  try {
    stepData = ("step" in step && step.step ? step.step : step) as StepContent;
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "AccordionStep",
      keys: { operation: "stepData", stepId: ("id" in step ? step.id : undefined) ?? "unknown" },
    });
    stepData = step as StepContent;
  }

  /**
   * Только стабильные методы — без activeTimer: иначе при каждом tick() меняется весь объект
   * activeTimer и перерисовываются ВСЕ шаги на экране → ScrollView сдвигает offset (~60px).
   */
  const { startTimer, pauseTimer, tick, stopTimer, isTimerActiveFor } = useTimerStore(
    useShallow((s) => ({
      startTimer: s.startTimer,
      pauseTimer: s.pauseTimer,
      tick: s.tick,
      stopTimer: s.stopTimer,
      isTimerActiveFor: s.isTimerActiveFor,
    })),
  );

  const timerProfile = useAuthStore((state) => state.user);
  const timerOwnerId = timerProfile?.id ?? null;
  const verifiedBinding = newOnlyV2NativeQueues.getVerifiedBinding();
  const timerSession =
    timerOwnerId &&
    verifiedBinding?.principalId === timerOwnerId &&
    useAuthStore.getState().user?.id === timerOwnerId
      ? { ownerId: timerOwnerId, authEpoch: verifiedBinding.authEpoch }
      : null;

  /** Остаток/флаг run только для ЭТОГО шага — сравнение по значениям, без лишних ререндеров соседей */
  const stepTimerTuple = useTimerStore(
    useShallow((s) => {
      const at = s.activeTimer;
      if (
        at &&
        at.courseId === courseId &&
        at.dayOnCourseId === dayOnCourseId &&
        at.stepIndex === index &&
        timerSession &&
        at.ownerId === timerSession.ownerId &&
        at.authEpoch === timerSession.authEpoch
      ) {
        return [at.remainingSec, at.isRunning] as const;
      }
      return null;
    }),
  );

  // После инициализации шага localState должен быть источником истины.
  // Иначе серверный RESET может перетирать локальный IN_PROGRESS после нажатия "Старт".
  // Ownerless persisted COMPLETED is not an attested local receipt.
  const serverCompleted = "status" in step && step.status === "COMPLETED";
  const safeLocalState = maskUnattestedCompletedStep(
    localState,
    verifiedLocalCompleted,
    serverCompleted,
  );
  const status = verifiedLocalCompleted
    ? "COMPLETED"
    : getStepDisplayStatus(
        safeLocalState,
        safeLocalState ? undefined : "status" in step ? step : undefined,
      );
  const statusConfig = STEP_STATUS_CONFIG[status] ?? STEP_STATUS_CONFIG.NOT_STARTED;
  const statusText = STEP_STATUS_LABELS[status as TrainingStatus] ?? STEP_STATUS_LABELS.NOT_STARTED;
  const isCompleted = status === "COMPLETED";
  const isInProgress = status === "IN_PROGRESS";
  const isReset = status === "RESET";
  const stepType = stepData?.type ?? "";
  const isTheory = stepType === "THEORY";
  const isPractice = stepType === "PRACTICE";
  const isBreak = stepType === "BREAK";
  const isExamination = stepType === "EXAMINATION";
  const isDiary = stepType === "DIARY";
  const isSurvey = stepType === "SURVEY";
  const examUserStepId =
    "userStepId" in step && typeof step.userStepId === "string"
      ? step.userStepId
      : "id" in step && typeof step.id === "string"
        ? step.id
        : null;
  const examChecklist = Array.isArray(stepData.checklist)
    ? (stepData.checklist as ChecklistQuestion[])
    : null;
  /** Паритет с web AccordionStep: только TRAINING и BREAK (см. isStepWithTimer в core) */
  const showTimer = isStepWithTimer(stepType as StepType);
  const stepTypeForUi = (stepType || undefined) as StepType | undefined;

  const videoUrl = stepData?.videoUrl ?? null;

  const videoInfo = useMemo(
    () => (videoUrl && typeof videoUrl === "string" ? getEmbeddedVideoInfo(videoUrl) : null),
    [videoUrl],
  );
  /** CDN / наш HLS — expo-video; остальное (Rutube, YouTube, VK…) — WebView с embed URL, как на web. */
  const useExpoVideo = Boolean(videoInfo?.isCDN || videoInfo?.isHLS);
  const embedPageUrl = videoInfo && !useExpoVideo && videoInfo.embedUrl ? videoInfo.embedUrl : null;

  const isOffline = useIsOffline();

  const trainerImageUrls = useMemo(() => {
    const raw = stepData?.imageUrls;
    if (!Array.isArray(raw)) return [];
    return raw.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  }, [stepData?.imageUrls]);

  const resolvedTrainerImageUris = useMemo(
    () =>
      trainerImageUrls.map((raw) => resolveImageUrl(raw)).filter((u): u is string => u !== null),
    [trainerImageUrls],
  );

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const stepImageMaxWidth = Math.min(windowWidth - SPACING.md * 4, 520);

  /** Фиксированная высота: в ScrollView + aspectRatio у WebView часто даёт 0px. */
  const embedWebViewHeight = useMemo(
    () => Math.max(220, Math.round((Math.min(windowWidth, 640) - SPACING.md * 2) * (9 / 16))),
    [windowWidth],
  );

  const handleEmbedShouldStartLoad = useCallback((request: { url: string }) => {
    const u = request.url;
    if (u.startsWith("http://") || u.startsWith("https://")) return true;
    if (u.startsWith("about:blank") || u.startsWith("about:srcdoc")) return true;
    if (u === "about:blank") return true;
    return false;
  }, []);

  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const imageGalleryRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (!imageViewerOpen) return;
    const id = requestAnimationFrame(() => {
      imageGalleryRef.current?.scrollToOffset({
        offset: imageViewerIndex * windowWidth,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [imageViewerOpen, imageViewerIndex, windowWidth]);
  const [videoPlayerRetryKey, setVideoPlayerRetryKey] = useState(0);
  const [userRequestedPlay, setUserRequestedPlay] = useState(false);
  const [diaryContent, setDiaryContent] = useState("");
  const [isSavingDiary, setIsSavingDiary] = useState(false);
  const [diaryError, setDiaryError] = useState<string | null>(null);
  const [offlineVideoUri, setOfflineVideoUri] = useState<string | null>(null);
  const [offlinePosterUri, setOfflinePosterUri] = useState<string | null>(null);
  const [isCheckingOfflineVideo, setIsCheckingOfflineVideo] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  const asyncActionEpoch = useRef(0);
  const actionPending = useRef(false);
  useEffect(
    () => () => {
      asyncActionEpoch.current++;
    },
    [courseId, dayOnCourseId, index],
  );
  const requestOnlineUrl =
    isOpen &&
    userRequestedPlay &&
    videoUrl &&
    typeof videoUrl === "string" &&
    videoUrl.trim() !== "" &&
    useExpoVideo;
  const {
    url: playbackUrl,
    isLoading: isLoadingVideo,
    error: videoError,
    videoId,
    posterUrl,
    retry: retryVideo,
  } = useVideoUrl(requestOnlineUrl && !isOffline ? videoUrl : null);
  const sourceVideoId = getVideoIdFromUrl(videoUrl);
  const {
    initialTimeSec,
    isLoading: isLoadingVideoProgress,
    saveProgress,
    saveError: videoSaveError,
  } = useVideoProgress(videoId ?? sourceVideoId, Boolean(requestOnlineUrl));

  useEffect(() => {
    if (!requestOnlineUrl || !videoUrl || !courseId) {
      setOfflineVideoUri(null);
      setOfflinePosterUri(null);
      setIsCheckingOfflineVideo(false);
      return;
    }
    let cancelled = false;
    setIsCheckingOfflineVideo(true);
    void Promise.all([
      getOfflineVideoUri(offlineCourseType ?? courseId, videoUrl),
      getOfflineVideoPosterUri(offlineCourseType ?? courseId, videoUrl),
    ])
      .then(([uri, posterUri]) => {
        if (!cancelled) {
          setOfflineVideoUri(uri);
          setOfflinePosterUri(posterUri);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "AccordionStep",
          keys: { operation: "offline_video_lookup" },
        });
        setOfflineVideoUri(null);
        setOfflinePosterUri(null);
      })
      .finally(() => {
        if (!cancelled) setIsCheckingOfflineVideo(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestOnlineUrl, videoUrl, courseId, offlineCourseType]);

  const effectivePlaybackUrl = offlineVideoUri ?? playbackUrl;
  const showOfflineStub =
    requestOnlineUrl && isOffline && !isCheckingOfflineVideo && !effectivePlaybackUrl;
  const handleVideoPlayerRetry = useCallback(() => {
    if (isOffline && offlineVideoUri) {
      setVideoPlayerRetryKey((key) => key + 1);
      return;
    }
    retryVideo();
  }, [isOffline, offlineVideoUri, retryVideo]);

  useEffect(() => {
    if (!isOpen) setUserRequestedPlay(false);
  }, [isOpen]);

  /** UI timer state may mutate only after a verified writer result, never optimistically. */
  const runCommittedAction = (save: () => Promise<boolean>, apply: () => void) => {
    if (!timerSession || actionPending.current) return;
    actionPending.current = true;
    const generation = asyncActionEpoch.current;
    const session = timerSession;
    void save()
      .then((saved) => {
        if (!saved || generation !== asyncActionEpoch.current) return;
        const binding = newOnlyV2NativeQueues.getVerifiedBinding();
        if (
          binding?.principalId !== session.ownerId ||
          binding.authEpoch !== session.authEpoch ||
          useAuthStore.getState().user?.id !== session.ownerId
        )
          return;
        apply();
      })
      .catch((error) =>
        reportClientError(error instanceof Error ? error : new Error(String(error)), {
          issueKey: "AccordionStep",
          keys: { operation: "actionAfterCommit" },
        }),
      )
      .finally(() => {
        actionPending.current = false;
      });
  };

  // AccordionStep is the real owner of timer restoration for both course variants.
  useVerifiedV2StepTimerRestore(
    courseId,
    dayOnCourseId,
    index,
    status,
    showTimer,
    timerOwnerId,
    timerSession?.authEpoch ?? null,
  );

  // Проверяем, активен ли таймер для этого шага
  const hasActiveTimer =
    !!timerSession && isTimerActiveFor(courseId, dayOnCourseId, index, timerSession);
  const isActuallyRunning = isInProgress && hasActiveTimer && Boolean(stepTimerTuple?.[1]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

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
        currentTimer.isRunning &&
        timerSession &&
        currentTimer.ownerId === timerSession.ownerId &&
        currentTimer.authEpoch === timerSession.authEpoch;

      if (!isTimerActive) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      if (intervalRef.current) {
        return;
      }

      // Сразу синхронизируем остаток (без ожидания 1 секунды).
      tick();

      intervalRef.current = setInterval(() => {
        try {
          // Auth binding may rotate before React commits a new render. The callback
          // must never complete a former session's step, even in that gap.
          const liveBinding = newOnlyV2NativeQueues.getVerifiedBinding();
          if (
            !timerSession ||
            liveBinding?.principalId !== timerSession.ownerId ||
            liveBinding.authEpoch !== timerSession.authEpoch ||
            useAuthStore.getState().user?.id !== timerSession.ownerId
          ) {
            const stale = useTimerStoreDirect.getState().activeTimer;
            if (
              stale?.courseId === courseId &&
              stale.dayOnCourseId === dayOnCourseId &&
              stale.stepIndex === index &&
              stale.ownerId === timerSession?.ownerId &&
              stale.authEpoch === timerSession?.authEpoch
            )
              stopTimer(courseId, dayOnCourseId, index);
            return;
          }
          // Проверяем, что таймер все еще активен и работает
          const timerState = useTimerStoreDirect.getState().activeTimer;
          if (!timerState || !timerState.isRunning) {
            return;
          }

          // Проверяем, что это тот же таймер
          if (
            timerState.courseId !== courseId ||
            timerState.dayOnCourseId !== dayOnCourseId ||
            timerState.stepIndex !== index ||
            !timerSession ||
            timerState.ownerId !== timerSession.ownerId ||
            timerState.authEpoch !== timerSession.authEpoch
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
            timerSession &&
            updatedTimer.ownerId === timerSession.ownerId &&
            updatedTimer.authEpoch === timerSession.authEpoch &&
            updatedTimer.remainingSec <= 0 &&
            !actionPending.current
          ) {
            stopTimer(courseId, dayOnCourseId, index);
            onCompleteRef.current();
          }
        } catch (error) {
          reportClientError(error instanceof Error ? error : new Error(String(error)), {
            issueKey: "AccordionStep",
            keys: { operation: "timer_tick", stepIndex: index },
          });
        }
      }, 1000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "AccordionStep",
        keys: { operation: "timer_init", stepIndex: index },
      });
    }
    return;
    // Не включаем activeTimer в deps: при каждом tick() store отдаёт новый объект,
    // эффект бы перезапускался каждую секунду и создавал новый setInterval.
  }, [
    hasActiveTimer,
    isActuallyRunning,
    tick,
    courseId,
    dayOnCourseId,
    index,
    stopTimer,
    timerSession?.ownerId,
    timerSession?.authEpoch,
  ]);

  const stepTypeLabel = isBreak
    ? "Перерыв"
    : isDiary
      ? "Дневник успехов"
      : isSurvey
        ? "Анкета"
        : stepNumber != null
          ? `Упражнение #${stepNumber}`
          : `#${index + 1}`;
  const stepSubtitle =
    stepType === "BREAK" ? (stepData?.title ?? "") : `«${stepData?.title ?? "Шаг"}»`;
  const showDiaryBlock = isDiary && !!onSaveDiary;
  /** Смена key при обновлении списка: пересборка поддерева + обход глюков layout внутри Animated.View */
  const diaryEntriesListKey = useMemo(
    () => diaryEntries.map((e) => e.id).join("|"),
    [diaryEntries],
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: statusConfig.backgroundColor },
        isOpen && styles.containerOpen,
      ]}
    >
      <View style={styles.surfaceContent}>
        {/* Две строки: 1 — название по центру, 2 — Подробнее/Скрыть + статус */}
        <Pressable
          onPress={() => {
            void hapticFeedback.selection();
            onToggle();
          }}
          style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isOpen ? "Скрыть шаг" : "Подробнее о шаге"}
          accessibilityState={{ expanded: isOpen }}
        >
          {stepSubtitle || stepTypeLabel ? (
            <Text style={styles.stepTitleLine}>{stepSubtitle || stepTypeLabel}</Text>
          ) : null}
          <View style={styles.headerRowExpand}>
            <View style={styles.expandControl}>
              <MaterialCommunityIcons
                name={isOpen ? "chevron-up" : "chevron-down"}
                size={22}
                color={WEB.stepBorder}
              />
              <Text style={styles.expandText}>{isOpen ? "Скрыть" : "Подробнее"}</Text>
            </View>
            <View
              style={[
                styles.stepStatusConfig,
                { backgroundColor: statusConfig.statusBackgroundColor },
              ]}
            >
              <MaterialCommunityIcons
                name={statusConfig.icon}
                size={18}
                color={statusConfig.foregroundColor}
              />
              <Text style={[styles.stepStatusText, { color: statusConfig.foregroundColor }]}>
                {statusText}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* Контент раскрывается нативным layout: без ручного измерения высоты и магических лимитов. */}
        <Animated.View layout={LinearTransition.duration(200)} style={styles.content}>
          {isOpen && (
            <Animated.View
              entering={FadeIn.duration(120)}
              exiting={FadeOut.duration(80)}
              style={styles.stepContentInner}
            >
              <Divider style={styles.divider} />

              {accessGate ? (
                <View style={styles.accessGateWrap}>{accessGate}</View>
              ) : (
                <>
                  {/* Информационные карточки для разных типов шагов (как в web) */}
                  {isTheory && (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoCardTitle}>{STEP_TYPE_LABELS.THEORY}</Text>
                      {shouldShowEstimatedDuration(stepTypeForUi) &&
                        stepData.estimatedDurationSec &&
                        stepData.estimatedDurationSec > 0 && (
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
                      <Text style={styles.infoCardTitle}>{STEP_TYPE_LABELS.PRACTICE}</Text>
                      {shouldShowEstimatedDuration(stepTypeForUi) &&
                        stepData.estimatedDurationSec &&
                        stepData.estimatedDurationSec > 0 && (
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
                      <Text style={styles.infoCardTitle}>{STEP_TYPE_LABELS.EXAMINATION}</Text>
                      {shouldShowEstimatedDuration(stepTypeForUi) &&
                        stepData.estimatedDurationSec &&
                        stepData.estimatedDurationSec > 0 && (
                          <View style={styles.estimatedTimeBadge}>
                            <Text style={styles.estimatedTimeBadgeText}>
                              Этот шаг займёт ~ {Math.round(stepData.estimatedDurationSec / 60)} мин
                            </Text>
                          </View>
                        )}
                    </View>
                  )}

                  {isDiary && (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoCardTitle}>{STEP_TYPE_LABELS.DIARY}</Text>
                    </View>
                  )}

                  {isSurvey && (
                    <View style={styles.infoCard}>
                      <Text style={styles.infoCardTitle}>{STEP_TYPE_LABELS.SURVEY}</Text>
                      {shouldShowEstimatedDuration(stepTypeForUi) &&
                        stepData.estimatedDurationSec &&
                        stepData.estimatedDurationSec > 0 && (
                          <View style={styles.estimatedTimeBadge}>
                            <Text style={styles.estimatedTimeBadgeText}>
                              Этот шаг займёт ~ {Math.round(stepData.estimatedDurationSec / 60)} мин
                            </Text>
                          </View>
                        )}
                    </View>
                  )}

                  {/* Блок экзамена: тест, письменная связь, видео (как на web) */}
                  {isExamination && examUserStepId && (
                    <View style={styles.descriptionSection}>
                      <Text style={styles.descriptionSectionTitle}>Экзамен:</Text>
                      <View style={styles.descriptionSectionContent}>
                        {stepData.hasTestQuestions && examChecklist && examChecklist.length > 0 && (
                          <TestQuestionsBlock
                            checklist={examChecklist}
                            userStepId={examUserStepId}
                            stepId={
                              (stepData && "id" in stepData && stepData.id) ||
                              ("id" in step && (step as { id: string }).id) ||
                              ""
                            }
                          />
                        )}
                        {stepData.requiresWrittenFeedback && (
                          <WrittenFeedbackBlock
                            userStepId={examUserStepId}
                            stepId={
                              (stepData && "id" in stepData && stepData.id) ||
                              ("id" in step && (step as { id: string }).id) ||
                              ""
                            }
                          />
                        )}
                        {stepData.requiresVideoReport && (
                          <VideoReportBlock
                            userStepId={examUserStepId}
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

                  {isSurvey && stepData.surveySlug && (
                    <View style={styles.descriptionSection}>
                      <Text style={styles.descriptionSectionTitle}>Анкета:</Text>
                      <View style={styles.descriptionSectionContent}>
                        <SurveyBlock
                          courseId={courseId}
                          stepId={stepData.id}
                          userStepId={examUserStepId}
                          surveySlug={stepData.surveySlug}
                          onComplete={onComplete}
                        />
                      </View>
                    </View>
                  )}

                  {showDiaryBlock && (
                    <View key={diaryEntriesListKey} style={styles.diaryStepInfo}>
                      {!isCompleted ? (
                        <>
                          <Text style={styles.diarySectionTitle}>Ваша запись:</Text>
                          <TextInput
                            value={diaryContent}
                            onChangeText={(t) => {
                              setDiaryContent(t);
                              if (diaryError) setDiaryError(null);
                            }}
                            multiline
                            maxLength={10000}
                            placeholder="Опишите свои успехи за сегодня..."
                            placeholderTextColor={COLORS.textSecondary}
                            style={styles.diaryTextarea}
                          />
                          {diaryError ? (
                            <Text style={styles.diaryError} accessibilityRole="alert">
                              {diaryError}
                            </Text>
                          ) : null}
                          <View style={styles.diarySaveAction}>
                            <Button
                              label={isSavingDiary ? "Сохранение…" : "Сохранить"}
                              width={200}
                              fullWidth={false}
                              height={48}
                              fontFamily={null}
                              fontWeight="600"
                              fontSize={15}
                              lineHeight={20}
                              horizontalPadding={28}
                              verticalPadding={0}
                              borderRadius={12}
                              animatedPress
                              haptic={false}
                              style={styles.completeButtonLayout}
                              loading={isSavingDiary}
                              disabled={isSavingDiary || !diaryContent.trim()}
                              onPress={async () => {
                                const content = diaryContent.trim();
                                if (!onSaveDiary) return;
                                if (!content) {
                                  setDiaryError("Введите текст записи");
                                  return;
                                }
                                setIsSavingDiary(true);
                                try {
                                  await onSaveDiary(
                                    index,
                                    content,
                                    typeof stepData?.title === "string"
                                      ? stepData.title
                                      : undefined,
                                  );
                                  void hapticFeedback.success();
                                  setDiaryContent("");
                                  setDiaryError(null);
                                } finally {
                                  setIsSavingDiary(false);
                                }
                              }}
                            />
                          </View>
                        </>
                      ) : (
                        <View style={styles.completedBadge}>
                          <Text style={styles.completedBadgeCheck}>✓</Text>
                          <Text style={styles.completedBadgeText}>Запись сохранена</Text>
                        </View>
                      )}
                      {diaryEntries.length > 0 ? (
                        <>
                          <Text style={styles.diarySectionTitle}>Предыдущие записи:</Text>
                          <View style={styles.diaryEntriesList}>
                            {diaryEntries.map((entry) => (
                              <View key={entry.id} style={styles.diaryEntryItem}>
                                <Text style={styles.diaryEntryTitle}>
                                  День {entry.dayOrder}. {entry.dayTitle}
                                </Text>
                                <Text style={styles.diaryEntryDate}>
                                  {formatDiaryEntryDate(entry.createdAt)}
                                </Text>
                                <Text style={styles.diaryEntryContent}>{entry.content}</Text>
                              </View>
                            ))}
                          </View>
                        </>
                      ) : null}
                    </View>
                  )}

                  {/* Описание перед видео */}
                  {(() => {
                    const description =
                      (stepData && "description" in stepData && stepData.description) ||
                      (step && "description" in step && step.description);
                    if (
                      !description ||
                      typeof description !== "string" ||
                      description.trim() === ""
                    )
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

                  {/* Изображения тренера — как web StepContent (отдельное поле imageUrls, не markdown). */}
                  {!isBreak && resolvedTrainerImageUris.length > 0 && (
                    <View style={styles.imagesSection}>
                      <Text style={styles.descriptionSectionTitle}>Изображения:</Text>
                      {resolvedTrainerImageUris.map((src, imgIndex) => (
                        <Pressable
                          key={`${imgIndex}-${src.slice(0, 48)}`}
                          onPress={() => {
                            void hapticFeedback.light();
                            setImageViewerIndex(imgIndex);
                            setImageViewerOpen(true);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Открыть изображение ${imgIndex + 1} на весь экран`}
                        >
                          <Image
                            source={{ uri: src }}
                            style={[styles.stepTrainerImage, { maxWidth: stepImageMaxWidth }]}
                            contentFit="contain"
                            accessibilityLabel={`Изображение ${imgIndex + 1} к шагу`}
                          />
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {/* Видео: сначала обложка с кнопкой Play (как на web), по нажатию — загрузка и плеер */}
                  {!isBreak &&
                    videoUrl &&
                    typeof videoUrl === "string" &&
                    videoUrl.trim() !== "" && (
                      <View style={styles.videoContainer}>
                        {!userRequestedPlay ? (
                          <Pressable
                            style={styles.videoCover}
                            onPress={() => {
                              void hapticFeedback.light();
                              setUserRequestedPlay(true);
                            }}
                          >
                            <MaterialCommunityIcons
                              name="play-circle-outline"
                              size={72}
                              color="#fff"
                            />
                            <Text style={styles.videoCoverText}>Смотреть видео</Text>
                          </Pressable>
                        ) : embedPageUrl ? (
                          isOffline ? (
                            <View style={styles.videoLoadingContainer}>
                              <Text style={styles.videoLoadingText}>
                                Для просмотра нужен интернет
                              </Text>
                            </View>
                          ) : (
                            <View style={[styles.embedWebViewWrap, { height: embedWebViewHeight }]}>
                              <WebView
                                key={embedPageUrl}
                                source={{ uri: embedPageUrl }}
                                style={[styles.embedWebView, { height: embedWebViewHeight }]}
                                /* Иначе about:srcdoc/iframe уходят в Linking → WARN и пустой экран */
                                originWhitelist={["http://*", "https://*", "about:*"]}
                                onShouldStartLoadWithRequest={handleEmbedShouldStartLoad}
                                allowsInlineMediaPlayback
                                mediaPlaybackRequiresUserAction={false}
                                javaScriptEnabled
                                domStorageEnabled
                                mixedContentMode="always"
                                allowsFullscreenVideo
                                setSupportMultipleWindows={false}
                                thirdPartyCookiesEnabled={Platform.OS === "android"}
                                cacheEnabled
                              />
                            </View>
                          )
                        ) : showOfflineStub ? (
                          <View style={styles.videoLoadingContainer}>
                            <Text style={styles.videoLoadingText}>
                              Для просмотра нужен интернет
                            </Text>
                          </View>
                        ) : isLoadingVideoProgress ||
                          ((isLoadingVideo || isCheckingOfflineVideo) && !offlineVideoUri) ? (
                          <View style={styles.videoLoadingContainer}>
                            <Text style={styles.videoLoadingText}>Загрузка видео...</Text>
                          </View>
                        ) : videoError && !offlineVideoUri ? (
                          <View style={styles.videoLoadingContainer}>
                            <Text style={styles.videoLoadingText} selectable>
                              Не удалось загрузить видео. Проверьте соединение и попробуйте ещё раз.
                            </Text>
                            <Button
                              label="Повторить"
                              fullWidth={false}
                              height={44}
                              fontFamily={null}
                              fontWeight="600"
                              fontSize={14}
                              lineHeight={18}
                              horizontalPadding={SPACING.md}
                              verticalPadding={0}
                              borderRadius={10}
                              style={styles.videoRetryButtonLayout}
                              onPress={retryVideo}
                              accessibilityRole="button"
                              accessibilityLabel="Повторить загрузку видео"
                            />
                          </View>
                        ) : effectivePlaybackUrl ? (
                          <View>
                            <VideoPlayer
                              key={videoPlayerRetryKey}
                              uri={effectivePlaybackUrl}
                              poster={offlinePosterUri ?? posterUrl ?? undefined}
                              autoPlay
                              initialTimeSec={initialTimeSec}
                              onSaveProgress={saveProgress}
                              onRetry={handleVideoPlayerRetry}
                            />
                            {videoSaveError ? (
                              <Text accessibilityRole="alert">{videoSaveError}</Text>
                            ) : null}
                          </View>
                        ) : userRequestedPlay ? (
                          <View style={styles.videoLoadingContainer}>
                            <Text style={styles.videoLoadingText}>
                              Не удалось открыть видео. Попробуйте ещё раз или откройте ссылку в
                              браузере.
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    )}

                  {/* Таймер для тренировочных шагов и перерывов (как в web) */}
                  {showTimer &&
                    (() => {
                      try {
                        const duration = stepData?.durationSec ?? 0;
                        const timeLeft =
                          hasActiveTimer && stepTimerTuple
                            ? stepTimerTuple[0]
                            : isReset
                              ? duration
                              : (localState?.timeLeft ?? localState?.remainingSec ?? duration);

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
                              <Text style={styles.timerDisplay}>{formatTimeLeft(timeLeft)}</Text>

                              {/* Кнопки управления */}
                              <View style={styles.timerButtons}>
                                {(status === "NOT_STARTED" || status === "RESET") && (
                                  <IconButton
                                    icon="play-circle"
                                    iconColor={WEB.circleBtnBorder}
                                    size={28}
                                    style={styles.circleBtn}
                                    onPress={() => {
                                      void hapticFeedback.medium();
                                      if (!timerSession) return;
                                      const session = timerSession;
                                      runCommittedAction(onStart, () => {
                                        startTimer(
                                          courseId,
                                          dayOnCourseId,
                                          index,
                                          duration,
                                          session,
                                        );
                                      });
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
                                      void hapticFeedback.light();
                                      if (!timerSession) return;
                                      const active = useTimerStoreDirect.getState().activeTimer;
                                      if (
                                        !active ||
                                        active.ownerId !== timerSession.ownerId ||
                                        active.authEpoch !== timerSession.authEpoch ||
                                        active.courseId !== courseId ||
                                        active.dayOnCourseId !== dayOnCourseId ||
                                        active.stepIndex !== index ||
                                        !active.isRunning
                                      )
                                        return;
                                      const remaining = Math.max(
                                        0,
                                        (active.endTsSec ??
                                          Math.floor(Date.now() / 1000) + active.remainingSec) -
                                          Math.floor(Date.now() / 1000),
                                      );
                                      runCommittedAction(
                                        () => onPause(remaining),
                                        () => {
                                          pauseTimer();
                                        },
                                      );
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
                                      void hapticFeedback.medium();
                                      if (!timerSession) return;
                                      const active = useTimerStoreDirect.getState().activeTimer;
                                      const remaining =
                                        active &&
                                        !active.isRunning &&
                                        active.ownerId === timerSession.ownerId &&
                                        active.authEpoch === timerSession.authEpoch &&
                                        active.courseId === courseId &&
                                        active.dayOnCourseId === dayOnCourseId &&
                                        active.stepIndex === index
                                          ? active.remainingSec
                                          : (localState?.timeLeft ??
                                            localState?.remainingSec ??
                                            duration);
                                      const session = timerSession;
                                      runCommittedAction(onResume, () => {
                                        startTimer(
                                          courseId,
                                          dayOnCourseId,
                                          index,
                                          remaining,
                                          session,
                                        );
                                      });
                                    }}
                                  />
                                )}
                                <IconButton
                                  icon="replay"
                                  iconColor={WEB.circleBtnBorder}
                                  size={22}
                                  style={styles.circleBtnReset}
                                  onPress={() => {
                                    void hapticFeedback.selection();
                                    if (!onReset) return;
                                    runCommittedAction(
                                      () => onReset(duration),
                                      () => {
                                        stopTimer(courseId, dayOnCourseId, index);
                                      },
                                    );
                                  }}
                                />
                              </View>
                            </View>
                          </View>
                        );
                      } catch (error) {
                        reportClientError(
                          error instanceof Error ? error : new Error(String(error)),
                          {
                            issueKey: "AccordionStep",
                            keys: { operation: "timer_display", stepIndex: index },
                          },
                        );
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
                          <Button
                            label="Я выполнил"
                            width={200}
                            fullWidth={false}
                            height={48}
                            fontFamily={null}
                            fontWeight="600"
                            fontSize={15}
                            lineHeight={20}
                            horizontalPadding={28}
                            verticalPadding={0}
                            borderRadius={12}
                            animatedPress
                            haptic={false}
                            style={styles.completeButtonLayout}
                            onPress={() => {
                              void hapticFeedback.light();
                              onComplete?.();
                            }}
                          />
                        </View>
                      )
                    ) : isTheory && !isCompleted ? (
                      <View style={styles.completeAction}>
                        <Button
                          label="Прочитано"
                          width={200}
                          fullWidth={false}
                          height={48}
                          fontFamily={null}
                          fontWeight="600"
                          fontSize={15}
                          lineHeight={20}
                          horizontalPadding={28}
                          verticalPadding={0}
                          borderRadius={12}
                          animatedPress
                          haptic={false}
                          style={styles.completeButtonLayout}
                          onPress={() => {
                            void hapticFeedback.light();
                            onComplete?.();
                          }}
                        />
                      </View>
                    ) : isCompleted ? (
                      <View style={styles.completedBadge}>
                        <MaterialCommunityIcons name="check" size={16} color={COLORS.success} />
                        <Text style={styles.completedText}>Выполнено</Text>
                      </View>
                    ) : null}
                  </View>
                </>
              )}
            </Animated.View>
          )}
        </Animated.View>
      </View>

      <Modal
        visible={imageViewerOpen}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setImageViewerOpen(false)}
      >
        <View style={[styles.imageViewerRoot, { height: windowHeight }]}>
          <View
            style={[
              styles.imageViewerHeader,
              { paddingTop: insets.top + 4, paddingRight: Math.max(insets.right, 4) },
            ]}
          >
            <IconButton
              icon="close"
              iconColor="#fff"
              size={26}
              onPress={() => {
                void hapticFeedback.light();
                setImageViewerOpen(false);
              }}
              accessibilityLabel="Закрыть просмотр изображения"
            />
          </View>
          <FlatList
            ref={imageGalleryRef}
            data={resolvedTrainerImageUris}
            keyExtractor={(item, i) => `${i}-${item.slice(0, 48)}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, i) => ({
              length: windowWidth,
              offset: windowWidth * i,
              index: i,
            })}
            renderItem={({ item }) => (
              <View style={[styles.imageViewerPage, { width: windowWidth, height: windowHeight }]}>
                <Image
                  source={{ uri: item }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="contain"
                />
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

export const AccordionStep = memo(AccordionStepComponent);
