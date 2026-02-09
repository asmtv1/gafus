"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { CourseReviewData, UserReviewStatus } from "@shared/server-actions";
import { showSuccessAlert, showErrorAlert, showConfirmDialog } from "@shared/utils/sweetAlert";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { useReviewsStore } from "@shared/stores/reviewsStore";
import styles from "./ReviewsList.module.css";

interface ReviewsListProps {
  courseType: string;
  courseName: string;
  reviews: CourseReviewData[];
  userStatus?: UserReviewStatus;
}

export function ReviewsList({
  courseType,
  courseName,
  reviews: initialReviews,
  userStatus: initialUserStatus,
}: ReviewsListProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Store
  const { reviews, userStatus, isLoading, error, setReviews, addReview, editReview, removeReview } =
    useReviewsStore();

  // Инициализация store данными с сервера
  useEffect(() => {
    setReviews(initialReviews, initialUserStatus);
  }, [initialReviews, initialUserStatus, setReviews]);

  // Получаем ID текущего пользователя
  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const renderStars = (currentRating: number, interactive: boolean = false) => {
    return (
      <div className={styles.stars}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={
              star <= currentRating
                ? styles.starFilled
                : interactive
                  ? styles.starInteractive
                  : styles.starEmpty
            }
            onClick={interactive ? () => setRating(star) : undefined}
            style={interactive ? { cursor: "pointer" } : undefined}
          >
            ♥
          </span>
        ))}
      </div>
    );
  };

  const handleStartEdit = (review: CourseReviewData) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      await showErrorAlert("Пожалуйста, выберите рейтинг");
      return;
    }

    try {
      let success;

      if (editingReviewId) {
        // Обновление существующего отзыва
        success = await editReview(editingReviewId, rating, comment);
      } else {
        // Создание нового отзыва
        success = await addReview(courseType, rating, comment);
      }

      if (success) {
        await showSuccessAlert(editingReviewId ? "Отзыв обновлен" : "Отзыв добавлен");
        handleCancelEdit();
        // Перезагружаем страницу для обновления рейтинга курса
        window.location.reload();
      } else {
        await showErrorAlert(error || "Произошла ошибка при сохранении отзыва");
      }
    } catch {
      await showErrorAlert("Произошла ошибка при сохранении отзыва");
    }
  };

  const handleDelete = async (reviewId: string) => {
    const confirmed = await showConfirmDialog(
      "Удалить отзыв?",
      "Вы уверены что хотите удалить свой отзыв?",
    );

    if (!confirmed) return;

    try {
      const success = await removeReview(reviewId);

      if (success) {
        await showSuccessAlert("Отзыв удален");
        // Перезагружаем страницу для обновления рейтинга курса
        window.location.reload();
      } else {
        await showErrorAlert(error || "Произошла ошибка при удалении отзыва");
      }
    } catch {
      await showErrorAlert("Произошла ошибка при удалении отзыва");
    }
  };

  const canLeaveReview = userStatus?.hasCompleted && !userStatus?.userReview && !isEditing;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Отзывы к курсу &quot;{courseName}&quot;</h1>
      </div>

      {/* Форма для создания/редактирования отзыва */}
      {(canLeaveReview || isEditing) && (
        <div className={styles.reviewForm}>
          <h2 className={styles.formTitle}>
            {isEditing ? "Редактировать отзыв" : "Оставить отзыв"}
          </h2>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Рейтинг *</label>
              {renderStars(rating, true)}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Комментарий</label>
              <textarea
                className={styles.textarea}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Поделитесь своими впечатлениями о курсе..."
                maxLength={1000}
                rows={4}
                disabled={isLoading}
              />
              <span className={styles.charCount}>{comment.length}/1000</span>
            </div>

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={isLoading || rating === 0}
              >
                {isLoading ? "Сохранение..." : isEditing ? "Сохранить" : "Отправить"}
              </button>
              {isEditing && (
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={handleCancelEdit}
                  disabled={isLoading}
                >
                  Отмена
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Список отзывов */}
      {reviews.length === 0 ? (
        <div className={styles.emptyState}>
          <p>Пока нет отзывов</p>
        </div>
      ) : (
        <div className={styles.reviewsList}>
          {reviews.map((review) => {
            const isOwnReview = currentUserId === review.user.id;
            const isCurrentlyEditing = editingReviewId === review.id;

            // Скрываем отзыв если он редактируется
            if (isCurrentlyEditing) return null;

            return (
              <div key={review.id} className={styles.reviewCard}>
                <div className={styles.reviewHeader}>
                  <div className={styles.userInfo}>
                    {review.user.profile?.avatarUrl ? (
                      <Image
                        src={review.user.profile.avatarUrl}
                        alt={review.user.username}
                        width={40}
                        height={40}
                        className={styles.avatar}
                      />
                    ) : (
                      <div className={styles.avatarPlaceholder}>
                        {review.user.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className={styles.userDetails}>
                      <span className={styles.username}>{review.user.username}</span>
                      <span className={styles.date}>{formatDate(review.createdAt)}</span>
                    </div>
                  </div>
                  <div className={styles.ratingAndActions}>
                    {renderStars(review.rating || 0)}
                    {isOwnReview && !isEditing && (
                      <div className={styles.reviewActions}>
                        <button
                          className={styles.editButton}
                          onClick={() => handleStartEdit(review)}
                          disabled={isLoading}
                          title="Редактировать"
                        >
                          ✏️
                        </button>
                        <button
                          className={styles.deleteButton}
                          onClick={() => handleDelete(review.id)}
                          disabled={isLoading}
                          title="Удалить"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {review.comment && (
                  <div className={styles.comment}>
                    <p>{review.comment}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
