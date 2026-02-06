import { useState } from "react";
import { View, StyleSheet, Pressable, Alert, ActivityIndicator } from "react-native";
import { Text, IconButton } from "react-native-paper";
import { Link, useRouter } from "expo-router";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { SPACING, FONTS, COLORS, BORDER_RADIUS } from "@/constants";
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
  switch (status) {
    case "NOT_STARTED":
      return "Не начат";
    case "IN_PROGRESS":
      return "В процессе";
    case "COMPLETED":
      return "Завершен";
    case "RESET":
      return "Сброшен";
    default:
      return "Не начат";
  }
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
  const isDownloadingThis =
    downloadStatus.status === "downloading" && downloadStatus.courseType === courseType;
  const isInQueue = downloadQueue.includes(courseType);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

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
              <Image
                source={{ uri: course.logoImg }}
                style={styles.courseImage}
                contentFit="cover"
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
            <View style={styles.content}>
              <Text style={styles.title}>{course.name}</Text>
              <View style={styles.metaBlock}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaBold}>Длительность:</Text> {course.duration}
                </Text>
                <View style={styles.metaRowWithStatus}>
                  <Text style={styles.metaText}>
                    <Text style={styles.metaBold}>Уровень сложности:</Text>{" "}
                    {LEVEL_LABELS[course.trainingLevel] ?? course.trainingLevel}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(course.userStatus) + "20" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: getStatusColor(course.userStatus) },
                      ]}
                    >
                      {getStatusText(course.userStatus)}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.descriptionSection}>
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
        {/* Офлайн: скачать / скачано / очередь */}
        <View style={styles.offlineSection}>
          {isDownloaded ? (
            <View style={styles.offlineCentered}>
              <View style={styles.offlineTitleRow}>
                <MaterialCommunityIcons name="check-circle" size={22} color={COLORS.primary} />
                <Text style={styles.offlineTitleText}>Скачано для офлайна</Text>
              </View>
              <View style={styles.offlineButtonsRow}>
                <Pressable
                  onPress={handleCheckUpdates}
                  disabled={checkingUpdates}
                  style={({ pressed }) => [
                    styles.offlineBtnOutline,
                    pressed && styles.offlineBtnPressed,
                  ]}
                >
                  {checkingUpdates ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name="update"
                        size={16}
                        color={COLORS.primary}
                        style={styles.offlineBtnIcon}
                      />
                      <Text style={styles.offlineBtnOutlineText}>Проверить обновления</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => removeDownload(courseType)}
                  style={({ pressed }) => [
                    styles.offlineBtnDanger,
                    pressed && styles.offlineBtnPressed,
                  ]}
                >
                  <MaterialCommunityIcons name="delete-outline" size={16} color="#fff" style={styles.offlineBtnIcon} />
                  <Text style={styles.offlineBtnDangerText}>Удалить</Text>
                </Pressable>
              </View>
            </View>
          ) : (
          <View style={styles.offlineRow}>
            {isDownloadingThis ? (
              <>
                <MaterialCommunityIcons name="download" size={22} color={COLORS.primary} />
                <Text style={styles.offlineLabel} numberOfLines={1}>
                  {downloadStatus.progress?.label ??
                    `${downloadStatus.progress?.current ?? 0}/${downloadStatus.progress?.total ?? 0}`}
                </Text>
                <Pressable
                  onPress={() => cancelDownload()}
                  style={({ pressed }) => [
                    styles.offlineBtnOutline,
                    pressed && styles.offlineBtnPressed,
                  ]}
                >
                  <Text style={styles.offlineBtnOutlineText}>Отменить</Text>
                </Pressable>
              </>
            ) : isInQueue ? (
              <>
                <MaterialCommunityIcons name="timer-sand" size={22} color={COLORS.primary} />
                <Text style={styles.offlineLabel}>В очереди</Text>
                <Pressable
                  onPress={() => removeFromQueue(courseType)}
                  style={({ pressed }) => [
                    styles.offlineBtnOutline,
                    pressed && styles.offlineBtnPressed,
                  ]}
                >
                  <Text style={styles.offlineBtnOutlineText}>Убрать</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => startDownload(courseType)}
                style={({ pressed }) => [
                  styles.offlineBtnPrimaryLarge,
                  pressed && styles.offlineBtnPressed,
                ]}
              >
                <MaterialCommunityIcons name="download" size={20} color="#fff" style={styles.offlineBtnIcon} />
                <Text style={styles.offlineBtnPrimaryText}>Скачать для работы в офлайн</Text>
              </Pressable>
            )}
          </View>
          )}
        </View>
        <View style={styles.ratingRow}>
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
      <View style={styles.authorSection}>
        <Pressable
          onPress={handleAuthorPress}
          disabled={!course.authorUsername}
          style={styles.authorContent}
        >
          <Text style={styles.authorText}>
            <Text style={styles.authorLabel}>Автор курса:</Text>{" "}
            <Text style={styles.authorLink}>
              {course.authorUsername ?? "Неизвестный автор"}
            </Text>
          </Text>
          <IconButton
            icon={isFavorite ? "bookmark" : "bookmark-outline"}
            iconColor={isFavorite ? "#E6B800" : COLORS.primary}
            size={24}
            onPress={onToggleFavorite}
            disabled={disabled}
            style={styles.favoriteButton}
          />
        </Pressable>
      </View>
    </View>
  );
}

