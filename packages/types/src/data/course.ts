// Типы для курсов и связанных данных
import type { TrainingStatus } from "../utils/training-status";

export interface CourseWithProgressData {
  id: string;
  name: string;
  type: string;
  description: string;
  shortDesc: string;
  duration: string;
  logoImg: string;
  isPrivate: boolean;
  avgRating: number | null;
  createdAt: Date;
  authorUsername: string;
  userStatus: TrainingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  isFavorite: boolean;
  reviews: CourseReview[];
  userCourses: UserCourse[];
  dayLinks: DayLink[];
}

// ===== ТИПЫ ДЛЯ COURSE STORE =====

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

export interface CourseState {
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

  // Действия для курсов
  setAllCourses: (courses: CourseWithProgressData[], type?: string) => void;
  setFavorites: (courses: CourseWithProgressData[]) => void;
  setAuthored: (courses: CourseWithProgressData[]) => void;

  // Действия для избранного
  addToFavorites: (courseId: string) => void;
  removeFromFavorites: (courseId: string) => void;
  isFavorite: (courseId: string) => boolean;
  setFavoriteCourseIds: (courseIds: string[]) => void;

  // Действия для загрузки
  setLoading: (key: "all" | "favorites" | "authored", loading: boolean) => void;
  setError: (key: "all" | "favorites" | "authored", error: string | null) => void;

  // Действия для изображений
  markImageLoaded: (url: string) => void;
  markImageError: (url: string) => void;
  isImageCached: (url: string) => boolean;

  // Действия для статистики
  setCourseStats: (stats: CourseStoreStats) => void;
  getCourseStats: () => CourseStoreStats;

  // Действия для предзагрузки
  markPrefetched: (courseId: string) => void;
  isPrefetched: (courseId: string) => boolean;

  // SWR интеграция
  syncWithSWR: (key: "all" | "favorites" | "authored", data: CourseWithProgressData[]) => void;
  invalidateCache: (key: "all" | "favorites" | "authored") => void;
  invalidateFavoritesCache: () => void;

  // Утилиты
  isStale: (cache: CourseCache | null, maxAge?: number) => boolean;
  getCourseById: (courseId: string) => CourseWithProgressData | null;
  getPopularCourses: (limit?: number) => CourseWithProgressData[];
  clearCache: () => void;
}

export interface CourseReview {
  rating: number | null;
  comment: string | null;
  createdAt: Date;
  user: {
    username: string;
    profile: {
      avatarUrl: string | null;
    } | null;
  };
}

export interface UserCourse {
  userId: string;
  status: TrainingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  user: {
    username: string;
    profile: {
      avatarUrl: string | null;
    } | null;
  };
}

export interface DayLink {
  order: number;
  day: {
    id: string;
    title: string;
    stepLinks: {
      id: string;
      order: number;
      step: {
        title: string;
      };
    }[];
  };
}

// Типы для компонентов курсов
export interface CourseCardProps {
  id: string;
  name: string;
  type: string;
  duration: string;
  logoImg: string;
  isPrivate: boolean;
  userStatus: TrainingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  shortDesc: string;
  authorUsername: string;
  createdAt: Date;
  avgRating: number | null;
  reviews: CourseReview[];
  isFavorite: boolean;
  onToggleFavorite?: () => void;
  onUnfavorite?: (courseId: string) => void;
}

export interface CourseWithProgress {
  id: string;
  name: string;
  logoImg: string;
  avgRating: number | null;
  isFavorite: boolean;
  userStatus: TrainingStatus;
}

// Типы для статистики
export interface CourseStats {
  id: string;
  name: string;
  logoImg: string;
  avgRating: number | null;
  isPrivate: boolean;
  totalUsers: number;
  completedUsers: number;
  inProgressUsers: number;
  notStartedUsers: number;
  reviews: CourseReview[];
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
}

// Тип для курсов автора (статистика)
export interface AuthoredCourse {
  id: string;
  name: string;
  logoImg: string;
  avgRating: number | null;
  totalStarted: number;
  totalCompleted: number;
  totalRatings: number;
  reviews: CourseReview[];
  userProgress: {
    userId: string;
    username: string;
    avatarUrl: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    days: {
      dayOrder: number;
      dayTitle: string;
      status: TrainingStatus;
      steps: {
        stepOrder: number;
        stepTitle: string;
        status: TrainingStatus;
      }[];
    }[];
  }[];
}
