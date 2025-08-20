import type { BaseUser, BaseDay } from "./common";
import type { CourseFormData } from "./forms";
import type { CourseCardProps } from "../data/course";
import type { Control, FieldErrors } from "react-hook-form";
export interface FavoriteButtonProps {
  id: string;
  isFavorite?: boolean;
  onUnfavorite?: (courseId: string) => void;
}
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
export type CourseCardPropsWithIndex = CourseCardProps & {
  index: number;
};
export interface PopularCoursesProps {
  limit?: number;
  className?: string;
  title?: string;
}
export interface FavoritesCourseListCourse {
  id: string;
  title: string;
  coverImageUrl: string;
  isFavorite: boolean;
  description?: string;
  level?: string;
  duration?: string;
  frequency?: string;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}
export interface FavoritesListProps {
  courses: FavoritesCourseListCourse[];
}
export interface CourseDetailsFieldsProps {
  control: Control<CourseFormData>;
  errors: FieldErrors<CourseFormData>;
}
export interface CourseVisibilitySelectorProps {
  control: Control<CourseFormData>;
}
export type CourseFormUser = BaseUser;
export type CourseFormDay = BaseDay;
export interface CourseFormProps {
  users: CourseFormUser[];
  days: CourseFormDay[];
}
export type DaySelectorDay = BaseDay;
export type PrivateUsersSelectorUser = BaseUser;
export interface PrivateUsersSelectorProps {
  control: Control<CourseFormData>;
  users: PrivateUsersSelectorUser[];
}
//# sourceMappingURL=course.d.ts.map
