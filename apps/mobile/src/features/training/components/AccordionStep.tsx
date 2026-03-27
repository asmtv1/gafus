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
import Animated, { useAnimatedStyle, withTiming, useSharedValue } from "react-native-reanimated";
import { useCallback, useEffect, useMemo, useState, memo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  formatTimeLeft,
  getStepDisplayStatus,
  isStepWithTimer,
  shouldShowEstimatedDuration,
  STEP_STATUS_LABELS,
  STEP_TYPE_LABELS,
} from "@gafus/core/utils/training";
import { getEmbeddedVideoInfo } from "@gafus/core/utils";
import type { StepType, TrainingStatus } from "@gafus/types";
import { MarkdownText, VideoPlayer } from "@/shared/components";
import type { UserStep, StepContent } from "@/shared/lib/api";
import type { DiaryEntry } from "@/shared/lib/api/training";
import { TestQuestionsBlock, type ChecklistQuestion } from "./TestQuestionsBlock";
import { VideoReportBlock } from "./VideoReportBlock";
import { WrittenFeedbackBlock } from "./WrittenFeedbackBlock";
import type { LocalStepState } from "@/shared/stores";
import { useTimerStore } from "@/shared/stores";
import { useTimerStore as useTimerStoreDirect } from "@/shared/stores/timerStore";
import { useVideoUrl } from "@/shared/hooks";
import { useNetworkStatus } from "@/shared/hooks/useNetworkStatus";
import { WebView } from "react-native-webview";
import { getOfflineVideoUri } from "@/shared/lib/offline/offlineStorage";
import { resolveImageUrl } from "@/shared/lib/utils/resolveImageUrl";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, FONTS, SPACING } from "@/constants";

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

/** Как web StepDiaryBlock: toLocaleDateString("ru-RU"). */
function formatDiaryEntryDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU");
}

/** Цвета и эмодзи для статусов — как в web Day.tsx */
const STEP_STATUS_CONFIG: Record<
  string,
  { emoji: string; backgroundColor: string }
