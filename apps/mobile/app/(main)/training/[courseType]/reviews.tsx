import { View, StyleSheet, ScrollView, Pressable, Alert, TextInput } from "react-native";
import { Text } from "react-native-paper";
import { AppBackButton, TexturedSafeAreaView as SafeAreaView } from "@/shared/components";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";

import { COLORS, SPACING, FONTS } from "@/shared/config";
import { Button, Loading } from "@/shared/components/ui";
import { coursesApi, type CourseReview } from "@/shared/lib/api/courses";
import { useAuthStore } from "@/shared/stores";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { reportClientError } from "@/shared/lib/tracer";
import { hapticFeedback } from "@/shared/lib/utils/haptics";

// Форматирование даты
const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

/**
 * Рейтинг: изначально 5 пустых сердечек (♡), по нажатию — выбранное количество заполняется (♥).
 */
function RatingStars({
  rating,
  interactive,
  onRatingChange,
}: {
  rating: number;
  interactive?: boolean;
  onRatingChange?: (rating: number) => void;
}) {
  const selected = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <View
      style={styles.starsContainer}
      accessible={!interactive}
      accessibilityRole={interactive ? undefined : "text"}
      accessibilityLabel={interactive ? undefined : `Оценка ${selected} из 5`}
    >
      {[1, 2, 3, 4, 5].map((value) => {
        const filled = value <= selected;
        const heart = (
          <Text
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.star,
              filled ? styles.starFilled : styles.starEmpty,
              interactive && styles.starInteractive,
            ]}
          >
            {filled ? "♥" : "♡"}
          </Text>
        );
        return interactive ? (
          <Pressable
            key={value}
            style={styles.starPressable}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="radio"
            accessibilityLabel={`Оценка ${value} из 5`}
            accessibilityState={{ selected: value === selected }}
            onPress={() => onRatingChange?.(value)}
          >
            {heart}
          </Pressable>
        ) : (
          <View key={value} style={styles.starPressable}>
            {heart}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Страница отзывов к курсу
 */
export default function ReviewsScreen() {
  const router = useRouter();
  const { courseType } = useLocalSearchParams<{ courseType: string }>();
  const owner = useAuthStore((s) =>
    s.isAuthenticated && !s.isLoading ? (s.user?.id ?? null) : null,
  );
  const authed = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  const epoch = owner && binding?.principalId === owner ? binding.authEpoch : null;
  if (authLoading || (authed && (!owner || !epoch)))
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Loading fullScreen embedded message="Загрузка отзывов..." />
      </SafeAreaView>
    );
  if (typeof courseType !== "string" || !courseType.trim())
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <AppBackButton style={styles.backRow} onPress={() => router.back()} />
        <Text style={styles.emptyText}>Курс не найден.</Text>
      </SafeAreaView>
    );
  return (
    <ReviewsActor
      key={`${owner ?? "guest"}:${epoch ?? "public"}:${courseType}`}
      owner={owner}
      epoch={epoch}
      courseType={courseType}
    />
  );
}
function ReviewsActor({
  owner,
  epoch,
  courseType,
}: {
  owner: string | null;
  epoch: string | null;
  courseType: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const mounted = useRef(true);
  const retryInFlight = useRef(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const current = useCallback(() => {
    const auth = useAuthStore.getState();
    const binding = newOnlyV2NativeQueues.getVerifiedBinding();
    if (!mounted.current || auth.isLoading) return false;
    if (owner && epoch)
      return (
        auth.isAuthenticated &&
        auth.user?.id === owner &&
        binding?.principalId === owner &&
        binding.authEpoch === epoch
      );
    return !auth.isAuthenticated;
  }, [owner, epoch]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [isEditing, setIsEditing] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState<string>("");

  // Загрузка отзывов
  const {
    data: reviewsResponse,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["course-reviews", courseType, owner ?? "guest", epoch ?? "public"],
    queryFn: async () => {
      if (!current()) throw new Error("COURSE_REVIEWS_READ_STALE");
      const res = await coursesApi.getReviews(courseType, current);
      if (!current()) throw new Error("COURSE_REVIEWS_READ_STALE");
      if (!res.success) throw new Error(res.error ?? "Ошибка загрузки отзывов");
      return res;
    },
    enabled: true,
  });
  const retry = async () => {
    if (!current() || retryInFlight.current) return;
    retryInFlight.current = true;
    setRetryFailed(false);
    const failed = () => {
      if (!current()) return;
      setRetryFailed(true);
      reportClientError(new Error("COURSE_REVIEWS_REFETCH_FAILED"), {
        issueKey: "CourseReviews",
        keys: { operation: "retry" },
      });
    };
    try {
      const result = await refetch();
      if (current() && result?.isError) failed();
    } catch {
      if (current()) {
        setRetryFailed(true);
        reportClientError(new Error("COURSE_REVIEWS_REFETCH_FAILED"), {
          issueKey: "CourseReviews",
          keys: { operation: "retry" },
        });
      }
    } finally {
      retryInFlight.current = false;
    }
  };

  const writeInFlight = useRef(false);
  const unknownRef = useRef(false);
  const acknowledgedWrites = useRef(new Set<string>());
  const [writeBusy, setWriteBusy] = useState(false);
  const [writeUnknown, setWriteUnknown] = useState(false);
  const [writeNotice, setWriteNotice] = useState("");
  const runWrite = async (
    key: string,
    action: () => Promise<{ success: boolean }>,
    confirmed: () => void,
  ) => {
    if (
      acknowledgedWrites.current.has(key) ||
      writeInFlight.current ||
      unknownRef.current ||
      !current() ||
      !owner ||
      !epoch
    )
      return;
    writeInFlight.current = true;
    setWriteBusy(true);
    setWriteNotice("");
    let acknowledged = false;
    try {
      const result = await action();
      if (!current()) return;
      if (!result.success) {
        unknownRef.current = true;
        setWriteUnknown(true);
        setWriteNotice(
          "Результат изменения неизвестен. Обновите страницу перед повторным действием.",
        );
        return;
      }
      acknowledged = true;
      acknowledgedWrites.current.add(key);
      try {
        confirmed();
      } catch {
        if (current())
          reportClientError(new Error("COURSE_REVIEW_POST_ACK_UI_FAILED"), {
            issueKey: "CourseReviews",
            keys: { operation: "post_ack_ui" },
          });
      }
      try {
        hapticFeedback.success();
      } catch {
        if (current())
          reportClientError(new Error("COURSE_REVIEW_HAPTIC_FAILED"), {
            issueKey: "CourseReviews",
            keys: { operation: "haptic" },
          });
      }
      const outcome = await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["course-reviews", courseType, owner, epoch] }),
        queryClient.invalidateQueries({ queryKey: ["courses"] }),
      ]);
      if (current() && outcome.some((value) => value.status === "rejected")) {
        reportClientError(new Error("COURSE_REVIEW_CACHE_REFRESH_FAILED"), {
          issueKey: "CourseReviews",
          keys: { operation: "invalidate" },
        });
        setWriteNotice("Изменение сохранено. Список обновится при следующем открытии.");
      }
    } catch {
      if (!current()) return;
      if (!acknowledged) {
        unknownRef.current = true;
        setWriteUnknown(true);
        reportClientError(new Error("COURSE_REVIEW_WRITE_OUTCOME_UNKNOWN"), {
          issueKey: "CourseReviews",
          keys: { operation: "write" },
        });
        setWriteNotice(
          "Результат изменения неизвестен. Обновите страницу перед повторным действием.",
        );
      } else {
        reportClientError(new Error("COURSE_REVIEW_POST_ACK_LOCAL_FAILED"), {
          issueKey: "CourseReviews",
          keys: { operation: "post_ack" },
        });
        setWriteNotice("Изменение сохранено. Список обновится при следующем открытии.");
      }
    } finally {
      writeInFlight.current = false;
      if (current()) setWriteBusy(false);
    }
  };

  const reviewsData = isError ? undefined : reviewsResponse?.data;
  const reviews = reviewsData?.reviews || [];
  const userStatus = reviewsData?.userStatus;
  const canLeaveReview = Boolean(
    !acknowledgedWrites.current.has("create") &&
      owner &&
      epoch &&
      userStatus?.hasCompleted &&
      !userStatus.userReview &&
      !isEditing &&
      !writeUnknown,
  );

  const handleStartEdit = (review: CourseReview) => {
    if (!current() || writeInFlight.current || unknownRef.current || review.user.id !== owner)
      return;
    setIsEditing(true);
    setEditingReviewId(review.id);
    setRating(review.rating || 0);
    setComment(review.comment || "");
  };

  const handleCancelEdit = () => {
    if (!current() || writeInFlight.current || unknownRef.current) return;
    setIsEditing(false);
    setEditingReviewId(null);
    setRating(0);
    setComment("");
  };

  const handleSubmit = () => {
    if (!current() || writeInFlight.current || unknownRef.current || !owner || !epoch) return;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      Alert.alert("Ошибка", "Выберите рейтинг от 1 до 5.");
      return;
    }
    if (comment.length > 1000) {
      Alert.alert("Ошибка", "Комментарий не должен превышать 1000 символов.");
      return;
    }
    const trimmed = comment.trim();
    if (editingReviewId) {
      const id = editingReviewId;
      void runWrite(
        `update:${id}`,
        () => coursesApi.updateReview(id, rating, trimmed),
        () => {
          setIsEditing(false);
          setEditingReviewId(null);
          setRating(0);
          setComment("");
          Alert.alert("Успех", "Отзыв обновлён");
        },
      );
    } else {
      if (!userStatus?.hasCompleted || userStatus.userReview) return;
      void runWrite(
        "create",
        () => coursesApi.createReview(courseType, rating, trimmed),
        () => {
          setIsEditing(false);
          setRating(0);
          setComment("");
          Alert.alert("Успех", "Отзыв добавлен");
        },
      );
    }
  };
  const handleDelete = (reviewId: string) => {
    if (
      !current() ||
      writeInFlight.current ||
      unknownRef.current ||
      !owner ||
      !epoch ||
      !reviews.some((review) => review.id === reviewId && review.user.id === owner)
    )
      return;
    Alert.alert("Удалить отзыв?", "Вы уверены что хотите удалить свой отзыв?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => {
          if (!current() || unknownRef.current || writeInFlight.current) return;
          void runWrite(
            `delete:${reviewId}`,
            () => coursesApi.deleteReview(reviewId),
            () => {
              setIsEditing(false);
              setEditingReviewId(null);
              Alert.alert("Успех", "Отзыв удалён");
            },
          );
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ title: "Загрузка..." }} />
        <AppBackButton style={styles.backRow} onPress={() => router.back()} />
        <Loading fullScreen embedded message="Загрузка отзывов..." />
      </SafeAreaView>
    );
  }

  if (isError)
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ title: "Ошибка загрузки" }} />
        <AppBackButton
          style={styles.backRow}
          onPress={() => {
            if (current()) router.back();
          }}
        />
        <View style={styles.emptyState}>
          <Text accessibilityRole="alert" style={styles.emptyText}>
            Не удалось загрузить отзывы.
          </Text>
          {retryFailed && (
            <Text accessibilityRole="alert" style={styles.emptyText}>
              Не удалось повторно загрузить отзывы. Попробуйте ещё раз.
            </Text>
          )}
          <Button label="Повторить загрузку отзывов" onPress={() => void retry()} />
        </View>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen
        options={{
          title: `Отзывы к курсу "${reviewsData?.courseName || ""}"`,
        }}
      />
      <AppBackButton style={styles.backRow} onPress={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Отзывы к курсу &quot;{reviewsData?.courseName}&quot;</Text>
        {!!writeNotice && (
          <Text accessibilityRole="alert" style={styles.emptyText}>
            {writeNotice}
          </Text>
        )}

        {/* Форма для создания/редактирования отзыва */}
        {(canLeaveReview || isEditing) && (
          <View style={styles.reviewForm}>
            <Text style={styles.formTitle}>
              {isEditing ? "Редактировать отзыв" : "Оставить отзыв"}
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Рейтинг *</Text>
              <RatingStars rating={rating} interactive onRatingChange={setRating} />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Комментарий</Text>
              <TextInput
                style={styles.textarea}
                value={comment}
                onChangeText={setComment}
                placeholder="Поделитесь своими впечатлениями о курсе..."
                accessibilityLabel="Комментарий"
                accessibilityHint="Поделитесь впечатлениями о курсе"
                maxLength={1000}
                multiline
                numberOfLines={4}
                editable={!writeBusy && !writeUnknown}
              />
              <Text style={styles.charCount}>{comment.length}/1000</Text>
            </View>

            <View style={styles.formActions}>
              <Button
                label={writeBusy ? "Сохранение..." : isEditing ? "Сохранить" : "Отправить"}
                flex={1}
                height={42}
                fontFamily={FONTS.impact}
                fontWeight="600"
                fontSize={15}
                lineHeight={20}
                horizontalPadding={24}
                verticalPadding={12}
                borderRadius={12}
                onPress={handleSubmit}
                disabled={
                  writeBusy ||
                  writeUnknown ||
                  acknowledgedWrites.current.has(
                    editingReviewId ? `update:${editingReviewId}` : "create",
                  ) ||
                  rating === 0
                }
              />
              {isEditing && (
                <Pressable
                  style={styles.cancelButton}
                  onPress={handleCancelEdit}
                  disabled={writeBusy || writeUnknown}
                >
                  <Text style={styles.cancelButtonText}>Отмена</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Список отзывов */}
        {reviews.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Пока нет отзывов</Text>
          </View>
        ) : (
          <View style={styles.reviewsList}>
            {reviews.map((review) => {
              const isOwnReview = user?.id === review.user.id;
              const isCurrentlyEditing = editingReviewId === review.id;

              if (isCurrentlyEditing) return null;

              return (
                <View key={review.id} style={styles.reviewCard}>
                  {/* Строка 1: автор + дата слева, кнопки редактирования справа */}
                  <View style={styles.reviewHeader}>
                    <View style={styles.userInfo}>
                      {review.user.profile?.avatarUrl ? (
                        <Image
                          source={{ uri: review.user.profile.avatarUrl }}
                          style={styles.avatar}
                          contentFit="cover"
                        />
                      ) : (
                        <Image
                          source={require("../../../../assets/images/avatar.png")}
                          style={styles.avatar}
                          contentFit="cover"
                        />
                      )}
                      <View style={styles.userDetails}>
                        <Text style={styles.username}>{review.user.username}</Text>
                        <Text style={styles.date}>{formatDate(review.createdAt)}</Text>
                      </View>
                    </View>
                    {isOwnReview && !isEditing && (
                      <View style={styles.reviewActions}>
                        <Pressable
                          style={styles.actionButton}
                          onPress={() => handleStartEdit(review)}
                          disabled={writeBusy || writeUnknown}
                          hitSlop={8}
                        >
                          <Text style={styles.actionIcon}>✏️</Text>
                        </Pressable>
                        <Pressable
                          style={styles.actionButton}
                          onPress={() => handleDelete(review.id)}
                          disabled={writeBusy || writeUnknown}
                          hitSlop={8}
                        >
                          <Text style={styles.actionIcon}>🗑️</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                  {/* Строка 2: рейтинг (сердечки) */}
                  <View style={styles.ratingRow}>
                    <RatingStars rating={review.rating || 0} />
                  </View>

                  {review.comment && (
                    <View style={styles.commentContainer}>
                      <Text style={styles.commentText}>{review.comment}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 4,
  },
  backRowText: {
    fontSize: 17,
    color: COLORS.primary,
    fontWeight: "500",
    fontFamily: FONTS.montserrat,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  title: {
    fontSize: 24,
    fontWeight: "400",
    color: "#352E2E",
    textAlign: "center",
    marginBottom: SPACING.md,
    fontFamily: FONTS.impact,
  },
  reviewForm: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#352E2E",
    marginBottom: SPACING.md,
    fontFamily: FONTS.impact,
  },
  formGroup: {
    marginBottom: SPACING.md,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#352E2E",
    marginBottom: SPACING.xs,
    fontFamily: FONTS.montserrat,
  },
  starsContainer: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  starPressable: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  star: {
    fontSize: 28,
  },
  starFilled: {
    color: "#ff6d75",
  },
  starEmpty: {
    color: "#b0b0b0",
  },
  starInteractive: {
    opacity: 0.8,
  },
  textarea: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 8,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: "#D4C4A8",
    fontSize: 14,
    color: "#352E2E",
    fontFamily: FONTS.montserrat,
    minHeight: 100,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 12,
    color: "#636128",
    textAlign: "right",
    marginTop: 4,
    fontFamily: FONTS.montserrat,
  },
  formActions: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#ECE5D2",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  cancelButtonText: {
    color: "#352E2E",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: FONTS.impact,
  },
  emptyState: {
    padding: SPACING.lg,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#636128",
    fontFamily: FONTS.montserrat,
    fontStyle: "italic",
  },
  reviewsList: {
    gap: SPACING.md,
  },
  reviewCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#D4C4A8",
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#636128",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#ECE5D2",
    fontSize: 18,
    fontWeight: "600",
    fontFamily: FONTS.impact,
  },
  userDetails: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    fontSize: 14,
    fontWeight: "600",
    color: "#352E2E",
    fontFamily: FONTS.montserrat,
  },
  date: {
    fontSize: 12,
    color: "#636128",
    fontFamily: FONTS.montserrat,
    marginTop: 2,
  },
  ratingRow: {
    marginBottom: SPACING.sm,
  },
  reviewActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  actionButton: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  actionIcon: {
    fontSize: 22,
  },
  commentContainer: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: "#D4C4A8",
  },
  commentText: {
    fontSize: 14,
    color: "#352E2E",
    fontFamily: FONTS.montserrat,
    lineHeight: 20,
  },
});
