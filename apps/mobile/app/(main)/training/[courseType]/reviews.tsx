import { View, StyleSheet, ScrollView, Pressable, Alert, TextInput } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useState } from "react";

import { coursesApi, type CourseReview } from "@/shared/lib/api/courses";
import { useAuthStore } from "@/shared/stores";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING, FONTS } from "@/constants";

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
    <View style={styles.starsContainer}>
      {[1, 2, 3, 4, 5].map((value) => {
        const filled = value <= selected;
        return (
          <Pressable
            key={value}
            style={styles.starPressable}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={() => interactive && onRatingChange?.(value)}
            disabled={!interactive}
          >
            <Text
              style={[
                styles.star,
                filled ? styles.starFilled : styles.starEmpty,
                interactive && styles.starInteractive,
              ]}
            >
              {filled ? "♥" : "♡"}
            </Text>
          </Pressable>
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
  const queryClient = useQueryClient();
  const { courseType } = useLocalSearchParams<{ courseType: string }>();
  const user = useAuthStore((s) => s.user);

  const [isEditing, setIsEditing] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState<string>("");

  // Загрузка отзывов
  const { data: reviewsResponse, isLoading } = useQuery({
    queryKey: ["course-reviews", courseType],
    queryFn: async () => {
      const res = await coursesApi.getReviews(courseType as string);
      if (!res.success) throw new Error(res.error ?? "Ошибка загрузки отзывов");
      return res;
    },
    enabled: !!courseType,
  });

  // Создание отзыва
  const createMutation = useMutation({
    mutationFn: ({ rating, comment }: { rating: number; comment: string }) =>
      coursesApi.createReview(courseType as string, rating, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-reviews", courseType] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      hapticFeedback.success();
      setIsEditing(false);
      setRating(0);
      setComment("");
      Alert.alert("Успех", "Отзыв добавлен");
    },
    onError: (error) => {
      Alert.alert("Ошибка", error instanceof Error ? error.message : "Не удалось добавить отзыв");
    },
  });

  // Обновление отзыва
  const updateMutation = useMutation({
    mutationFn: ({
      reviewId,
      rating,
      comment,
    }: {
      reviewId: string;
      rating: number;
      comment: string;
    }) => coursesApi.updateReview(reviewId, rating, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-reviews", courseType] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      hapticFeedback.success();
      setIsEditing(false);
      setEditingReviewId(null);
      setRating(0);
      setComment("");
      Alert.alert("Успех", "Отзыв обновлен");
    },
    onError: (error) => {
      Alert.alert(
        "Ошибка",
        error instanceof Error ? error.message : "Не удалось обновить отзыв",
      );
    },
  });

  // Удаление отзыва
  const deleteMutation = useMutation({
    mutationFn: (reviewId: string) => coursesApi.deleteReview(reviewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-reviews", courseType] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      hapticFeedback.success();
      Alert.alert("Успех", "Отзыв удален");
    },
    onError: (error) => {
      Alert.alert("Ошибка", error instanceof Error ? error.message : "Не удалось удалить отзыв");
    },
  });

  const reviewsData = reviewsResponse?.data;
  const reviews = reviewsData?.reviews || [];
  const userStatus = reviewsData?.userStatus;
  const canLeaveReview =
    userStatus?.hasCompleted && !userStatus?.userReview && !isEditing;

  const handleStartEdit = (review: CourseReview) => {
    setIsEditing(true);
    setEditingReviewId(review.id);
    setRating(review.rating || 0);
    setComment(review.comment || "");
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingReviewId(null);
    setRating(0);
    setComment("");
  };

  const handleSubmit = () => {
    if (rating === 0) {
      Alert.alert("Ошибка", "Пожалуйста, выберите рейтинг");
      return;
    }

    if (editingReviewId) {
      updateMutation.mutate({ reviewId: editingReviewId, rating, comment });
    } else {
      createMutation.mutate({ rating, comment });
    }
  };

  const handleDelete = (reviewId: string) => {
    Alert.alert("Удалить отзыв?", "Вы уверены что хотите удалить свой отзыв?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => deleteMutation.mutate(reviewId),
      },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Stack.Screen options={{ title: "Загрузка..." }} />
        <Pressable style={styles.backRow} onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
          <Text style={styles.backRowText}>Назад</Text>
        </Pressable>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Загрузка отзывов...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen
        options={{
          title: `Отзывы к курсу "${reviewsData?.courseName || ""}"`,
        }}
      />
      <Pressable
        style={styles.backRow}
        onPress={() => router.back()}
        hitSlop={12}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.primary} />
        <Text style={styles.backRowText}>Назад</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Отзывы к курсу &quot;{reviewsData?.courseName}&quot;</Text>

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
                maxLength={1000}
                multiline
                numberOfLines={4}
                editable={!createMutation.isPending && !updateMutation.isPending}
              />
              <Text style={styles.charCount}>{comment.length}/1000</Text>
            </View>

            <View style={styles.formActions}>
              <Pressable
                style={[
                  styles.submitButton,
                  (createMutation.isPending || updateMutation.isPending || rating === 0) &&
                    styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending || rating === 0}
              >
                <Text style={styles.submitButtonText}>
                  {createMutation.isPending || updateMutation.isPending
                    ? "Сохранение..."
                    : isEditing
                      ? "Сохранить"
                      : "Отправить"}
                </Text>
              </Pressable>
              {isEditing && (
                <Pressable
                  style={styles.cancelButton}
                  onPress={handleCancelEdit}
                  disabled={createMutation.isPending || updateMutation.isPending}
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
                          disabled={
                            createMutation.isPending ||
                            updateMutation.isPending ||
                            deleteMutation.isPending
                          }
                          hitSlop={8}
                        >
                          <Text style={styles.actionIcon}>✏️</Text>
                        </Pressable>
                        <Pressable
                          style={styles.actionButton}
                          onPress={() => handleDelete(review.id)}
                          disabled={
                            createMutation.isPending ||
                            updateMutation.isPending ||
                            deleteMutation.isPending
                          }
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
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
    backgroundColor: "#F5F0E8",
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
    backgroundColor: "#FFF8E5",
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
  submitButton: {
    flex: 1,
    backgroundColor: "#636128",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: "#ECE5D2",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: FONTS.impact,
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
    backgroundColor: "#F5F0E8",
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
