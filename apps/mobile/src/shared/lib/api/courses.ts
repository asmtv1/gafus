import { apiClient, type ApiResponse } from "./client";

// Интерфейс курса соответствует CourseWithProgressData из API
export interface Course {
  id: string;
  name: string;
  type: string;
  shortDesc: string;
  description: string;
  logoImg: string;
  duration: string;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  isPrivate: boolean;
  isPaid: boolean;
  avgRating: number | null;
  createdAt: Date | string;
  authorUsername: string;
  userStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "PAUSED";
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  isFavorite: boolean;
  reviews?: Array<{
    rating: number | null;
    comment: string;
    createdAt: Date | string;
    user: {
      username: string;
      profile?: {
        avatarUrl: string | null;
      } | null;
    };
  }>;
}

// API возвращает массив курсов напрямую, а не объект с полем courses
export type CoursesResponse = Course[];

export interface CourseFilters {
  type?: string;
  level?: string;
  search?: string;
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
    const endpoint = `/api/v1/courses`;

    return apiClient<CoursesResponse>(endpoint);
  },

  /**
   * Получение курса по типу
   */
  getByType: async (type: string): Promise<ApiResponse<Course>> => {
    return apiClient<Course>(`/api/v1/courses/${type}`);
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
};
