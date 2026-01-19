// UI-специфичные типы для CourseRating

export interface CourseRatingProps {
  courseId: string;
  initialRating: number;
  readOnly?: boolean;
  size?: "small" | "medium" | "large";
}

export interface LegacyCourseRatingProps {
  value: number;
  readOnly?: boolean;
  size?: "small" | "medium" | "large";
}

export interface ClientCourseRatingProps {
  courseId: string;
  initialRating: number;
  userId?: string;
  existingReview?: boolean;
  userRating?: number;
  canRate?: boolean;
}
