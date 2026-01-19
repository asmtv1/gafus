// State shape для курсов (БЕЗ методов)

import type { CourseWithProgressData } from "../data/course";

export interface CourseCache {
  data: CourseWithProgressData[];
  timestamp: number;
  type?: string; // для фильтрации по типу курса
}

export type ImageCache = Record<
  string,
  {
    loaded: boolean;
    timestamp: number;
    error: boolean;
  }
>;

export type CourseStoreStats = Record<
  string,
  {
    views: number;
    lastViewed: number;
    rating: number | null;
    reviews: number;
  }
>;

export interface CourseStateData {
  // Кэшированные данные курсов
  allCourses: CourseCache | null;
  favorites: CourseCache | null;
  authored: CourseWithProgressData[] | null;

  // ID избранных курсов (для мгновенного обновления UI)
  favoriteCourseIds: Set<string>;

  // Состояние загрузки
  loading: {
    all: boolean;
    favorites: boolean;
    authored: boolean;
  };

  // Ошибки
  errors: {
    all: string | null;
    favorites: string | null;
    authored: string | null;
  };

  // Кэш изображений
  imageCache: ImageCache;

  // Статистика просмотров
  courseStats: CourseStoreStats;

  // Предзагруженные курсы
  prefetchedCourses: Set<string>;
}
