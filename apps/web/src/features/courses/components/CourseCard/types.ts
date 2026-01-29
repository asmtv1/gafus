// UI-специфичные типы для CourseCard

import type { CourseCardData } from "@gafus/types";

export interface PaidCourseClickPayload {
  id: string;
  name: string;
  type: string;
  priceRub: number;
}

export interface CourseCardProps extends CourseCardData {
  // UI события
  onToggleFavorite?: () => void;
  onUnfavorite?: (courseId: string) => void;
  onPaidCourseClick?: (course: PaidCourseClickPayload) => void;
}

export type CourseCardPropsWithIndex = CourseCardProps & {
  index: number;
};
