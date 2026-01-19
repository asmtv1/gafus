// UI-специфичные типы для CourseCard

import type { CourseCardData } from "@gafus/types";

export interface CourseCardProps extends CourseCardData {
  // UI события
  onToggleFavorite?: () => void;
  onUnfavorite?: (courseId: string) => void;
}

export type CourseCardPropsWithIndex = CourseCardProps & {
  index: number;
};