const PAD = SPACING.md;
const GAP = SPACING.sm;
const GAP_MD = SPACING.md;

const styles = StyleSheet.create({
  courseCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
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
    paddingTop: PAD,
    paddingHorizontal: PAD,
    position: "relative",
    alignSelf: "stretch",
    overflow: "hidden",
  },
  courseImage: {
    width: "100%",
    aspectRatio: 16 / 9,
    maxHeight: 180,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.onPrimary,
    alignSelf: "center",
  },
  paidBadge: {
    position: "absolute",
    bottom: 8,
    left: PAD + 8,
    backgroundColor: "rgba(40, 120, 80, 0.9)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  paidBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
  },
  privateBadge: {
    position: "absolute",
    top: PAD + 8,
    right: PAD + 8,
    backgroundColor: "rgba(220, 53, 69, 0.9)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  privateBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
  },
  content: {
    width: "100%",
    minWidth: 0,
    paddingHorizontal: PAD,
    paddingTop: GAP_MD,
    paddingBottom: GAP,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    fontFamily: FONTS.impact,
    marginBottom: GAP_MD,
  },
  metaBlock: {
    flexDirection: "column",
    gap: 6,
    marginBottom: GAP_MD,
  },
  metaRowWithStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: GAP,
  },
  metaText: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: FONTS.montserrat,
  },
  metaBold: {
    fontSize: 13,
    fontFamily: FONTS.montserratBold,
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: FONTS.montserrat,
  },
  descriptionSection: {
    width: "100%",
    minWidth: 0,
    marginTop: GAP,
    marginBottom: GAP,
    overflow: "hidden",
  },
  descriptionText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 20,
    fontFamily: FONTS.montserrat,
  },
  datesRow: {
    flexDirection: "column",
    gap: 4,
  },
  date: {
    fontSize: 13,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  offlineSection: {
    paddingHorizontal: PAD,
    paddingVertical: GAP_MD,
    borderTopWidth: 1,
    borderTopColor: "#E8E0D5",
    backgroundColor: COLORS.cardBackground,
  },
  offlineCentered: {
    alignItems: "center",
    justifyContent: "center",
  },
  offlineTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  offlineTitleText: {
    fontSize: 15,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    fontWeight: "500",
  },
  offlineButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "nowrap",
  },
  offlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  offlineLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    minWidth: 0,
  },
  offlineButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  offlineBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    minHeight: 40,
  },
  offlineBtnPrimaryLarge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    minHeight: 48,
    flex: 1,
    alignSelf: "stretch",
  },
  offlineBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    fontFamily: FONTS.montserrat,
  },
  offlineBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    minHeight: 40,
    flexShrink: 0,
  },
  offlineBtnOutlineText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
  },
  offlineBtnDanger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#c62828",
    minHeight: 40,
    flexShrink: 0,
  },
  offlineBtnDangerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    fontFamily: FONTS.montserrat,
  },
  offlineBtnIcon: {
    marginRight: 6,
  },
  offlineBtnPressed: {
    opacity: 0.85,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: GAP_MD,
    paddingHorizontal: PAD,
    minHeight: 40,
  },
  ratingContainer: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingHeart: { fontSize: 18 },
  ratingHeartFilled: { color: "#e63946" },
  ratingHeartEmpty: { color: "#b0b0b0" },
  ratingValue: {
    color: COLORS.primary,
    fontSize: 13,
    fontFamily: FONTS.montserrat,
  },
  noRatingText: {
    color: COLORS.placeholder,
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
  authorSection: {
    borderTopWidth: 1,
    borderTopColor: "#E5DDD0",
  },
  authorContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
    paddingHorizontal: PAD,
    minHeight: 48,
  },
  authorText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: FONTS.montserrat,
  },
  authorLabel: { fontWeight: "700", fontFamily: FONTS.montserrat },
  authorLink: { color: COLORS.secondary, fontWeight: "600" },
  favoriteButton: {
    margin: 0,
    marginRight: -8,
  },
});
