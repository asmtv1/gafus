import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Share,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Text, Surface, Snackbar } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useShallow } from "zustand/react/shallow";
import { declineRussianName } from "@gafus/core-client/utils/personalization";
import { calculateDayStatus, getDayDisplayStatus } from "@gafus/core-client/utils/training";

import { Button, Input, Loading } from "@/shared/components/ui";
import { AppBackButton, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { useTrainingDays } from "@/shared/hooks";
import { useAuthStore, useOfflineStore, useStepStatesForCourse } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { coursesApi, trainingApi, type PublicPaidCourseOutline, type TrainingDay } from "@/shared/lib/api";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING, FONTS } from "@/shared/config";
import { DAY_TYPE_LABELS } from "@/shared/lib/training/dayTypes";
import { showLockedDayAlert } from "@/shared/lib/utils/alerts";
import { CourseDescription } from "@/features/training";
import { reportClientError } from "@/shared/lib/tracer";
import { trackEvent } from "@/shared/lib/analytics";
import { useAppSubscriptionStatus } from "@/features/app-subscription";

/**
 * Экран списка дней тренировок курса
 */
export default function TrainingDaysScreen() {
  const { courseType, personalize } = useLocalSearchParams<{
    courseType: string;
    personalize?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const trainingScreenPath = `/training/${courseType}`;

  const { data, isLoading, error, refetch, isRefetching } = useTrainingDays(courseType);
  const courseData = data?.success && data.data ? data.data : undefined;
  const stepStates = useStepStatesForCourse(courseData?.courseId ?? "");
  const {
    status: downloadStatus,
    downloadQueue,
    downloaded,
    startDownload,
    cancelDownload,
    removeFromQueue,
    removeDownload,
  } = useOfflineStore(
    useShallow((s) => ({
      status: s.status,
      downloadQueue: s.downloadQueue,
      downloaded: s.downloaded,
      startDownload: s.startDownload,
      cancelDownload: s.cancelDownload,
      removeFromQueue: s.removeFromQueue,
      removeDownload: s.removeDownload,
    })),
  );
  const isDownloaded = !!downloaded[courseType];
  // Match the existing GET /offline/course/download subscription gate.
  // Read-only UI eligibility, not an offline entitlement/expiry grant.
  const offlineSubscription = useAppSubscriptionStatus();
  const subscription = offlineSubscription.data?.success
    ? offlineSubscription.data.data
    : null;
  const mayRequestOfflineDownload =
    subscription?.hasActiveSubscription === true &&
    (subscription.planCode === "MONTHLY" || subscription.planCode === "THREE_MONTHS");
  const isCheckingOfflinePlan = offlineSubscription.isLoading || offlineSubscription.isFetching;
  const isDownloadingThis = downloadStatus.status === "downloading" && downloadStatus.courseType === courseType;
  const isInQueue = downloadQueue.includes(courseType);
  const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
  // Locked-course catalog metadata is public, but a pending read still belongs to
  // the current course/principal epoch and must not survive its old screen.
  type PreviewRead = {
    scope: string;
    state: "loading" | "ready" | "error" | "notfound";
    course: PublicPaidCourseOutline | null;
  };
  const [previewRead, setPreviewRead] = useState<PreviewRead | null>(null);
  const [previewRetry, setPreviewRetry] = useState(0);
  const previewFlight = useRef<{ scope: string; cancelled: boolean } | null>(null);
  const previewRetryQueued = useRef(false);
  const previewMounted = useRef(true);
  const previewOwner = useAuthStore((state) =>
    state.isAuthenticated && !state.isLoading ? (state.user?.id ?? null) : null,
  );
  const previewAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const previewAuthLoading = useAuthStore((state) => state.isLoading);
  const previewBinding = newOnlyV2NativeQueues.getVerifiedBinding();
  const previewEpoch =
    previewOwner && previewBinding?.principalId === previewOwner ? previewBinding.authEpoch : null;
  const previewScope = JSON.stringify([
    courseType,
    previewAuthenticated ? previewOwner : "guest",
    previewEpoch,
  ]);
  const activePreviewScope = useRef(previewScope);
  activePreviewScope.current = previewScope;
  const previewDenied = useRef(false);
  const [userDisplayName, setUserDisplayName] = useState("");
  const [userGender, setUserGender] = useState<"male" | "female">("male");
  const [petName, setPetName] = useState("");
  const [petGender, setPetGender] = useState<"male" | "female" | null>(null);
  const [petNameGen, setPetNameGen] = useState("");
  const [petNameDat, setPetNameDat] = useState("");
  const [petNameAcc, setPetNameAcc] = useState("");
  const [petNameIns, setPetNameIns] = useState("");
  const [petNamePre, setPetNamePre] = useState("");
  const [isSavingPersonalization, setIsSavingPersonalization] = useState(false);

  const isAccessDenied =
    (data && "code" in data && data.code === "FORBIDDEN") ||
    error?.message?.includes("COURSE_ACCESS_DENIED") ||
    (data && "code" in data && (data.code === "SUBSCRIPTION_REQUIRED" ||
      data.code === "SUBSCRIPTION_OR_CREDITS_REQUIRED")) ||
    (data && "error" in data && typeof data.error === "string" && data.error.includes("доступа")) ||
    (!data?.success && data && "code" in data && data.code === "FORBIDDEN");
  previewDenied.current = Boolean(isAccessDenied);
  const visiblePreviewRead = previewRead?.scope === previewScope ? previewRead : null;
  const coursePreview = visiblePreviewRead?.state === "ready" ? visiblePreviewRead.course : null;
  // The public marketing endpoint itself rejects private/non-paid courses.
  // Actual day/step access still comes from protected GET /training/day.
  const canBrowsePreviewDays = Boolean(
    previewAuthenticated && previewOwner && previewEpoch && coursePreview,
  );
  const previewIsReady = visiblePreviewRead?.state === "ready";
  const previewIsLoading = visiblePreviewRead?.state === "loading";
  const previewIsError = visiblePreviewRead?.state === "error";
  const previewNotFound = visiblePreviewRead?.state === "notfound";
  const retryCoursePreview = () => {
    if (
      !isAccessDenied ||
      !previewIsError ||
      previewRetryQueued.current ||
      (previewFlight.current?.scope === previewScope && !previewFlight.current.cancelled)
    )
      return;
    previewRetryQueued.current = true;
    setPreviewRetry((value) => value + 1);
  };
  const userCoursePersonalization = courseData?.userCoursePersonalization;
  const needPersonalization = Boolean(
    (courseData?.courseIsPersonalized && !userCoursePersonalization) || personalize === "1",
  );

  useEffect(() => {
    const existing = userCoursePersonalization;
    if (!existing) return;
    setUserDisplayName(existing.userDisplayName ?? "");
    setUserGender(existing.userGender === "female" ? "female" : "male");
    setPetName(existing.petName ?? "");
    setPetGender(existing.petGender ?? null);
    setPetNameGen(existing.petNameGen ?? "");
    setPetNameDat(existing.petNameDat ?? "");
    setPetNameAcc(existing.petNameAcc ?? "");
    setPetNameIns(existing.petNameIns ?? "");
    setPetNamePre(existing.petNamePre ?? "");
  }, [userCoursePersonalization]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  /* F12: не на каждом рендере — только смена курса; courseId подставляется при наличии */
  useEffect(() => {
    if (!courseType) {
      return;
    }
    trackEvent({
      eventName: "course_open",
      platform: "mobile",
      pathOrScreen: trainingScreenPath,
      courseType,
      courseId: courseData?.courseId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- намеренно только courseType (F12)
  }, [courseType]);

  const handleFillDeclensions = useCallback(() => {
    void hapticFeedback.light();
    const trimmed = petName.trim();
    if (!trimmed) return;
    const gender =
      petGender === "male" || petGender === "female" ? petGender : undefined;
    const result = declineRussianName(trimmed, gender);
    setPetNameGen(result.genitive);
    setPetNameDat(result.dative);
    setPetNameAcc(result.accusative);
    setPetNameIns(result.instrumental);
    setPetNamePre(result.prepositional);
  }, [petName, petGender]);

  const handleSavePersonalization = useCallback(async () => {
    const courseId = courseData?.courseId;
    if (!courseId) {
      setSnackbar({ visible: true, message: "Данные курса не загружены. Обновите экран." });
      return;
    }
    const trimmedUserDisplayName = userDisplayName.trim();
    const trimmedPetName = petName.trim();
    if (!trimmedUserDisplayName) {
      setSnackbar({ visible: true, message: "Укажите имя." });
      return;
    }
    if (!trimmedPetName) {
      setSnackbar({ visible: true, message: "Укажите кличку питомца." });
      return;
    }

    setIsSavingPersonalization(true);
    const response = await coursesApi.savePersonalization({
      courseId,
      userDisplayName: trimmedUserDisplayName,
      userGender,
      petName: trimmedPetName,
      petGender,
      petNameGen: petNameGen.trim() || null,
      petNameDat: petNameDat.trim() || null,
      petNameAcc: petNameAcc.trim() || null,
      petNameIns: petNameIns.trim() || null,
      petNamePre: petNamePre.trim() || null,
    });

    if (!response.success) {
      setSnackbar({
        visible: true,
        message: response.error ?? "Не удалось сохранить персонализацию.",
      });
      setIsSavingPersonalization(false);
      return;
    }

    await refetch();
    router.replace(`/training/${courseType}`);
    setSnackbar({ visible: true, message: "Персонализация сохранена." });
    setIsSavingPersonalization(false);
  }, [
    courseData?.courseId,
    courseType,
    petGender,
    petName,
    petNameAcc,
    petNameDat,
    petNameGen,
    petNameIns,
    petNamePre,
    refetch,
    router,
    userDisplayName,
    userGender,
  ]);

  useEffect(() => {
    previewMounted.current = true;
    return () => {
      previewMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      !isAccessDenied ||
      previewIsReady ||
      previewAuthLoading ||
      (previewAuthenticated && !previewOwner)
    )
      return;

    const priorFlight = previewFlight.current;
    if (priorFlight?.scope === previewScope && !priorFlight.cancelled) return;
    const flight = { scope: previewScope, cancelled: false };
    previewFlight.current = flight;
    previewRetryQueued.current = false;
    setPreviewRead({ scope: previewScope, state: "loading", course: null });
    const currentPreview = () => {
      const auth = useAuthStore.getState();
      if (
        flight.cancelled ||
        !previewMounted.current ||
        auth.isLoading ||
        activePreviewScope.current !== previewScope ||
        !previewDenied.current ||
        previewFlight.current !== flight
      )
        return false;
      if (!previewAuthenticated) return !auth.isAuthenticated;
      const binding = newOnlyV2NativeQueues.getVerifiedBinding();
      // A public marketing GET can load before the verified queue binding
      // becomes available; opening a protected day still requires that binding.
      return auth.isAuthenticated && auth.user?.id === previewOwner &&
        (previewEpoch
          ? binding?.principalId === previewOwner && binding.authEpoch === previewEpoch
          : !binding);

    };

    void (async () => {
      try {
        if (!currentPreview()) return;
        const response = await trainingApi.getPublicPaidCourseOutline(courseType, currentPreview);
        if (!currentPreview()) return;
        if (!response.success || !response.data) {
          setPreviewRead({
            scope: previewScope,
            state: response.code === "NOT_FOUND" ||
              response.error === "Курс не найден" ? "notfound" : "error",
            course: null,
          });
          return;
        }
        setPreviewRead({ scope: previewScope, state: "ready", course: response.data });
      } catch {
        if (currentPreview()) {
          setPreviewRead({ scope: previewScope, state: "error", course: null });
          reportClientError(new Error("COURSE_LOCKED_PREVIEW_READ_FAILED"), {
            issueKey: "TrainingDays",
            keys: { operation: "locked_preview_read" },
          });
        }
      } finally {
        if (previewFlight.current === flight) previewFlight.current = null;
      }
    })();
    return () => {
      flight.cancelled = true;
    };
  }, [
    courseType,
    previewScope,
    previewRetry,
    previewIsReady,
    isAccessDenied,
    previewOwner,
    previewEpoch,
    previewAuthenticated,
    previewAuthLoading,
  ]);

  const handleDayPress = useCallback(
    (day: TrainingDay) => {
      void hapticFeedback.selection();
      if (day.isLocked) {
        showLockedDayAlert();
        return;
      }
      router.push(`/training/${courseType}/${day.dayOnCourseId}`);
    },
    [router, courseType],
  );

  const handleReviewsPress = useCallback(() => {
    void hapticFeedback.selection();
    router.push({
      pathname: "/training/[courseType]/reviews",
      params: { courseType },
    });
  }, [courseType, router]);

  const courseReviewsLink = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Отзывы о курсе"
      onPress={handleReviewsPress}
      style={styles.reviewsLink}
    >
      <MaterialCommunityIcons name="comment-text-outline" size={18} color={COLORS.primary} />
      <Text style={styles.reviewsLinkText}>Отзывы о курсе</Text>
    </Pressable>
  );

  const handleShareCourse = useCallback(async () => {
    const url = `https://gafus.ru/trainings/${courseType}`;
    const message = [courseType, courseData?.courseDescription, url].filter(Boolean).join("\n\n");
    try {
      await Share.share({
        title: `Курс: ${courseType}`,
        message,
        url,
      });
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "TrainingDaysScreen",
        severity: "warning",
        keys: { operation: "share_course_fallback_clipboard" },
      });
      await Clipboard.setStringAsync(url);
      setSnackbar({ visible: true, message: "Ссылка скопирована" });
    }
  }, [courseType, courseData?.courseDescription]);

  const renderDayItem = useCallback(
    ({ item, index }: { item: TrainingDay; index: number }) => {
      // Если нет courseId, все равно показываем дни (courseId может быть в courseData)
      if (!courseData) {
        if (__DEV__) {
          console.warn(
            "[TrainingDaysScreen] renderDayItem: courseData is undefined for index",
            index,
          );
        }
        return null;
      }

      const courseId = courseData.courseId;

      if (!courseId && __DEV__) {
        console.warn("[TrainingDaysScreen] courseId is missing in courseData", courseData);
      }

      // Вычисляем локальный статус дня из stepStore (как на web); RESET приоритетнее серверного COMPLETED
      const effectiveCourseId = courseId || courseType;
      const localStatus = calculateDayStatus(effectiveCourseId, item.dayOnCourseId, stepStates);
      const finalStatus = getDayDisplayStatus(localStatus, item.userStatus ?? undefined);

      const isCompleted = finalStatus === "COMPLETED";
      const isInProgress = finalStatus === "IN_PROGRESS";
      const isReset = finalStatus === "RESET";

      // Определяем цвет границы в зависимости от статуса (как на web)
      const borderColor = isCompleted
        ? "#B6C582" // Зеленый для завершенных (как на web)
        : isInProgress
          ? "#F6D86E" // Желтый для в процессе (как на web)
          : isReset
            ? "#b0aeae" // Серый для сброшенного (как на web)
            : "transparent";

      const isLocked = item.isLocked ?? false;

      return (
        <Pressable onPress={() => handleDayPress(item)}>
          <View style={[styles.dayCardWrapper, { borderColor }]}>
            {/* Бейджи времени (как на web) */}
            {((item.estimatedDuration || 0) > 0 || (item.theoryMinutes || 0) > 0) && (
              <View style={styles.timeBadgeWrapper}>
                {(item.estimatedDuration || 0) > 0 && (
                  <View style={styles.timeBadge}>
                    <Text style={styles.timeBadgeText}>{item.estimatedDuration}</Text>
                    <Text style={styles.timeBadgeLabel}>мин</Text>
                  </View>
                )}
                {(item.theoryMinutes || 0) > 0 && (
                  <View style={styles.timeBadgeTheory}>
                    <Text style={styles.timeBadgeTheoryText}>{item.theoryMinutes}</Text>
                    <Text style={styles.timeBadgeTheoryLabel}>мин</Text>
                  </View>
                )}
              </View>
            )}
            <Surface style={[styles.dayCard, isLocked && styles.dayCardLocked]} elevation={1}>
              {isLocked && (
                <View style={styles.lockBadge}>
                  <MaterialCommunityIcons name="lock" size={18} color="#8b8a3b" />
                  <Text style={styles.lockBadgeText}>Заблокировано</Text>
                </View>
              )}
              <Text style={styles.dayTitle}>{item.title}</Text>
              <Text style={styles.subtitle}>({DAY_TYPE_LABELS[item.type] ?? item.type})</Text>
              <Text style={styles.equipmentLabel}>Что понадобится:</Text>
              <Text style={styles.equipment}>{item.equipment || "вкусняшки и терпение"}</Text>
            </Surface>
          </View>
        </Pressable>
      );
    },
    [courseData, courseType, stepStates, handleDayPress],
  );

  if (isLoading) {
    return <Loading fullScreen message="Загрузка тренировок..." />;
  }

  if (isAccessDenied) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <AppBackButton style={styles.backRow} onPress={() => { void hapticFeedback.light(); router.back(); }} />

        <ScrollView contentContainerStyle={styles.paywallScrollContent}>
          {/* As on Web: the course outline stays open; payments are step-scoped. */}
          <Text style={styles.paywallContentTitle}>Содержание</Text>
          {courseReviewsLink}

          {previewIsLoading && <Loading message="Загрузка описания курса…" />}
          {previewIsError && (
            <View>
              <Text accessibilityRole="alert">Не удалось загрузить описание курса.</Text>
              <Button label="Повторить загрузку описания курса" onPress={retryCoursePreview} />
            </View>
          )}
          {previewNotFound && <Text>Курс не найден в каталоге.</Text>}
          {coursePreview?.description ? (
            <CourseDescription
              description={coursePreview.description}
              equipment={coursePreview.equipment ?? null}
              trainingLevel={coursePreview.trainingLevel}
              onShare={handleShareCourse}
              courseType={courseType}
            />
          ) : null}

          {coursePreview?.outline?.length ? (
            <View style={styles.outlineSection}>
              <Text style={styles.outlineTitle}>План занятий</Text>
              <Text style={styles.outlineAccessHint}>
                {canBrowsePreviewDays
                  ? "Выберите день, чтобы посмотреть шаги."
                  : "Войдите в аккаунт, чтобы просмотреть шаги."}
              </Text>
              <View style={styles.outlineCards}>
                {coursePreview.outline
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((item, index) => {
                    const dayLink = typeof item.id === "string" &&
                      /^[A-Za-z0-9_-]{1,128}$/.test(item.id) ? item.id : null;
                    const canOpen = canBrowsePreviewDays && dayLink !== null;
                    const hasPracticeTime = (item.estimatedDuration ?? 0) > 0;
                    const hasTheoryTime = (item.theoryMinutes ?? 0) > 0;
                    return (
                      <Pressable
                        key={`${item.order}-${item.id}`}
                        disabled={!canOpen}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.title}. ${canOpen ? "Открыть шаги" : "Недоступно"}`}
                        onPress={() => {
                          if (!canOpen || !dayLink) return;
                          void hapticFeedback.selection();
                          router.push(`/training/${courseType}/${dayLink}`);
                        }}
                        style={({ pressed }) => [
                          styles.outlineDayCard,
                          pressed && canOpen && styles.outlineDayCardPressed,
                          !canOpen && styles.outlineDayCardDisabled,
                        ]}
                      >
                        <View style={styles.outlineDayMeta}>
                          <Text style={styles.outlineDayNumber}>
                            {`Блок ${String(index + 1).padStart(2, "0")}`}
                          </Text>
                          <Text style={styles.outlineDayState}>
                            {canOpen ? "Шаги внутри" : "Просмотр недоступен"}
                          </Text>
                        </View>
                        <Text style={styles.outlineDayTitle}>{item.title}</Text>
                        {item.type ? (
                          <Text style={styles.outlineDayType}>
                            {DAY_TYPE_LABELS[item.type] ?? item.type}
                          </Text>
                        ) : null}
                        {item.equipment?.trim() && item.equipment.trim() !== "-" ? (
                          <Text style={styles.outlineDayEquipment}>
                            {`Понадобится: ${item.equipment.trim()}`}
                          </Text>
                        ) : null}
                        <View style={styles.outlineDayFooter}>
                          <View style={styles.outlineDayDurations}>
                            {hasPracticeTime && (
                              <View style={styles.outlineDayDuration}>
                                <MaterialCommunityIcons
                                  name="clock-outline" size={15} color="#555e3c"
                                />
                                <Text style={styles.outlineDayDurationText}>
                                  {`Практика · ${item.estimatedDuration} мин`}
                                </Text>
                              </View>
                            )}
                            {hasTheoryTime && (
                              <View style={styles.outlineDayDuration}>
                                <MaterialCommunityIcons
                                  name="book-open-outline" size={15} color="#555e3c"
                                />
                                <Text style={styles.outlineDayDurationText}>
                                  {`Теория · ${item.theoryMinutes} мин`}
                                </Text>
                              </View>
                            )}
                            {!hasPracticeTime && !hasTheoryTime && (
                              <Text style={styles.outlineDayDurationUnknown}>
                                Длительность не указана
                              </Text>
                            )}
                          </View>
                          <View style={styles.outlineDayArrow}>
                            <MaterialCommunityIcons
                              name={canOpen ? "arrow-right" : "lock-outline"}
                              size={20} color={canOpen ? "#4e5e33" : "#8c897e"}
                            />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
              </View>
            </View>
          ) : null}


        </ScrollView>

        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ visible: false, message: "" })}
          duration={2000}
        >
          {snackbar.message}
        </Snackbar>
      </SafeAreaView>
    );
  }

  if (needPersonalization) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 12 : 0}
        >
          <AppBackButton style={styles.backRow} onPress={() => { void hapticFeedback.light(); router.back(); }} />
          <ScrollView
            contentContainerStyle={styles.personalizationScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            showsVerticalScrollIndicator={true}
          >
            <View style={styles.personalizationCard}>
              <Text style={styles.personalizationTitle}>Персонализация курса</Text>
              <Text style={styles.personalizationText}>
                Заполните данные для персонализированного курса, чтобы продолжить тренировки.
              </Text>

              <Input
                label="Ваше имя"
                value={userDisplayName}
                onChangeText={setUserDisplayName}
                style={styles.personalizationInput}
                autoCapitalize="words"
              />

              <Text style={styles.personalizationLabel}>Ваш пол</Text>
              <View style={styles.genderRow}>
                <Pressable
                  onPress={() => {
                    void hapticFeedback.selection();
                    setUserGender("male");
                  }}
                  style={[
                    styles.genderButton,
                    userGender === "male" && styles.genderButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.genderButtonText,
                      userGender === "male" && styles.genderButtonTextActive,
                    ]}
                  >
                    Мужской
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void hapticFeedback.selection();
                    setUserGender("female");
                  }}
                  style={[
                    styles.genderButton,
                    userGender === "female" && styles.genderButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.genderButtonText,
                      userGender === "female" && styles.genderButtonTextActive,
                    ]}
                  >
                    Женский
                  </Text>
                </Pressable>
              </View>

              <Input
                label="Кличка питомца"
                value={petName}
                onChangeText={setPetName}
                onBlur={handleFillDeclensions}
                style={styles.personalizationInput}
                autoCapitalize="words"
              />

              <Text style={styles.personalizationLabel}>
                Пол питомца (опционально). Нужен для правильного склонения клички
              </Text>
              <View style={styles.genderRow}>
                <Pressable
                  onPress={() => {
                    void hapticFeedback.selection();
                    setPetGender("male");
                  }}
                  style={[
                    styles.genderButton,
                    petGender === "male" && styles.genderButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.genderButtonText,
                      petGender === "male" && styles.genderButtonTextActive,
                    ]}
                  >
                    Самец
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void hapticFeedback.selection();
                    setPetGender("female");
                  }}
                  style={[
                    styles.genderButton,
                    petGender === "female" && styles.genderButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.genderButtonText,
                      petGender === "female" && styles.genderButtonTextActive,
                    ]}
                  >
                    Самка
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void hapticFeedback.selection();
                    setPetGender(null);
                  }}
                  style={[
                    styles.genderButton,
                    petGender == null && styles.genderButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.genderButtonText,
                      petGender == null && styles.genderButtonTextActive,
                    ]}
                  >
                    Не указывать
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.personalizationLabel}>Склонения клички</Text>
              <Input
                label="Родительный (кого? — нет кого)"
                value={petNameGen}
                onChangeText={setPetNameGen}
                style={styles.personalizationInput}
                placeholder="Например: Барсика"
              />
              <Input
                label="Дательный (кому?)"
                value={petNameDat}
                onChangeText={setPetNameDat}
                style={styles.personalizationInput}
                placeholder="Например: Барсику"
              />
              <Input
                label="Винительный (кого? — вижу кого)"
                value={petNameAcc}
                onChangeText={setPetNameAcc}
                style={styles.personalizationInput}
                placeholder="Например: Барсика"
              />
              <Input
                label="Творительный (кем?)"
                value={petNameIns}
                onChangeText={setPetNameIns}
                style={styles.personalizationInput}
                placeholder="Например: Барсиком"
              />
              <Input
                label="Предложный (о ком?)"
                value={petNamePre}
                onChangeText={setPetNamePre}
                style={styles.personalizationInput}
                placeholder="Например: о Барсике"
              />
              <Button
                label="Подставить склонения"
                fullWidth={false}
                height={32}
                fontFamily={FONTS.montserrat}
                fontSize={13}
                lineHeight={16}
                horizontalPadding={12}
                verticalPadding={8}
                borderRadius={8}
                style={styles.personalizationFillButtonLayout}
                haptic={false}
                onPress={handleFillDeclensions}
              />

              <View style={styles.personalizationButtons}>
                <Button
                  label={isSavingPersonalization ? "Сохранение..." : "Сохранить и продолжить"}
                  height={42}
                  fontFamily={FONTS.montserratBold}
                  fontWeight="700"
                  fontSize={15}
                  lineHeight={18}
                  horizontalPadding={SPACING.md}
                  verticalPadding={12}
                  borderRadius={10}
                  haptic={false}
                  onPress={() => {
                    void hapticFeedback.light();
                    void handleSavePersonalization();
                  }}
                  disabled={isSavingPersonalization}
                />
                <AppBackButton label="Назад к курсам" onPress={() => {
                  void hapticFeedback.light();
                  router.replace("/(main)/(tabs)/courses" as const);
                }} />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ visible: false, message: "" })}
          duration={2000}
        >
          {snackbar.message}
        </Snackbar>
      </SafeAreaView>
    );
  }

  if (error || !data?.success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={COLORS.error} />
          <Text style={styles.errorText}>Ошибка загрузки курса</Text>
          <Pressable
            onPress={() => {
              void hapticFeedback.light();
              refetch();
            }}
          >
            <Text style={styles.retryText}>Попробовать снова</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <AppBackButton style={styles.backRow} onPress={() => { void hapticFeedback.light(); router.back(); }} />
        {courseData?.courseIsPersonalized && courseData?.userCoursePersonalization && (
          <Pressable
            style={styles.changePersonalizationRow}
            onPress={() => {
              void hapticFeedback.light();
              router.replace(`/training/${courseType}?personalize=1`);
            }}
          >
            <Text style={styles.changePersonalizationText}>Изменить персонализацию</Text>
          </Pressable>
        )}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={true}
        >
          {/* Офлайн: скачать / прогресс / очередь */}
          <Surface style={styles.offlineSection} elevation={0}>
            {isDownloaded ? (
              <View style={styles.offlineRow}>
                <MaterialCommunityIcons name="check-circle" size={22} color={COLORS.primary} />
                <Text style={styles.offlineLabel}>Скачано для офлайна</Text>
                <Pressable
                  onPress={() => {
                    void hapticFeedback.light();
                    removeDownload(courseType);
                  }}
                  style={styles.offlineButton}
                >
                  <Text style={styles.offlineButtonText}>Удалить</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.offlineRow}>
                  <MaterialCommunityIcons name="download" size={22} color={COLORS.primary} />
                  <Text style={styles.offlineLabel}>Скачать для офлайна</Text>
                  {!isDownloadingThis && !isInQueue && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Скачать курс для офлайна"
                      accessibilityState={{
                        disabled: !mayRequestOfflineDownload || isCheckingOfflinePlan,
                      }}
                      disabled={!mayRequestOfflineDownload || isCheckingOfflinePlan}
                      onPress={() => {
                        if (!mayRequestOfflineDownload || isCheckingOfflinePlan) return;
                        void hapticFeedback.light();
                        startDownload(courseType);
                      }}
                      style={styles.offlineButton}
                    >
                      <Text style={[
                        styles.offlineButtonText,
                        (!mayRequestOfflineDownload || isCheckingOfflinePlan) &&
                          styles.offlineButtonDisabledText,
                      ]}>
                        {isCheckingOfflinePlan ? "Проверяем тариф…" :
                          mayRequestOfflineDownload ? "Скачать" : "Скачивание — от 1 месяца"}
                      </Text>
                    </Pressable>
                  )}
                  {isDownloadingThis && (
                    <Pressable
                      onPress={() => {
                        void hapticFeedback.light();
                        cancelDownload();
                      }}
                      style={styles.offlineButton}
                    >
                      <Text style={styles.offlineButtonText}>Отменить</Text>
                    </Pressable>
                  )}
                  {isInQueue && (
                    <Pressable
                      onPress={() => {
                        void hapticFeedback.light();
                        removeFromQueue(courseType);
                      }}
                      style={styles.offlineButton}
                    >
                      <Text style={styles.offlineButtonText}>Убрать из очереди</Text>
                    </Pressable>
                  )}
                </View>
                {isDownloadingThis && downloadStatus.status === "downloading" && (
                  <View style={styles.progressRow}>
                    <Text style={styles.progressLabel}>
                      {downloadStatus.progress.label ?? `${downloadStatus.progress.current}/${downloadStatus.progress.total}`}
                    </Text>
                  </View>
                )}
                {downloadQueue.length > 0 && !isDownloadingThis && (
                  <Text style={styles.queueHint}>В очереди: {downloadQueue.length}</Text>
                )}
              </>
            )}
          </Surface>

          {/* Заголовок "Содержание" (как на web) */}
          <Text style={styles.contentTitle}>Содержание</Text>
          {courseReviewsLink}

          {/* Описание курса (сворачиваемое, как на web) */}
          {(courseData?.courseDescription || courseData?.courseVideoUrl) && (
            <CourseDescription
              description={courseData.courseDescription}
              videoUrl={courseData.courseVideoUrl}
              equipment={courseData.courseEquipment}
              trainingLevel={courseData.courseTrainingLevel}
              onShare={handleShareCourse}
              courseType={courseType}
            />
          )}

          {/* Заголовок "План занятий:" (как на web) */}
          <Text style={styles.planTitle}>План занятий:</Text>

          {/* Список дней (как на web - все в одном ScrollView) */}
          {courseData?.trainingDays && courseData.trainingDays.length > 0 ? (
            <View style={styles.daysList}>
              {courseData.trainingDays.map((item, index) => (
                <View key={item.dayOnCourseId || item.id || `day-${index}`}>
                  {renderDayItem({ item, index })}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {isLoading
                  ? "Загрузка дней тренировок..."
                  : courseData
                    ? "Нет дней тренировок"
                    : "Не удалось загрузить данные"}
              </Text>
              {__DEV__ && courseData && (
                <Text style={styles.debugText}>
                  Debug: courseId={courseData.courseId}, days={courseData.trainingDays?.length || 0}
                </Text>
              )}
            </View>
          )}
        </ScrollView>
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
  reviewsLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
  },
  reviewsLinkText: {
    color: COLORS.primary,
    fontFamily: FONTS.montserratBold,
    fontSize: 15,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardAvoidingView: {
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
  changePersonalizationRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  changePersonalizationText: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: "500",
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
    paddingHorizontal: 0,
    paddingTop: SPACING.md,
  },
  paywallScrollContent: {
    paddingBottom: SPACING.xl,
  },
  personalizationScrollContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  personalizationCard: {
    marginTop: SPACING.md,
    padding: SPACING.lg,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#636128",
    backgroundColor: COLORS.cardBackground,
  },
  personalizationTitle: {
    fontSize: 28,
    lineHeight: 30,
    color: "#352E2E",
    fontFamily: FONTS.impact,
    marginBottom: SPACING.sm,
  },
  personalizationText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    marginBottom: SPACING.md,
  },
  personalizationInput: {
    backgroundColor: COLORS.cardBackground,
    marginBottom: SPACING.sm,
  },
  personalizationLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  genderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  genderButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
  },
  genderButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  genderButtonText: {
    fontSize: 13,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  genderButtonTextActive: {
    color: "#ffffff",
    fontFamily: FONTS.montserratBold,
  },
  personalizationFillButtonLayout: {
    alignSelf: "flex-start",
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  personalizationButtons: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  paywallContentTitle: {
    color: "#352e2e",
    fontFamily: FONTS.impact,
    fontWeight: "400",
    fontSize: 60,
    lineHeight: 60,
    textAlign: "center",
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.md,
  },
  outlineSection: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.lg,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  outlineAccessHint: {
    fontFamily: FONTS.montserrat,
    fontSize: 13,
    lineHeight: 19,
    color: "#696656",
    marginBottom: SPACING.md,
  },
  outlineTitle: {
    fontSize: 24,
    lineHeight: 30,
    color: "#374429",
    fontFamily: FONTS.impact,
    marginBottom: SPACING.xs,
  },
  outlineCards: {
    gap: 12,
  },
  outlineDayCard: {
    borderWidth: 1,
    borderColor: "#ded5bb",
    borderRadius: 18,
    backgroundColor: "#fff9eb",
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 14,
    minHeight: 146,
    shadowColor: "#3b4822",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 1,
  },
  outlineDayCardPressed: {
    backgroundColor: "#f1ead6",
    borderColor: "#92986f",
  },
  outlineDayCardDisabled: {
    opacity: 0.65,
  },
  outlineDayMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  outlineDayNumber: {
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: FONTS.montserratBold,
    color: "#636128",
  },
  outlineDayState: {
    fontSize: 11,
    fontFamily: FONTS.montserrat,
    color: "#777357",
  },
  outlineDayTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: "#352e2e",
    fontFamily: FONTS.montserratBold,
    marginBottom: 7,
  },
  outlineDayType: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: FONTS.montserrat,
    color: "#686a54",
    marginBottom: 6,
  },
  outlineDayEquipment: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONTS.montserrat,
    color: "#696656",
    marginBottom: 8,
  },
  outlineDayFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginTop: "auto",
    paddingTop: 8,
  },
  outlineDayDurations: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  outlineDayDuration: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: "#ece8d6",
  },
  outlineDayDurationText: {
    fontSize: 12,
    color: "#4d543d",
    fontFamily: FONTS.montserrat,
  },
  outlineDayDurationUnknown: {
    fontSize: 12,
    color: "#787464",
    fontFamily: FONTS.montserrat,
  },
  outlineDayArrow: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#ece8d6",
    alignItems: "center",
    justifyContent: "center",
  },
  paywallCard: {
    marginTop: SPACING.md,
    marginHorizontal: SPACING.md,
    padding: SPACING.lg,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#636128",
    backgroundColor: COLORS.cardBackground,
  },
  paywallTitle: {
    fontSize: 32,
    lineHeight: 34,
    color: "#352E2E",
    fontFamily: FONTS.impact,
    marginBottom: SPACING.sm,
  },
  paywallSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  paywallHint: {
    marginTop: SPACING.sm,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
  },
  paywallButtons: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  paywallSecondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    alignItems: "center",
  },
  paywallSecondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  ofertaHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: "center",
    fontFamily: FONTS.montserrat,
    paddingVertical: 2,
  },
  ofertaHintLink: {
    color: COLORS.primary,
    textDecorationLine: "underline",
  },
  offlineSection: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: 12,
    backgroundColor: COLORS.cardBackground,
  },
  offlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  offlineLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  offlineButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  offlineButtonText: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: "600",
  },
  offlineButtonDisabledText: {
    color: COLORS.textSecondary,
  },
  progressRow: {
    marginTop: 6,
  },
  progressLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  queueHint: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  contentTitle: {
    color: "#352e2e",
    fontFamily: FONTS.impact,
    fontWeight: "400",
    fontSize: 60,
    lineHeight: 60,
    textAlign: "center",
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  guideContent: {
    flex: 1,
    paddingTop: SPACING.md,
  },
  guideWebViewWrapper: {
    flex: 1,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    position: "relative",
  },
  guideScrollView: {
    flex: 1,
  },
  guideScrollContent: {
    paddingBottom: SPACING.xl,
    paddingHorizontal: 0,
    paddingTop: SPACING.md,
  },
  guideWebViewContainer: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    position: "relative",
  },
  guideSpinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  guideWebView: {
    flex: 1,
    width: "100%",
    backgroundColor: "#fff",
  },
  guideWebViewHidden: {
    opacity: 0,
  },
  planTitle: {
    color: "#352E2E",
    fontFamily: FONTS.impact,
    fontWeight: "600",
    fontSize: 20,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  daysList: {
    paddingBottom: SPACING.md,
  },
  dayCardWrapper: {
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.md,
    borderRadius: 12,
    borderWidth: 4, // Немного толще, чем на web (там 2px, но визуально кажется толще из-за структуры)
    position: "relative",
    backgroundColor: COLORS.cardBackground,
    minHeight: 120,
  },
  dayCard: {
    paddingVertical: Math.round(14 * 0.75),
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLORS.cardBackground,
    minHeight: 120,
  },
  dayCardLocked: {
    opacity: 0.8,
  },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  lockBadgeText: {
    fontSize: 14,
    color: "#8b8a3b",
    fontWeight: "600",
  },
  timeBadgeWrapper: {
    position: "absolute",
    top: -10,
    right: -10,
    zIndex: 2,
    flexDirection: "column",
    gap: 6,
    alignItems: "center",
  },
  timeBadge: {
    backgroundColor: "#636128",
    borderRadius: 50,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 50,
  },
  timeBadgeText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  timeBadgeLabel: {
    color: "#ffffff",
    fontSize: 12,
  },
  timeBadgeTheory: {
    backgroundColor: "#af6d34",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  timeBadgeTheoryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  timeBadgeTheoryLabel: {
    color: "#ffffff",
    fontSize: 12,
  },
  dayTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#352E2E",
    paddingRight: 60, // Место для бейджей времени
    fontFamily: FONTS.impact, // Impact как на web
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 8,
    fontFamily: FONTS.montserrat,
  },
  equipmentLabel: {
    fontSize: 14,
    color: "#352E2E",
    marginTop: 4,
    marginBottom: 2,
    fontFamily: FONTS.montserrat,
  },
  equipment: {
    fontSize: 14,
    color: "#888",
    fontStyle: "italic",
    fontFamily: FONTS.montserrat,
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
    marginBottom: SPACING.md,
  },
  retryText: {
    color: COLORS.primary,
    fontWeight: "600",
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
  emptyContainer: {
    padding: SPACING.xxl,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textSecondary,
  },
  debugText: {
    marginTop: SPACING.md,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: "monospace",
  },
});