import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, Alert, Platform } from "react-native";
import { Text } from "react-native-paper";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useShallow } from "zustand/react/shallow";

import { STEP_STATUS_LABELS } from "@gafus/core/utils/training";
import { TrainingStatus } from "@gafus/types";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { SPACING, FONTS, COLORS, API_BASE_URL } from "@/shared/config";
import { Button, MascotSpinner } from "@/shared/components/ui";
import { useOfflineStore } from "@/shared/stores";
import { reportClientError } from "@/shared/lib/tracer";
import { offlineApi } from "@/shared/lib/api/offline";
import { getCourseLogoVariantCandidates } from "@/shared/lib/utils/mobileImageVariant";
import { getCourseStartedUsersCount, type Course } from "@/shared/lib/api";
import type { MobileOnboardingTourTargetId } from "@/features/onboarding-tour";
import { useAppSubscriptionStatus } from "@/features/app-subscription";
import { TourTarget } from "@/shared/lib/tour-targets";

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Начальный",
  INTERMEDIATE: "Средний",
  ADVANCED: "Продвинутый",
  EXPERT: "Экспертный",
};

/**
 * Кэш «лого уже было показано» на время жизни JS-рантайма.
 * Нужен, чтобы при рецикле/ремоунте ячеек списка не показывать плейсхолдер повторно
 * для того же courseId + версии логотипа.
 */
const displayedCourseLogoVersionKeys = new Set<string>();
const SHOW_AUTHOR_AND_FAVORITE_BLOCK = false;
const SHOW_COURSE_RATING_AND_REVIEWS = false;

function getStatusText(status: string): string {
  return (
    STEP_STATUS_LABELS[status as TrainingStatus] ?? STEP_STATUS_LABELS[TrainingStatus.NOT_STARTED]
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case "NOT_STARTED":
      return "#352E2E";
    case "IN_PROGRESS":
      return "#006F8E";
    case "COMPLETED":
      return "#28a745";
    case "RESET":
      return "#a8a5a5";
    default:
      return "#352E2E";
  }
}

function formatDate(date: Date | string | null): string | null {
  if (!date) return null;
  /* eslint-disable @gafus/require-client-catch-tracer -- невалидная дата → null */
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("ru-RU");
  } catch {
    return null;
  }
  /* eslint-enable @gafus/require-client-catch-tracer */
}

function getReviewText(reviewsCount: number, userStatus: string): string {
  if (reviewsCount === 0) {
    return userStatus === "COMPLETED" ? "Оставить отзыв" : "Нет отзывов";
  }
  const decl = (n: number) => {
    const cases = [2, 0, 1, 1, 1, 2];
    return ["отзыв", "отзыва", "отзывов"][
      n % 100 > 4 && n % 100 < 20 ? 2 : cases[Math.min(n % 10, 5)]
    ];
  };
  return `${reviewsCount} ${decl(reviewsCount)}`;
}

function formatPriceRub(priceRub?: number | null): string {
  if (priceRub == null) return "уточняется";
  return `${new Intl.NumberFormat("ru-RU").format(priceRub)} ₽`;
}

function formatStartedUsersCount(count: number): string {
  const normalizedCount = Math.max(0, Math.trunc(count));
  const mod100 = normalizedCount % 100;
  const mod10 = normalizedCount % 10;
  const noun =
    mod100 >= 11 && mod100 <= 14
      ? "человек"
      : mod10 === 1
        ? "человек"
        : mod10 >= 2 && mod10 <= 4
          ? "человека"
          : "человек";

  return `${normalizedCount} ${noun}`;
}

function toTimestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function areCourseVisualFieldsEqual(prev: Course, next: Course): boolean {
  return (
    prev.id === next.id &&
    prev.name === next.name &&
    prev.type === next.type &&
    prev.shortDesc === next.shortDesc &&
    prev.duration === next.duration &&
    prev.trainingLevel === next.trainingLevel &&
    prev.userStatus === next.userStatus &&
    getCourseStartedUsersCount(prev) === getCourseStartedUsersCount(next) &&
    prev.isPaid === next.isPaid &&
    prev.priceRub === next.priceRub &&
    prev.isPrivate === next.isPrivate &&
    prev.hasAccess === next.hasAccess &&
    prev.logoImg === next.logoImg &&
    prev.authorUsername === next.authorUsername &&
    prev.authorAvatarUrl === next.authorAvatarUrl &&
    prev.avgRating === next.avgRating &&
    (prev.reviews?.length ?? 0) === (next.reviews?.length ?? 0) &&
    toTimestamp(prev.startedAt) === toTimestamp(next.startedAt) &&
    toTimestamp(prev.completedAt) === toTimestamp(next.completedAt) &&
    toTimestamp(prev.updatedAt) === toTimestamp(next.updatedAt)
  );
}

function areCourseCardPropsEqual(prev: CourseCardProps, next: CourseCardProps): boolean {
  return (
    prev.isFavorite === next.isFavorite &&
    prev.disabled === next.disabled &&
    prev.showIosRuCardPaymentHint === next.showIosRuCardPaymentHint &&
    prev.tourTargetId === next.tourTargetId &&
    prev.onToggleFavorite === next.onToggleFavorite &&
    areCourseVisualFieldsEqual(prev.course, next.course)
  );
}

