import { View, StyleSheet, Pressable } from "react-native";
import { Text, IconButton } from "react-native-paper";
import { Link } from "expo-router";
import { Image } from "expo-image";

import { COLORS, SPACING, BORDER_RADIUS } from "@/constants";
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

function SimpleRating({ rating }: { rating: number | null }) {
  if (!rating || rating === 0) {
    return <Text style={styles.noRatingText}>Нет рейтинга</Text>;
  }
  return (
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
  const reviewsCount = course.reviews?.length ?? 0;
  const formattedStartedAt = formatDate(course.startedAt);
  const formattedCompletedAt = formatDate(course.completedAt);

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
                transition={200}
              />
              {course.isPrivate && (
                <View style={styles.privateBadge}>
                  <Text style={styles.privateBadgeText}>Приватный</Text>
                </View>
              )}
            </View>
            <View style={styles.content}>
              <Text style={styles.title}>{course.name}</Text>
              <View style={styles.meta}>
                <Text style={styles.duration}>
                  <Text style={styles.metaBold}>Длительность:</Text> {course.duration}
                </Text>
                <View>
                  <Text style={[styles.status, { color: getStatusColor(course.userStatus) }]}>
                    {getStatusText(course.userStatus)}
                  </Text>
                </View>
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
          </Pressable>
        </Link>
        <View style={styles.rating}>
          <SimpleRating rating={course.avgRating} />
          <Text style={styles.reviews}>{getReviewText(reviewsCount, course.userStatus)}</Text>
        </View>
      </View>
      <View style={styles.author}>
        <Text style={styles.authorText}>
          Автор курса:{" "}
          <Text style={styles.authorLink}>{course.authorUsername ?? "Неизвестный автор"}</Text>
        </Text>
        <IconButton
          icon={isFavorite ? "heart" : "heart-outline"}
          iconColor={isFavorite ? COLORS.error : COLORS.textSecondary}
          size={20}
          onPress={onToggleFavorite}
          disabled={disabled}
          style={styles.favoriteButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  courseCard: {
    backgroundColor: "#FFF8E5",
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
    maxWidth: 310,
    alignSelf: "center",
    width: "100%",
  },
  courseCardContent: {
    flexDirection: "column",
    flex: 1,
  },
  link: {},
  imageContainer: {
    width: "100%",
    paddingTop: 10,
    paddingHorizontal: 30,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  courseImage: {
    width: 245,
    height: 140,
    borderRadius: BORDER_RADIUS.md,
  },
  privateBadge: {
    position: "absolute",
    top: 18,
    right: 38,
    backgroundColor: "rgba(255, 0, 0, 0.9)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  privateBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "500",
  },
  content: {
    paddingTop: 10,
    paddingLeft: 30,
    paddingRight: 10,
    flex: 1,
  },
  title: {
    marginBottom: 10,
    fontSize: 20,
    color: "#352E2E",
    lineHeight: 20,
    fontWeight: "400",
    fontFamily: "System",
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  duration: {
    color: "#352E2E",
    fontSize: 12,
    fontWeight: "400",
    fontFamily: "System",
  },
  status: { fontSize: 12, fontWeight: "500" },
  metaBold: { fontWeight: "700" },
  description: { marginBottom: 10 },
  descriptionText: {
    color: "#352E2E",
    fontSize: 12,
    fontWeight: "400",
    fontFamily: "System",
    marginBottom: 4,
  },
  date: { fontSize: 12, color: "#352E2E", marginBottom: 4 },
  rating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
    marginTop: "auto",
    paddingTop: 10,
    paddingLeft: 30,
    paddingRight: 10,
    flexWrap: "wrap",
  },
  ratingContainer: { flexDirection: "row", alignItems: "center", gap: 2 },
  ratingHeart: { fontSize: 16 },
  ratingHeartFilled: { color: "#ff6d75" },
  ratingHeartEmpty: { color: "#b0b0b0" },
  ratingValue: { marginLeft: 8, color: "#666", fontSize: 12 },
  noRatingText: { color: "#b0b0b0", fontSize: 12 },
  reviews: { fontSize: 12, color: "#352E2E" },
  author: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderTopWidth: 1,
    borderTopColor: "rgba(99, 97, 40, 0.2)",
  },
  authorText: { color: "#37373d", fontSize: 14, fontFamily: "System" },
  authorLink: { color: "#009dcf" },
  favoriteButton: { margin: 0 },
});
