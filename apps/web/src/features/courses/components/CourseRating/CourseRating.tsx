// src/components/CourseRating.tsx
"use client";

import { updateCourseRatingAction } from "@shared/server-actions";
import { createWebLogger } from "@gafus/logger";
import { useState } from "react";

import type {
  CourseRatingProps,
  LegacyCourseRatingProps,
  ClientCourseRatingProps,
} from "@gafus/types";

import { FavoriteIcon, FavoriteBorderIcon } from "@shared/utils/muiImports";
import { Rating } from "@shared/utils/muiImports";
import { showCourseRatingAlert, showErrorAlert, showSuccessAlert } from "@shared/utils/sweetAlert";
import styles from "./CourseRating.module.css";

// Создаем логгер для CourseRating
const logger = createWebLogger('web-course-rating');

// StyledRating теперь использует CSS модуль

export const CourseRating: React.FC<CourseRatingProps> = ({
  courseId,
  initialRating,
  readOnly = true,
  size = "small",
}) => {
  const [rating, setRating] = useState(initialRating);
  const [isSubmitting, setIsSubmitting] = useState(false);


  const handleRatingChange = async (event: React.SyntheticEvent, newValue: number | null) => {
    if (newValue === null || isSubmitting) return;

    // Если курс не завершен, показываем стилизованное уведомление
    if (readOnly) {
      await showCourseRatingAlert();
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateCourseRatingAction(courseId, newValue);

      if (result.success) {
        setRating(newValue);
        await showSuccessAlert("Рейтинг сохранен");
      } else {
        logger.error("Ошибка при сохранении рейтинга", new Error(result.error || "Unknown error"), {
          operation: 'save_rating_error',
          courseId: courseId,
          rating: newValue
        });
        await showErrorAlert(result.error || "Ошибка при сохранении рейтинга");
      }
    } catch (error) {
      logger.error("Ошибка при сохранении рейтинга", error as Error, {
        operation: 'save_rating_exception',
        courseId: courseId,
        rating: newValue
      });
      await showErrorAlert("Ошибка при сохранении рейтинга");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Если рейтинг равен 0 или null, показываем простой текст
  if (!rating || rating === 0) {
    return (
      <div className={`${styles.noRating} ${styles[size]}`}>
        <span>Нет рейтинга</span>
      </div>
    );
  }

  return (
    <Rating
      value={rating}
      onChange={handleRatingChange}
      disabled={isSubmitting}
      readOnly={readOnly}
      size={size}
      icon={<FavoriteIcon fontSize="inherit" />}
      emptyIcon={<FavoriteBorderIcon fontSize="inherit" />}
      className={styles.styledRating}
    />
  );
};

// Обратная совместимость
export const LegacyCourseRating: React.FC<LegacyCourseRatingProps> = ({
  value,
  readOnly = true,
  size = "small",
}) => {
  return (
    <Rating
      value={value}
      readOnly={readOnly}
      size={size}
      icon={<FavoriteIcon fontSize="inherit" />}
      emptyIcon={<FavoriteBorderIcon fontSize="inherit" />}
      className={styles.styledRating}
    />
  );
};

export const ClientCourseRating: React.FC<ClientCourseRatingProps> = ({
  courseId,
  initialRating,
}) => {
  return <CourseRating courseId={courseId} initialRating={initialRating} readOnly={false} />;
};

// Простой компонент рейтинга без Material-UI для мобильных устройств
export const SimpleCourseRating: React.FC<CourseRatingProps> = ({
  courseId,
  initialRating,
  readOnly = true,
  size = "small",
}) => {
  const [rating, setRating] = useState(initialRating);
  const [isSubmitting, setIsSubmitting] = useState(false);


  const handleRatingChange = async (newValue: number) => {
    if (isSubmitting) return;

    // Если курс не завершен, показываем стилизованное уведомление
    if (readOnly) {
      await showCourseRatingAlert();
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateCourseRatingAction(courseId, newValue);
      if (result.success) {
        setRating(newValue);
        await showSuccessAlert("Рейтинг сохранен");
      } else {
        logger.error("Ошибка при сохранении рейтинга", new Error(result.error || "Unknown error"), {
          operation: 'save_rating_error',
          courseId: courseId,
          rating: newValue
        });
        await showErrorAlert(result.error || "Ошибка при сохранении рейтинга");
      }
    } catch (error) {
      logger.error("Ошибка при сохранении рейтинга", error as Error, {
        operation: 'save_rating_exception',
        courseId: courseId,
        rating: newValue
      });
      await showErrorAlert("Ошибка при сохранении рейтинга");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`${styles.simpleRating} ${styles[size]}`}>
      {[1, 2, 3, 4, 5].map((heart) => (
        <span
          key={heart}
          onClick={() => handleRatingChange(heart)}
          className={`${styles.simpleRatingHeart} ${
            readOnly ? styles.readOnly : ''
          } ${
            heart <= (rating || 0) ? styles.filled : styles.empty
          }`}
        >
          ♥
        </span>
      ))}
      {rating !== null && rating !== undefined && (
        <span className={styles.simpleRatingValue}>
          {rating === 0 ? "0" : rating.toFixed(1)}
        </span>
      )}
    </div>
  );
};
