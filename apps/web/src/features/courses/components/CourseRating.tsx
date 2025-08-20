// src/components/CourseRating.tsx
"use client";

import { updateCourseRatingAction } from "@shared/lib/course/updateCourseRating";
import { useState } from "react";

import type {
  CourseRatingProps,
  LegacyCourseRatingProps,
  ClientCourseRatingProps,
} from "@gafus/types";

import { FavoriteIcon, FavoriteBorderIcon } from "@/utils/muiImports";
import { Rating, styled } from "@/utils/muiImports";

const StyledRating = styled(Rating)({
  "& .MuiRating-iconFilled": {
    color: "#ff6d75",
  },
  "& .MuiRating-iconHover": {
    color: "#ff3d47",
  },
});

export const CourseRating: React.FC<CourseRatingProps> = ({
  courseId,
  initialRating,
  readOnly = true,
  size = "small",
}) => {
  const [rating, setRating] = useState(initialRating);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRatingChange = async (event: React.SyntheticEvent, newValue: number | null) => {
    if (newValue === null || isSubmitting || readOnly) return;

    setIsSubmitting(true);
    try {
      const result = await updateCourseRatingAction(courseId, newValue);

      if (result.success) {
        setRating(newValue);
      } else {
        console.error("Ошибка при сохранении рейтинга:", result.error);
      }
    } catch (error) {
      console.error("Ошибка при сохранении рейтинга:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <StyledRating
      value={rating}
      onChange={handleRatingChange}
      disabled={isSubmitting}
      readOnly={readOnly}
      size={size}
      icon={<FavoriteIcon fontSize="inherit" />}
      emptyIcon={<FavoriteBorderIcon fontSize="inherit" />}
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
    <StyledRating
      value={value}
      readOnly={readOnly}
      size={size}
      icon={<FavoriteIcon fontSize="inherit" />}
      emptyIcon={<FavoriteBorderIcon fontSize="inherit" />}
    />
  );
};

export const ClientCourseRating: React.FC<ClientCourseRatingProps> = ({
  courseId,
  initialRating,
}) => {
  return <CourseRating courseId={courseId} initialRating={initialRating} readOnly={false} />;
};
