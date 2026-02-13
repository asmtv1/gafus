import { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, Alert, ActivityIndicator } from "react-native";
import { Text, IconButton } from "react-native-paper";
import { Link, useRouter } from "expo-router";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { STEP_STATUS_LABELS } from "@gafus/core/utils/training";
import { TrainingStatus } from "@gafus/types";
import { SPACING, FONTS, COLORS, BORDER_RADIUS, API_BASE_URL } from "@/constants";
import { useOfflineStore } from "@/shared/stores";
import { offlineApi } from "@/shared/lib/api/offline";
import type { Course } from "@/shared/lib/api";

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Начальный",
  INTERMEDIATE: "Средний",
  ADVANCED: "Продвинутый",
  EXPERT: "Экспертный",
};

function getStatusText(status: string): string {
  return (
    STEP_STATUS_LABELS[status as TrainingStatus] ??
    STEP_STATUS_LABELS[TrainingStatus.NOT_STARTED]
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case "NOT_STARTED":
      return "#352E2E";
    case "IN_PROGRESS":
      return "#009dcf";
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
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("ru-RU");
  } catch {
    return null;
  }
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
  onToggleFavorite: () => void;
  /** Блокировка кнопки избранного (напр. во время запроса) */
  disabled?: boolean;
}

/**
 * Карточка курса (как в веб-версии), общая для списка курсов и избранного
 */
