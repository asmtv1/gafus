import type { CourseWithProgressWire, CourseCatalogCardWire } from "@gafus/types";
import { apiClient, type ApiResponse } from "./client";
import { collectCourseCatalog } from "./courseCatalogPages";

// Интерфейс курса соответствует CourseWithProgressData из API
export interface Course {
  id: string;
  name: string;
  type: string;
  shortDesc: string;
  description: string;
  hasAccess?: boolean;
  logoImg: string;
  duration: string;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  equipment?: string | null;
  isPrivate: boolean;
  isPaid: boolean;
  avgRating: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  authorUsername: string;
  authorAvatarUrl?: string | null;
  userStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED" | "RESET";
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  startedUsersCount?: number;
  userCourses?: {
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED" | "RESET";
  }[];
  isFavorite: boolean;
  reviewsCount?: number;
  reviews?: {
    rating: number | null;
    comment: string;
    createdAt: Date | string;
    user: {
      username: string;
      profile?: {
        avatarUrl: string | null;
      } | null;
    };
  }[];
  dayLinks?: {
    id?: string;
    order: number;
    day: {
      id: string;
      title: string;
    };
  }[];
}

// Authenticated GET /api/v1/courses returns AG1's serialized Date-to-string wire.
// Keep legacy Course separate for favorites, detail, reviews and stored/native flows.
export type CourseListItem = Omit<CourseCatalogCardWire, "reviewsCount" | "startedUsersCount"> &
  Partial<Pick<CourseWithProgressWire, "reviews" | "dayLinks" | "userCourses" | "startedUsersCount">> &
  { reviewsCount?: number };
// API возвращает массив курсов напрямую, а не объект с полем courses.
export type CoursesResponse = CourseListItem[];

export interface CourseFilters {
  type?: string;
  level?: string;
  search?: string;
}

export interface CourseReview {
  id: string;
  rating: number | null;
  comment: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    profile?: {
      avatarUrl: string | null;
    } | null;
  };
}

export interface CourseReviewsResponse {
  courseName: string;
  reviews: CourseReview[];
  userStatus: {
    hasCompleted: boolean;
    userReview: CourseReview | null;
  };
}

export interface SaveCoursePersonalizationData {
  courseId: string;
  userDisplayName: string;
  userGender: "male" | "female";
  petName: string;
  petGender?: "male" | "female" | null;
  petNameGen?: string | null;
  petNameDat?: string | null;
  petNameAcc?: string | null;
  petNameIns?: string | null;
  petNamePre?: string | null;
}

/**
 * API модуль для работы с курсами
 */
export const coursesApi = {
  /**
   * Получение списка всех курсов с прогрессом пользователя
   * API возвращает массив курсов напрямую
   */
  getAll: async (
    _filters?: CourseFilters,
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<CoursesResponse>> => {
    // The entire visible list remains available to local search, tab counts and
    // sorting, but each database response is a bounded lightweight card page.
    // Fence all pages to the same credential generation (including refresh).
    const { getSettledAuthSessionGeneration, useAuthStore } = await import("@/shared/stores/authStore");
    const generation = getSettledAuthSessionGeneration();
    const owner = useAuthStore.getState().user?.id;
    const guard = () => generation !== null && !!owner &&
      getSettledAuthSessionGeneration() === generation &&
      useAuthStore.getState().user?.id === owner && (requestGuard?.() ?? true);
    return collectCourseCatalog(
      path => apiClient<unknown>(path, {
        headers: { Accept: "application/vnd.gafus.course-cards+json" }, requestGuard: guard,
      }),
      guard,
    );
  },

  /**
   * Получение курса по типу
   */
  getByType: async (type: string): Promise<ApiResponse<Course>> => {
    return apiClient<Course>(`/api/v1/courses/${type}`);
  },

  /**
   * Проверить доступ к курсу
   */
  checkAccess: async (
    courseType: string,
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<{ hasAccess: boolean }>> => {
    return apiClient<{ hasAccess: boolean }>(
      `/api/v1/courses/access?courseType=${encodeURIComponent(courseType)}`,
      { ...(requestGuard ? { requestGuard } : {}) },
    );
  },

  /**
   * Получение избранных курсов (как в web: { data, favoriteIds })
   */
  getFavorites: async (): Promise<ApiResponse<{ data: Course[]; favoriteIds: string[] }>> => {
    return apiClient<{ data: Course[]; favoriteIds: string[] }>("/api/v1/courses/favorites");
  },

  /**
   * Добавить/удалить из избранного (как в web: POST /favorites, action add|remove)
   */
  toggleFavorite: async (
    courseId: string,
    action: "add" | "remove",
  ): Promise<ApiResponse<{ isFavorite: boolean }>> => {
    return apiClient<{ isFavorite: boolean }>("/api/v1/courses/favorites", {
      method: "POST",
      body: { courseId, action },
    });
  },

  /**
   * Получение отзывов к курсу
   */
  getReviews: async (
    courseType: string,
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<CourseReviewsResponse>> => {
    const endpoint = `/api/v1/courses/reviews?courseType=${encodeURIComponent(courseType)}`;
    return requestGuard
      ? apiClient<CourseReviewsResponse>(endpoint, { requestGuard })
      : apiClient<CourseReviewsResponse>(endpoint);
  },

  /**
   * Создание отзыва
   */
  createReview: async (
    courseType: string,
    rating: number,
    comment: string,
  ): Promise<ApiResponse<CourseReview>> => {
    return apiClient<CourseReview>("/api/v1/courses/reviews", {
      method: "POST",
      body: { courseType, rating, comment },
    });
  },

  /**
   * Обновление отзыва
   */
  updateReview: async (
    reviewId: string,
    rating: number,
    comment: string,
  ): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/courses/reviews", {
      method: "PATCH",
      body: { reviewId, rating, comment },
    });
  },

  /**
   * Удаление отзыва
   */
  deleteReview: async (reviewId: string): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/courses/reviews", {
      method: "DELETE",
      body: { reviewId },
    });
  },

  /**
   * Сохранить персонализацию курса
   */
  savePersonalization: async (
    payload: SaveCoursePersonalizationData,
  ): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/courses/personalization", {
      method: "POST",
      body: payload,
    });
  },
};
