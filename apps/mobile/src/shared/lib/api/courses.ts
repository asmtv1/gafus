import { apiClient, type ApiResponse } from "./client";

// Интерфейс курса соответствует CourseWithProgressData из API
export interface Course {
  id: string;
  name: string;
  type: string;
  shortDesc: string;
  description: string;
  priceRub?: number | null;
  hasAccess?: boolean;
  logoImg: string;
  duration: string;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  equipment?: string | null;
  isPrivate: boolean;
  isPaid: boolean;
  avgRating: number | null;
  createdAt: Date | string;
  authorUsername: string;
  authorAvatarUrl?: string | null;
  userStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED" | "RESET";
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  isFavorite: boolean;
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
    order: number;
    day: {
      id: string;
      title: string;
    };
  }[];
}

// API возвращает массив курсов напрямую, а не объект с полем courses
export type CoursesResponse = Course[];

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

/**
 * API модуль для работы с курсами
 */
export const coursesApi = {
  /**
   * Получение списка всех курсов с прогрессом пользователя
   * API возвращает массив курсов напрямую
   */
  getAll: async (filters?: CourseFilters): Promise<ApiResponse<CoursesResponse>> => {
    // API не поддерживает фильтры через query params, фильтрация делается на клиенте
    const endpoint = "/api/v1/courses";

    return apiClient<CoursesResponse>(endpoint);
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
  ): Promise<ApiResponse<{ hasAccess: boolean }>> => {
    return apiClient<{ hasAccess: boolean }>(
      `/api/v1/courses/access?courseType=${courseType}`,
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
  getReviews: async (courseType: string): Promise<ApiResponse<CourseReviewsResponse>> => {
    return apiClient<CourseReviewsResponse>(`/api/v1/courses/reviews?courseType=${courseType}`);
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
};