export function CourseCard({
  course,
  isFavorite,
  onToggleFavorite,
  disabled = false,
}: CourseCardProps) {
  const router = useRouter();
  const courseType = course.type;
  const reviewsCount = course.reviews?.length ?? 0;
  const formattedStartedAt = formatDate(course.startedAt);
  const formattedCompletedAt = formatDate(course.completedAt);

  const downloaded = useOfflineStore((s) => s.downloaded);
  const downloadQueue = useOfflineStore((s) => s.downloadQueue);
  const downloadStatus = useOfflineStore((s) => s.status);
  const startDownload = useOfflineStore((s) => s.startDownload);
  const cancelDownload = useOfflineStore((s) => s.cancelDownload);
  const removeFromQueue = useOfflineStore((s) => s.removeFromQueue);
  const removeDownload = useOfflineStore((s) => s.removeDownload);
  const isDownloaded = !!downloaded[courseType];
  const hasCourseAccess = !course.isPaid || course.hasAccess === true;
  const isPaidWithoutAccess = course.isPaid && !hasCourseAccess;
  const isDownloadingThis =
    downloadStatus.status === "downloading" && downloadStatus.courseType === courseType;
  const isInQueue = downloadQueue.includes(courseType);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [authorAvatarError, setAuthorAvatarError] = useState(false);

  useEffect(() => {
    setAuthorAvatarError(false);
  }, [course.id, course.authorAvatarUrl]);

  const authorAvatarUrl =
    (course.authorAvatarUrl ?? (course as { author?: { profile?: { avatarUrl?: string | null } } }).author?.profile?.avatarUrl ?? null) as string | null | undefined;
  const authorAvatarUri =
    authorAvatarUrl && !authorAvatarError
      ? authorAvatarUrl.startsWith("/")
        ? `${API_BASE_URL.replace(/\/$/, "")}${authorAvatarUrl}`
        : authorAvatarUrl
      : null;

  const handleCheckUpdates = async () => {
    const version = downloaded[courseType]?.version;
    if (!version) return;
    setCheckingUpdates(true);
    try {
      const res = await offlineApi.checkUpdates(courseType, version);
      if (res.success && res.data?.hasUpdates) {
        Alert.alert(
          "Доступно обновление",
          "Есть новая версия курса. Скачать сейчас?",
          [
            { text: "Позже", style: "cancel" },
            { text: "Скачать", onPress: () => startDownload(courseType) },
          ],
        );
      } else if (res.success && !res.data?.hasUpdates) {
        Alert.alert("Курс актуален", "У вас установлена последняя версия.");
      }
    } catch {
      Alert.alert("Ошибка", "Не удалось проверить обновления.");
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleRatingPress = () => {
    if (course.userStatus !== "COMPLETED") {
      Alert.alert(
        "Курс не завершен",
        "Оценивать курс можно только после его завершения",
        [{ text: "OK" }],
      );
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

  const handleAuthorPress = () => {
    if (course.authorUsername) {
      router.push({
        pathname: "/profile/[username]",
        params: { username: course.authorUsername },
      });
    }
  };

  return (
    <View style={styles.courseCard}>
      <View style={styles.courseCardContent}>
        <Link href={`/training/${course.type}`} asChild>
          <Pressable style={styles.link}>
            <View style={styles.imageContainer}>
              <View style={styles.imageFrame}>
                <Image
                  source={{ uri: course.logoImg }}
                  style={styles.courseImage}
                  contentFit="contain"
                  contentPosition="center"
                  transition={200}
                />
                {course.isPaid && (
                  <View style={styles.paidBadge}>
                    <Text style={styles.paidBadgeText}>Платный</Text>
                  </View>
                )}
                {course.isPrivate && (
                  <View style={styles.privateBadge}>
                    <Text style={styles.privateBadgeText}>Приватный</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.content}>
              <Text style={styles.title}>{course.name}</Text>
              <View style={styles.meta}>
                <Text style={styles.duration}>
                  <Text style={styles.metaBold}>Длительность:</Text> {course.duration}
                </Text>
                <Text style={[styles.status, { color: getStatusColor(course.userStatus) }]}>
                  {getStatusText(course.userStatus)}
                </Text>
              </View>
              <View style={styles.description}>
                <Text style={styles.descriptionText}>
                  <Text style={styles.metaBold}>Уровень сложности:</Text>{" "}
                  {LEVEL_LABELS[course.trainingLevel] ?? course.trainingLevel}
                </Text>
                <Text style={styles.descriptionText}>
                  <Text style={styles.metaBold}>Описание:</Text> {course.shortDesc}
                </Text>
              </View>
              {(formattedStartedAt || formattedCompletedAt) && (
                <View style={styles.datesRow}>
                  {formattedStartedAt && (
                    <Text style={styles.date}>
                      <Text style={styles.metaBold}>Начат:</Text> {formattedStartedAt}
                    </Text>
                  )}
                  {formattedCompletedAt && (
                    <Text style={styles.date}>
                      <Text style={styles.metaBold}>Завершен:</Text> {formattedCompletedAt}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </Pressable>
        </Link>
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
      </View>
      <View style={styles.author}>
        <View style={styles.authorPill}>
          <Pressable
            onPress={handleAuthorPress}
            disabled={!course.authorUsername}
            style={styles.authorInfo}
          >
            <View style={styles.authorAvatar}>
              {authorAvatarUri ? (
                <Image
                  source={{ uri: authorAvatarUri }}
                  style={styles.authorAvatarImg}
                  contentFit="cover"
                  onError={() => setAuthorAvatarError(true)}
                />
              ) : null}
            </View>
            <View style={styles.authorTextWrap}>
              <Text style={styles.authorLine} numberOfLines={1}>
                <Text style={styles.authorLabel}>Автор курса: </Text>
                <Text style={styles.authorLink}>
                  {course.authorUsername ?? "Неизвестный автор"}
                </Text>
              </Text>
            </View>
          </Pressable>
          <View style={styles.authorBookmarkWrap}>
            <IconButton
              icon={isFavorite ? "bookmark" : "bookmark-outline"}
              iconColor={isFavorite ? "#E6B800" : COLORS.primary}
              size={36}
              onPress={onToggleFavorite}
              disabled={disabled}
              style={styles.favoriteButton}
            />
          </View>
        </View>
      </View>
      <View style={styles.offlineActions}>
        {isDownloaded ? (
          <>
            <Pressable
              onPress={handleCheckUpdates}
              disabled={checkingUpdates}
              style={({ pressed }) => [
                styles.updateButton,
                pressed && styles.offlineBtnPressed,
              ]}
            >
              {checkingUpdates ? (
                <ActivityIndicator size="small" color={COLORS.secondary} />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="update"
                    size={16}
                    color={COLORS.secondary}
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.updateButtonText}>Обновить</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={() => removeDownload(courseType)}
              style={({ pressed }) => [
                styles.deleteButton,
                pressed && styles.offlineBtnPressed,
              ]}
            >
              <MaterialCommunityIcons name="delete-outline" size={16} color="#dc3545" style={styles.buttonIcon} />
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
            ) : (
              isPaidWithoutAccess ? (
                <Pressable
                  disabled={true}
                  style={[
                    styles.downloadButton,
                    styles.downloadButtonFull,
                    styles.downloadButtonDisabled,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="download"
                    size={16}
                    color={COLORS.textSecondary}
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.downloadButtonDisabledText}>Оплатите для скачивания</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => startDownload(courseType)}
                  style={({ pressed }) => [
                    styles.downloadButton,
                    styles.downloadButtonFull,
                    pressed && styles.offlineBtnPressed,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="download"
                    size={16}
                    color={COLORS.text}
                    style={styles.buttonIcon}
                  />
                  <Text style={styles.downloadButtonText}>Скачать</Text>
                </Pressable>
              )
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// Отступы как в web (CourseCard.module.css)
const PAD_H = 20;
const PAD_V = 10;
const PAD_IMAGE_H = 24;
const GAP_MD = SPACING.md;

const styles = StyleSheet.create({
  courseCard: {
    backgroundColor: "#fff8e5",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: "#636128",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    width: "100%",
    alignSelf: "stretch",
  },
  courseCardContent: {
    flexDirection: "column",
    flex: 1,
  },
  link: { width: "100%" },
  imageContainer: {
    width: "100%",
    paddingTop: PAD_V,
    paddingHorizontal: PAD_IMAGE_H,
    alignSelf: "stretch",
    alignItems: "center",
  },
  imageFrame: {
    width: "100%",
    maxWidth: 350,
    aspectRatio: 245 / 140,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.onPrimary,
    position: "relative",
    overflow: "hidden",
    alignSelf: "center",
  },
  courseImage: {
    width: "100%",
    height: "100%",
    borderRadius: BORDER_RADIUS.md,
  },
  paidBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: "rgba(40, 120, 80, 0.9)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomRightRadius: 8,
  },
  paidBadgeText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
    fontFamily: FONTS.montserrat,
  },
  privateBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "rgba(255, 0, 0, 0.9)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomLeftRadius: 8,
  },
  privateBadgeText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
    fontFamily: FONTS.montserrat,
  },
  content: {
    width: "100%",
    minWidth: 0,
    paddingTop: PAD_V,
    paddingLeft: PAD_H,
    paddingRight: PAD_H - 4,
    paddingBottom: GAP_MD,
  },
  title: {
    fontSize: 20,
    fontWeight: "400",
    color: "#352e2e",
    fontFamily: FONTS.impact,
    marginBottom: PAD_V,
    lineHeight: 20,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: PAD_V,
  },
  duration: {
    fontSize: 12,
    color: "#352e2e",
    fontFamily: FONTS.montserrat,
    flex: 1,
  },
  status: {
    fontSize: 12,
    fontWeight: "500",
    fontFamily: FONTS.montserrat,
  },
  metaBold: {
    fontSize: 12,
    fontFamily: FONTS.montserratBold,
    color: "#352e2e",
  },
  description: {
    gap: 10,
    marginBottom: PAD_V,
  },
  descriptionText: {
    fontSize: 12,
    color: "#352e2e",
    fontFamily: FONTS.montserrat,
  },
  datesRow: {
    flexDirection: "column",
    gap: 4,
  },
  date: {
    fontSize: 13,
    color: "#352e2e",
    fontFamily: FONTS.montserrat,
  },
  rating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    paddingVertical: PAD_V,
    paddingHorizontal: PAD_H,
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
    flexDirection: "row",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: PAD_H,
    paddingBottom: 12,
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#636128",
    backgroundColor: "#fff8e5",
    minHeight: 36,
  },
  downloadButtonFull: {
    flex: 1,
  },
  downloadButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#352e2e",
    fontFamily: FONTS.montserrat,
  },
  updateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.secondary,
    backgroundColor: "#fff8e5",
    minHeight: 36,
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#dc3545",
    backgroundColor: "#fff8e5",
    minHeight: 36,
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
  downloadButtonDisabled: {
    opacity: 0.75,
  },
  downloadButtonDisabledText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
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
    borderRadius: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: "visible",
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
    fontWeight: "500",
    fontSize: 16,
  },
  authorBookmarkWrap: {
    marginRight: -24,
    width: 52,
    minWidth: 52,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  favoriteButton: {
    margin: 0,
  },
});