> = {
  NOT_STARTED: { emoji: "⏳", backgroundColor: "#FFF8E5" },
  IN_PROGRESS: { emoji: "🔄", backgroundColor: "#E6F3FF" },
  COMPLETED: { emoji: "✅", backgroundColor: "#B6C582" },
  PAUSED: { emoji: "⏸️", backgroundColor: "#FFF4E6" },
  RESET: { emoji: "🔄", backgroundColor: "#E8E6E6" },
};

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
  diaryEntries?: DiaryEntry[];
  /** Стабильная ссылка из экрана дня: (stepIndex, content, stepTitle?) — без замыкания на каждый map. */
  onSaveDiary?: (stepIndex: number, content: string, stepTitle?: string) => Promise<void>;
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
  diaryEntries = [],
  onSaveDiary,
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
  const { startTimer, pauseTimer, tick, stopTimer, isTimerActiveFor, restoreTimerFromStorage } = useTimerStore(
    useShallow((s) => ({
      startTimer: s.startTimer,
      pauseTimer: s.pauseTimer,
      tick: s.tick,
      stopTimer: s.stopTimer,
      isTimerActiveFor: s.isTimerActiveFor,
      restoreTimerFromStorage: s.restoreTimerFromStorage,
    })),
  );

  /** Остаток/флаг run только для ЭТОГО шага — сравнение по значениям, без лишних ререндеров соседей */
  const stepTimerTuple = useTimerStore(
    useShallow((s) => {
      const at = s.activeTimer;
      if (
        at &&
        at.courseId === courseId &&
        at.dayOnCourseId === dayOnCourseId &&
        at.stepIndex === index
      ) {
        return [at.remainingSec, at.isRunning] as const;
      }
      return null;
    }),
  );

  // После инициализации шага localState должен быть источником истины.
  // Иначе серверный RESET может перетирать локальный IN_PROGRESS после нажатия "Старт".
  const status = getStepDisplayStatus(
    localState,
    localState ? undefined : ("status" in step ? step : undefined),
  );
  const statusConfig =
    STEP_STATUS_CONFIG[status] ?? STEP_STATUS_CONFIG.NOT_STARTED;
  const statusText =
    STEP_STATUS_LABELS[status as TrainingStatus] ??
    STEP_STATUS_LABELS.NOT_STARTED;
  const isCompleted = status === "COMPLETED";
  const isInProgress = status === "IN_PROGRESS";
  const isReset = status === "RESET";
  const stepType = stepData?.type ?? "";
  const isTheory = stepType === "THEORY";
  const isPractice = stepType === "PRACTICE";
  const isBreak = stepType === "BREAK";
  const isExamination = stepType === "EXAMINATION";
  const isDiary = stepType === "DIARY";
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
  const embedPageUrl =
    videoInfo && !useExpoVideo && videoInfo.embedUrl ? videoInfo.embedUrl : null;

  const { isOffline } = useNetworkStatus();

  const trainerImageUrls = useMemo(() => {
    const raw = stepData?.imageUrls;
    if (!Array.isArray(raw)) return [];
    return raw.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
  }, [stepData?.imageUrls]);

  const resolvedTrainerImageUris = useMemo(
    () =>
      trainerImageUrls
        .map((raw) => resolveImageUrl(raw))
        .filter((u): u is string => u !== null),
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
  const [videoRetryKey, setVideoRetryKey] = useState(0);
  const lastPlaybackUrlRef = useRef<string | null>(null);

  const [userRequestedPlay, setUserRequestedPlay] = useState(false);
  const [diaryContent, setDiaryContent] = useState("");
  const [isSavingDiary, setIsSavingDiary] = useState(false);
  const [diaryError, setDiaryError] = useState<string | null>(null);
  const [offlineVideoUri, setOfflineVideoUri] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
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

  // Проверяем, активен ли таймер для этого шага
  const hasActiveTimer = isTimerActiveFor(courseId, dayOnCourseId, index);
  const isActuallyRunning =
    isInProgress && hasActiveTimer && Boolean(stepTimerTuple?.[1]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Восстановление таймера после возврата на экран/в приложение.
  useEffect(() => {
    if (!showTimer || status !== "IN_PROGRESS") return;
    if (isTimerActiveFor(courseId, dayOnCourseId, index)) return;

    let cancelled = false;
    void restoreTimerFromStorage(courseId, dayOnCourseId, index).then((remainingSec) => {
      if (cancelled) return;
      if (remainingSec === 0) {
        stopTimer(courseId, dayOnCourseId, index);
        onCompleteRef.current();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    showTimer,
    status,
    courseId,
    dayOnCourseId,
    index,
    isTimerActiveFor,
    restoreTimerFromStorage,
    stopTimer,
  ]);

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
    restoreTimerFromStorage,
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

  const stepTypeLabel = isBreak
    ? "Перерыв"
    : isDiary
      ? "Дневник успехов"
      : stepNumber != null
        ? `Упражнение #${stepNumber}`
        : `#${index + 1}`;
  const stepSubtitle =
    stepType === "BREAK" ? stepData?.title ?? "" : `«${stepData?.title ?? "Шаг"}»`;
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
      ]}
    >
      <View style={styles.surfaceContent}>
        {/* Две строки: 1 — название по центру, 2 — Подробнее/Скрыть + статус */}
        <Pressable
          onPress={() => {
            void hapticFeedback.selection();
            onToggle();
          }}
          style={styles.header}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isOpen ? "Скрыть шаг" : "Подробнее о шаге"}
        >
          {(stepSubtitle || stepTypeLabel) ? (
            <Text
              style={styles.stepTitleLine}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {stepSubtitle || stepTypeLabel}
            </Text>
          ) : null}
          <View style={styles.headerRowExpand}>
            <View style={styles.expandControl}>
              <MaterialCommunityIcons
                name={isOpen ? "chevron-up" : "chevron-down"}
                size={22}
                color={WEB.stepBorder}
              />
              <Text style={styles.expandText}>
                {isOpen ? "Скрыть" : "Подробнее"}
              </Text>
            </View>
            <View style={styles.stepStatusConfig}>
              <Text style={styles.stepStatusText}>
                {statusConfig.emoji} {statusText}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* Контент (раскрывающийся); pointerEvents: на iOS свёрнутый слой не должен перехватывать тапы */}
        <Animated.View
          style={[styles.content, animatedStyle]}
          pointerEvents={isOpen ? "auto" : "none"}
        >
          {isOpen && (
            <View style={styles.stepContentInner}>
              <Divider style={styles.divider} />

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
                        <Pressable
                          style={({ pressed }) => [
                            styles.completeBtn,
                            pressed && styles.completeBtnPressed,
                            (isSavingDiary || !diaryContent.trim()) && styles.diarySaveBtnDisabled,
                          ]}
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
                                typeof stepData?.title === "string" ? stepData.title : undefined,
                              );
                              void hapticFeedback.success();
                              setDiaryContent("");
                              setDiaryError(null);
                            } finally {
                              setIsSavingDiary(false);
                            }
                          }}
                        >
                          <Text style={styles.completeBtnText}>
                            {isSavingDiary ? "Сохранение…" : "Сохранить"}
                          </Text>
                        </Pressable>
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
                        <MaterialCommunityIcons name="play-circle-outline" size={72} color="#fff" />
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
                    ) : isLoadingVideo && !offlineVideoUri ? (
                      <View style={styles.videoLoadingContainer}>
                        <Text style={styles.videoLoadingText}>Загрузка видео...</Text>
                      </View>
                    ) : videoError && !offlineVideoUri ? null : effectivePlaybackUrl ? (
                      <VideoPlayer
                        key={`${effectivePlaybackUrl}-${videoRetryKey}`}
                        uri={effectivePlaybackUrl}
                        onRetry={() => setVideoRetryKey((k) => k + 1)}
                      />
                    ) : userRequestedPlay ? (
                      <View style={styles.videoLoadingContainer}>
                        <Text style={styles.videoLoadingText}>
                          Не удалось открыть видео. Попробуйте ещё раз или откройте ссылку в браузере.
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
                                  const started = startTimer(courseId, dayOnCourseId, index, duration);
                                  if (!started) return;
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
                                  void hapticFeedback.light();
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
                                  void hapticFeedback.medium();
                                  const remaining =
                                    localState?.timeLeft ?? localState?.remainingSec ?? duration;
                                  const resumed = startTimer(courseId, dayOnCourseId, index, remaining);
                                  if (!resumed) return;
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
                                void hapticFeedback.selection();
                                stopTimer(courseId, dayOnCourseId, index);
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
                    reportClientError(error instanceof Error ? error : new Error(String(error)), {
                      issueKey: "AccordionStep",
                      keys: { operation: "timer_display", stepIndex: index },
                    });
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
                        onPress={() => {
                          void hapticFeedback.light();
                          onComplete?.();
                        }}
                      >
                        <Text style={styles.completeBtnText}>Я выполнил</Text>
                      </Pressable>
                    </View>
                  )
                ) : isTheory && !isCompleted ? (
                  <View style={styles.completeAction}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.completeBtn,
                        pressed && styles.completeBtnPressed,
                      ]}
                        onPress={() => {
                          void hapticFeedback.light();
                          onComplete?.();
                        }}
                      >
                        <Text style={styles.completeBtnText}>Прочитано</Text>
                    </Pressable>
                  </View>
                ) : isCompleted ? (
                  <View style={styles.completedBadge}>
                    <MaterialCommunityIcons name="check" size={16} color={COLORS.success} />
                    <Text style={styles.completedText}>Выполнено</Text>
                  </View>
                ) : null}
              </View>
            </View>
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

