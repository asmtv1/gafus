// Feature-level типы для courses

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