function SimpleRating({
  rating,
  readOnly,
  onPress,
}: {
  rating: number | null;
  readOnly?: boolean;
  onPress?: () => void;
}) {
  if (!rating || rating === 0) {
    return (
      <Pressable onPress={readOnly ? onPress : undefined}>
        <Text style={styles.noRatingText}>Нет рейтинга</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={readOnly ? onPress : undefined}>
      <View style={styles.ratingContainer}>
        {[1, 2, 3, 4, 5].map((heart) => (
          <Text
            key={heart}
            style={[
              styles.ratingHeart,
              heart <= (rating ?? 0) ? styles.ratingHeartFilled : styles.ratingHeartEmpty,
            ]}
          >
            ♥
          </Text>
        ))}
        <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text>
      </View>
    </Pressable>
  );
}

export interface CourseCardProps {
  course: Course;
  isFavorite: boolean;
  onToggleFavorite: (courseId: string) => void;
  showIosRuCardPaymentHint?: boolean;
  /** Блокировка кнопки избранного (напр. во время запроса) */
  disabled?: boolean;
  tourTargetId?: MobileOnboardingTourTargetId;
}

/**
 * Карточка курса (как в веб-версии), общая для списка курсов и избранного
 */
function CourseCardComponent({
  course,
  isFavorite,
  onToggleFavorite,
  showIosRuCardPaymentHint = false,
  disabled = false,
  tourTargetId,
}: CourseCardProps) {
  const router = useRouter();
  const courseType = course.type;
  const reviewsCount = course.reviews?.length ?? 0;
  const formattedStartedAt = formatDate(course.startedAt);
  const formattedCompletedAt = formatDate(course.completedAt);
  const subscriptionStatusQuery = useAppSubscriptionStatus();
  const subscriptionStatus = subscriptionStatusQuery.data?.success
    ? subscriptionStatusQuery.data.data
    : null;
  const canDownloadOffline =
    subscriptionStatus?.hasActiveSubscription === true &&
    (subscriptionStatus.planCode === "MONTHLY" || subscriptionStatus.planCode === "THREE_MONTHS");
  const isOfflineEligibilityLoading =
    subscriptionStatusQuery.isLoading || subscriptionStatusQuery.isFetching;

  const {
    downloaded,
    downloadQueue,
    status: downloadStatus,
    startDownload,
    cancelDownload,
    removeFromQueue,
    removeDownload,
  } = useOfflineStore(
    useShallow((s) => ({
      downloaded: s.downloaded,
      downloadQueue: s.downloadQueue,
      status: s.status,
      startDownload: s.startDownload,
      cancelDownload: s.cancelDownload,
      removeFromQueue: s.removeFromQueue,
      removeDownload: s.removeDownload,
    })),
  );
  const isDownloaded = !!downloaded[courseType];
  const hasCourseAccess = !course.isPaid || course.hasAccess === true;
  const isPaidWithoutAccess = course.isPaid && !hasCourseAccess;
  const isDownloadingThis =
    downloadStatus.status === "downloading" && downloadStatus.courseType === courseType;
  const isInQueue = downloadQueue.includes(courseType);
  const hasExpandedOfflineActions = isDownloaded || isDownloadingThis || isInQueue;
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const logoImgUri = course.logoImg?.startsWith("/")
    ? `${API_BASE_URL.replace(/\/$/, "")}${course.logoImg}`
    : course.logoImg || undefined;
  const logoVersion =
    course.updatedAt != null ? new Date(course.updatedAt).getTime().toString() : "no-version";
  const logoImgVersionedUri = logoImgUri
    ? `${logoImgUri}${logoImgUri.includes("?") ? "&" : "?"}v=${logoVersion}`
    : undefined;

  /** Версия курса обновляется в БД при смене логотипа, это и есть триггер инвалидации кэша */
  const coverImageCacheKeyBase = `course-logo-${course.id}-${logoVersion}`;
  const logoCandidates = useMemo(
    () => getCourseLogoVariantCandidates(logoImgVersionedUri),
    [logoImgVersionedUri],
  );
  const [logoCandidateIndex, setLogoCandidateIndex] = useState(0);
  const preferredLogoImgUri = logoCandidates[logoCandidateIndex];
  const hasNextLogoFallback = logoCandidateIndex < logoCandidates.length - 1;
  const coverImageCacheKey = `${coverImageCacheKeyBase}-${logoCandidateIndex}`;
  const logoRecyclingKey = `course-logo-${course.id}`;
  const logoDisplayVersionKey = `${course.id}:${logoVersion}`;
  const [hasDisplayedLogo, setHasDisplayedLogo] = useState(() =>
    displayedCourseLogoVersionKeys.has(logoDisplayVersionKey),
  );
  const logoImageSource = useMemo(
    () =>
      preferredLogoImgUri ? { uri: preferredLogoImgUri, cacheKey: coverImageCacheKey } : undefined,
    [preferredLogoImgUri, coverImageCacheKey],
  );
  const markLogoDisplayed = useCallback(() => {
    if (displayedCourseLogoVersionKeys.has(logoDisplayVersionKey)) {
      if (!hasDisplayedLogo) {
        setHasDisplayedLogo(true);
      }
      return;
    }
    displayedCourseLogoVersionKeys.add(logoDisplayVersionKey);
    setHasDisplayedLogo(true);
  }, [hasDisplayedLogo, logoDisplayVersionKey]);

  useEffect(() => {
    setLogoCandidateIndex(0);
  }, [course.id, logoImgVersionedUri]);

  useEffect(() => {
    setHasDisplayedLogo(displayedCourseLogoVersionKeys.has(logoDisplayVersionKey));
  }, [logoDisplayVersionKey]);

  const handleCheckUpdates = async () => {
    if (!canDownloadOffline) return;
    const version = downloaded[courseType]?.version;
    if (!version) return;
    setCheckingUpdates(true);
    try {
      const res = await offlineApi.checkUpdates(courseType, version);
      if (res.success && res.data?.hasUpdates) {
        Alert.alert("Доступно обновление", "Есть новая версия курса. Скачать сейчас?", [
          { text: "Позже", style: "cancel" },
          { text: "Скачать", onPress: () => startDownload(courseType) },
        ]);
      } else if (res.success && !res.data?.hasUpdates) {
        Alert.alert("Курс актуален", "У вас установлена последняя версия.");
      }
    } catch (err) {
      reportClientError(err, {
        issueKey: "CourseCard",
        keys: { operation: "check_offline_updates" },
      });
      Alert.alert("Ошибка", "Не удалось проверить обновления.");
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleRatingPress = () => {
    if (course.userStatus !== "COMPLETED") {
      Alert.alert("Курс не завершен", "Оценивать курс можно только после его завершения", [
        { text: "OK" },
      ]);
    }
  };

  const handleReviewsPress = () => {
    if (reviewsCount > 0 || course.userStatus === "COMPLETED") {
      router.push({
        pathname: "/training/[courseType]/reviews",
        params: { courseType: course.type },
      });
    }
  };

  const handleOpenCourse = useCallback(() => {
    console.log("[rewarded-unlock] course card open detail", {
      courseId: course.id,
      courseType: course.type,
      isPaid: course.isPaid,
      hasAccess: course.hasAccess,
    });
    router.push(`/training/${course.type}`);
  }, [course.hasAccess, course.id, course.isPaid, course.type, router]);

  return (
    <View style={styles.courseCard}>
      <View style={styles.courseCardContent}>
        <Pressable
          style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
          onPress={handleOpenCourse}
          accessibilityRole="button"
          accessibilityLabel={`Открыть курс «${course.name}»`}
        >
          {tourTargetId ? <TourTarget id={tourTargetId} style={styles.tourTargetFill} /> : null}
          <View style={styles.imageContainer}>
            <View style={styles.imageFrame}>
              {!hasDisplayedLogo ? (
                <View style={styles.courseImagePlaceholder} pointerEvents="none" />
              ) : null}
              <Image
                source={logoImageSource}
                style={styles.courseImage}
                cachePolicy="memory-disk"
                contentFit="cover"
                contentPosition="center"
                recyclingKey={logoRecyclingKey}
                transition={0}
                priority="normal"
                onLoad={markLogoDisplayed}
                onLoadEnd={() => {
                  markLogoDisplayed();
                }}
                onDisplay={() => {
                  markLogoDisplayed();
                }}
                onError={() => {
                  if (hasNextLogoFallback) {
                    setLogoCandidateIndex((prev) => prev + 1);
                    return;
                  }
                }}
              />
            </View>
          </View>
          <View style={styles.content}>
            {course.isPaid || course.isPrivate ? (
              <View style={styles.accessLabels}>
                {course.isPaid ? <Text style={styles.accessLabel}>Платный</Text> : null}
                {course.isPaid ? (
                  <Text style={styles.accessLabel}>{formatPriceRub(course.priceRub)}</Text>
                ) : null}
                {course.isPrivate ? <Text style={styles.accessLabel}>Приватный</Text> : null}
              </View>
            ) : null}
            <Text style={styles.title}>{course.name}</Text>
            <View style={styles.factsRow}>
              <View style={styles.fact}>
                <MaterialCommunityIcons name="clock-outline" size={17} color={COLORS.primary} />
                <Text
                  style={styles.factText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {course.duration}
                </Text>
              </View>
              <View style={styles.fact}>
                <MaterialCommunityIcons name="signal-cellular-2" size={17} color={COLORS.primary} />
                <Text
                  style={styles.factText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {LEVEL_LABELS[course.trainingLevel] ?? course.trainingLevel}
                </Text>
              </View>
              <View style={styles.fact}>
                <MaterialCommunityIcons
                  name={
                    course.userStatus === "COMPLETED" ? "check-circle-outline" : "progress-clock"
                  }
                  size={17}
                  color={getStatusColor(course.userStatus)}
                />
                <Text
                  style={[styles.factText, { color: getStatusColor(course.userStatus) }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {getStatusText(course.userStatus)}
                </Text>
              </View>
            </View>
            <Text style={styles.descriptionText}>{course.shortDesc}</Text>
            <View style={styles.participantsRow}>
              <MaterialCommunityIcons
                name="account-group-outline"
                size={17}
                color={COLORS.primary}
              />
              <Text style={styles.participantsText}>
                Этот курс уже прошли {formatStartedUsersCount(getCourseStartedUsersCount(course))}
              </Text>
            </View>
            {isPaidWithoutAccess && showIosRuCardPaymentHint ? (
              <Text style={styles.iosPaymentHintText}>Оплата картами РФ доступна на сайте</Text>
            ) : null}
          </View>
        </Pressable>
        {SHOW_COURSE_RATING_AND_REVIEWS ? (
          <View style={styles.rating}>
            <SimpleRating
              rating={course.avgRating}
              readOnly={course.userStatus !== "COMPLETED"}
              onPress={handleRatingPress}
            />
            <Pressable
              onPress={handleReviewsPress}
              disabled={reviewsCount === 0 && course.userStatus !== "COMPLETED"}
              style={styles.reviewsTouchable}
            >
              <Text
                style={[
                  styles.reviewsText,
                  (reviewsCount > 0 || course.userStatus === "COMPLETED") &&
                    styles.reviewsClickable,
                ]}
              >
                {getReviewText(reviewsCount, course.userStatus)}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {SHOW_AUTHOR_AND_FAVORITE_BLOCK ? (
        <View style={styles.author}>
          <View style={styles.authorPill}>
            <View style={styles.authorBookmarkWrap}>
              <Pressable
                onPress={() => {
                  void hapticFeedback.selection();
                  onToggleFavorite(course.id);
                }}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.favoriteButton,
                  pressed && styles.favoriteButtonPressed,
                ]}
                hitSlop={12}
              >
                <MaterialCommunityIcons
                  name={isFavorite ? "bookmark" : "bookmark-outline"}
                  size={28}
                  color={isFavorite ? "#E6B800" : COLORS.primary}
                />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
      <View style={[styles.courseFooter, hasExpandedOfflineActions && styles.courseFooterExpanded]}>
        {formattedStartedAt || formattedCompletedAt ? (
          <View style={styles.datesRow}>
            {formattedStartedAt ? (
              <View style={styles.dateItem}>
                <MaterialCommunityIcons
                  name="calendar-arrow-right"
                  size={16}
                  color={COLORS.primary}
                />
                <Text style={styles.date}>Начат {formattedStartedAt}</Text>
              </View>
            ) : null}
            {formattedCompletedAt ? (
              <View style={styles.dateItem}>
                <MaterialCommunityIcons
                  name="calendar-check-outline"
                  size={16}
                  color={COLORS.primary}
                />
                <Text style={styles.date}>Завершён {formattedCompletedAt}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View
          style={[
            styles.offlineActions,
            hasExpandedOfflineActions && styles.offlineActionsExpanded,
          ]}
        >
          {isDownloaded ? (
            <>
              <Pressable
                onPress={handleCheckUpdates}
                disabled={checkingUpdates || !canDownloadOffline}
                style={({ pressed }) => [
                  styles.updateButton,
                  !canDownloadOffline && styles.offlineButtonDisabled,
                  pressed && canDownloadOffline && styles.offlineBtnPressed,
                ]}
                accessibilityState={{ disabled: checkingUpdates || !canDownloadOffline }}
              >
                {checkingUpdates ? (
                  <MascotSpinner size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="update"
                      size={16}
                      color={COLORS.secondary}
                      style={styles.buttonIcon}
                    />
                    <Text
                      style={[
                        styles.updateButtonText,
                        !canDownloadOffline && styles.offlineButtonDisabledText,
                      ]}
                    >
                      {canDownloadOffline ? "Обновить" : "Обновление — от 1 месяца"}
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={() => removeDownload(courseType)}
                style={({ pressed }) => [styles.deleteButton, pressed && styles.offlineBtnPressed]}
              >
                <MaterialCommunityIcons
                  name="delete-outline"
                  size={16}
                  color="#dc3545"
                  style={styles.buttonIcon}
                />
                <Text style={styles.deleteButtonText}>Удалить</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.offlineRow}>
              {isDownloadingThis ? (
                <>
                  <MaterialCommunityIcons name="download" size={20} color={COLORS.primary} />
                  <Text style={styles.offlineLabel} numberOfLines={1}>
                    {downloadStatus.progress?.label ??
                      `${downloadStatus.progress?.current ?? 0}/${downloadStatus.progress?.total ?? 0}`}
                  </Text>
                  <Pressable
                    onPress={() => cancelDownload()}
                    style={({ pressed }) => [
                      styles.downloadButton,
                      pressed && styles.offlineBtnPressed,
                    ]}
                  >
                    <Text style={styles.downloadButtonText}>Отменить</Text>
                  </Pressable>
                </>
              ) : isInQueue ? (
                <>
                  <MaterialCommunityIcons name="timer-sand" size={20} color={COLORS.primary} />
                  <Text style={styles.offlineLabel}>В очереди</Text>
                  <Pressable
                    onPress={() => removeFromQueue(courseType)}
                    style={({ pressed }) => [
                      styles.downloadButton,
                      pressed && styles.offlineBtnPressed,
                    ]}
                  >
                    <Text style={styles.downloadButtonText}>Убрать</Text>
                  </Pressable>
                </>
              ) : isPaidWithoutAccess ? (
                <Button
                  label="Оплатите для скачивания"
                  variant="outline"
                  disabled={true}
                  width="100%"
                  height={48}
                  borderRadius={14}
                  fontSize={13}
                  fontFamily={FONTS.montserratBold}
                  icon="lock-outline"
                />
              ) : !canDownloadOffline ? (
                <Button
                  label={
                    isOfflineEligibilityLoading ? "Проверяем тариф…" : "Скачивание — от 1 месяца"
                  }
                  variant="outline"
                  disabled
                  width="100%"
                  height={48}
                  borderRadius={14}
                  fontSize={13}
                  fontFamily={FONTS.montserratBold}
                  icon="lock-outline"
                  accessibilityHint="Скачивание курсов доступно на тарифах «Поддержка в чате» и «Полное сопровождение»"
                />
              ) : (
                <Button
                  label="Скачать"
                  variant="primary"
                  onPress={() => startDownload(courseType)}
                  width="100%"
                  height={48}
                  borderRadius={14}
                  fontSize={14}
                  lineHeight={18}
                  fontFamily={FONTS.montserratBold}
                  icon="download"
                  animatedPress
                  accessibilityHint="Сохраняет курс для доступа без интернета"
                />
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export const CourseCard = memo(CourseCardComponent, areCourseCardPropsEqual);

const CARD_PADDING = 16;

const styles = StyleSheet.create({
  courseCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 18,
    marginBottom: SPACING.md,
    shadowColor: "#4A4917",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
    width: "100%",
    alignSelf: "stretch",
  },
  courseCardContent: {
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  link: { width: "100%" },
  linkPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.992 }],
  },
  offlineButtonDisabled: { opacity: 0.5 },
  offlineButtonDisabledText: { color: COLORS.textSecondary },
  imageContainer: {
    width: "100%",
    alignSelf: "stretch",
    paddingTop: 14,
    paddingHorizontal: 14,
  },
  imageFrame: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: COLORS.onPrimary,
    position: "relative",
    overflow: "hidden",
  },
  tourTargetFill: {
    ...StyleSheet.absoluteFillObject,
  },
  courseImage: {
    width: "100%",
    height: "100%",
  },
  courseImagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4efe2",
  },
  content: {
    width: "100%",
    minWidth: 0,
    padding: CARD_PADDING,
    gap: 12,
  },
  accessLabels: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 6,
    flexWrap: "wrap",
  },
  accessLabel: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "#E7E0C8",
    color: COLORS.primaryDark,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FONTS.montserratBold,
  },
  title: {
    fontSize: 22,
    color: COLORS.text,
    fontFamily: FONTS.montserratBold,
    lineHeight: 28,
  },
  factsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 6,
  },
  fact: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#EEE7D2",
  },
  factText: {
    fontSize: 11,
    lineHeight: 15,
    color: COLORS.primaryDark,
    fontFamily: FONTS.montserratMedium,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#514B46",
    fontFamily: FONTS.montserrat,
  },
  participantsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  participantsText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 17,
    color: "#686540",
    fontFamily: FONTS.montserratMedium,
  },
  datesRow: {
    flexShrink: 0,
    flexDirection: "column",
    justifyContent: "center",
    gap: 8,
  },
  dateItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  date: {
    fontSize: 11,
    lineHeight: 15,
    color: "#686540",
    fontFamily: FONTS.montserratMedium,
  },
  iosPaymentHintText: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.secondary,
    fontFamily: FONTS.montserratMedium,
  },
  rating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    paddingVertical: 10,
    paddingHorizontal: CARD_PADDING,
  },
  ratingContainer: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingHeart: { fontSize: 18 },
  ratingHeartFilled: { color: "#e63946" },
  ratingHeartEmpty: { color: "#b0b0b0" },
  ratingValue: {
    color: COLORS.secondary,
    fontSize: 13,
    fontFamily: FONTS.montserrat,
  },
  noRatingText: {
    color: "#8a8585",
    fontSize: 13,
    fontFamily: FONTS.montserrat,
  },
  reviewsTouchable: {
    justifyContent: "center",
  },
  reviewsText: {
    fontSize: 13,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  reviewsClickable: {
    color: COLORS.secondary,
    textDecorationLine: "underline",
  },
  offlineActions: {
    width: "100%",
    flexDirection: "row",
    gap: 8,
    alignSelf: "stretch",
  },
  offlineActionsExpanded: {
    width: "100%",
  },
  courseFooter: {
    width: "100%",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: CARD_PADDING,
    paddingBottom: CARD_PADDING,
    paddingTop: 2,
  },
  courseFooterExpanded: {
    flexDirection: "column",
  },
  offlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  offlineLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    minWidth: 0,
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 0,
    backgroundColor: "#F0D8D3",
    minHeight: 40,
  },
  downloadButtonText: {
    fontSize: 12,
    color: "#7E2F2A",
    fontFamily: FONTS.montserratBold,
  },
  updateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 0,
    backgroundColor: "#E8E1CB",
    minHeight: 44,
    flex: 1,
  },
  updateButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.secondary,
    fontFamily: FONTS.montserrat,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 0,
    backgroundColor: "#F0D8D3",
    minHeight: 44,
    flex: 1,
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#dc3545",
    fontFamily: FONTS.montserrat,
  },
  buttonIcon: {
    marginRight: 0,
  },
  offlineBtnPressed: {
    opacity: 0.85,
  },
  author: {
    paddingHorizontal: 10,
    paddingBottom: 14,
  },
  authorPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    paddingVertical: 8,
    paddingLeft: 28,
    paddingRight: 28,
    borderWidth: 1,
    borderColor: "#e6e1ce",
    borderRadius: 28,
    backgroundColor: COLORS.cardBackground,
    overflow: "visible",
    ...Platform.select({
      ios: {
        shadowColor: "#636128",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  authorInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  authorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#e8e3d2",
    borderWidth: 2,
    borderColor: "#e6e1ce",
    marginLeft: -24,
    overflow: "hidden",
  },
  authorAvatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
  authorTextWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  authorLine: {
    fontSize: 14,
    color: "#352e2e",
    fontFamily: FONTS.montserrat,
  },
  authorLabel: {
    fontSize: 14,
    color: "#352e2e",
    fontFamily: FONTS.montserrat,
  },
  authorLink: {
    color: COLORS.secondary,
    fontSize: 15,
    fontFamily: FONTS.montserratMedium,
  },
  authorBookmarkWrap: {
    marginRight: -20,
    width: 48,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteButton: {
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteButtonPressed: {
    opacity: 0.7,
  },
});