// Цвета как в web Day.module.css
const WEB = {
  stepBorder: "#636128",
  stepTitleText: "#352e2e",
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
    paddingVertical: Math.round(SPACING.md * 0.75),
    paddingHorizontal: 20,
    marginBottom: SPACING.md,
  },
  surfaceContent: {
    overflow: "hidden",
    width: "100%",
  },
  header: {
    flexDirection: "column",
    gap: 4,
    width: "100%",
  },
  stepTitleLine: {
    fontSize: 15,
    fontWeight: "400",
    color: WEB.stepTitleText,
    fontFamily: FONTS.montserrat,
    lineHeight: 20,
    width: "100%",
    textAlign: "center",
  },
  headerRowExpand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 2,
  },
  expandControl: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  expandText: {
    fontSize: 13,
    fontWeight: "500",
    color: WEB.stepBorder,
    fontFamily: FONTS.montserrat,
    marginLeft: 4,
  },
  stepStatusConfig: {
    flexShrink: 0,
  },
  stepStatusText: {
    fontSize: 13,
    fontWeight: "400",
    color: WEB.stepTitleText,
    fontFamily: FONTS.montserrat,
    lineHeight: 18,
  },
  content: {
    overflow: "hidden",
  },
  /** Без вложенного ScrollView — иначе при тапах по кнопкам шага родительский ScrollView экрана дёргается на несколько px */
  stepContentInner: {
    paddingBottom: 0,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
  },
  divider: {
    marginHorizontal: SPACING.md,
  },
  descriptionSection: {
    marginTop: SPACING.md,
    paddingHorizontal: 0,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
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
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
  },
  imagesSection: {
    marginTop: SPACING.md,
    alignSelf: "stretch",
  },
  stepTrainerImage: {
    width: "100%",
    aspectRatio: 16 / 9,
    marginBottom: SPACING.sm,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
    alignSelf: "center",
  },
  imageViewerRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  imageViewerHeader: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-start",
  },
  imageViewerPage: {
    backgroundColor: "#000",
    justifyContent: "center",
  },
  /** Паритет с web .stepInfo + StepDiaryBlock */
  diaryStepInfo: {
    marginTop: SPACING.md,
    gap: 12,
    marginBottom: 16,
  },
  diarySectionTitle: {
    fontWeight: "700",
    color: WEB.stepTitleText,
    marginBottom: 6,
    fontSize: 15,
  },
  diaryTextarea: {
    width: "100%",
    minHeight: 120,
    padding: 12,
    borderWidth: 2,
    borderColor: WEB.timerCardBorder,
    borderRadius: 8,
    fontSize: 16,
    textAlignVertical: "top",
    color: COLORS.text,
    backgroundColor: "#fff",
  },
  diaryError: {
    color: "#b71c1c",
    fontSize: 14,
  },
  diarySaveAction: {
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  diarySaveBtnDisabled: {
    opacity: 0.6,
  },
  diaryEntriesList: {
    gap: 12,
  },
  diaryEntryItem: {
    padding: 12,
    backgroundColor: WEB.timerCardBg,
    borderWidth: 1,
    borderColor: WEB.timerCardBorder,
    borderRadius: 8,
  },
  diaryEntryTitle: {
    fontWeight: "700",
    color: WEB.stepTitleText,
    fontSize: 15,
  },
  diaryEntryDate: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },
  diaryEntryContent: {
    marginTop: 8,
    fontSize: 15,
    color: WEB.stepTitleText,
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
  embedWebViewWrap: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  embedWebView: {
    width: "100%",
    backgroundColor: "#000",
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

export const AccordionStep = memo(AccordionStepComponent);
