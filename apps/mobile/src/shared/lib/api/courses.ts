import { apiClient, type ApiResponse } from "./client";

export interface Course {
  id: string;
  name: string;
  type: string;
  shortDesc: string;
  description: string;
  logoImg: string;
  videoUrl: string | null;
  duration: string;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  isActive: boolean;
  totalDays: number;
  version: string;
}

export interface CoursesResponse {
  courses: Course[];
  total: number;
}

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
   * Получение списка всех курсов
   */
  getAll: async (filters?: CourseFilters): Promise<ApiResponse<CoursesResponse>> => {
    const params = new URLSearchParams();
    
    if (filters?.type) params.append("type", filters.type);
    if (filters?.level) params.append("level", filters.level);
    if (filters?.search) params.append("search", filters.search);

    const queryString = params.toString();
    const endpoint = `/api/v1/courses${queryString ? `?${queryString}` : ""}`;

    return apiClient<CoursesResponse>(endpoint);
  },

  /**
   * Получение курса по типу
   */
  getByType: async (type: string): Promise<ApiResponse<Course>> => {
    return apiClient<Course>(`/api/v1/courses/${type}`);
  },

  /**
   * Получение избранных курсов пользователя
   */
  getFavorites: async (): Promise<ApiResponse<Course[]>> => {
    return apiClient<Course[]>("/api/v1/courses/favorites");
  },

  /**
   * Добавление курса в избранное
   */
  addToFavorites: async (courseId: string): Promise<ApiResponse<void>> => {
    return apiClient<void>(`/api/v1/courses/${courseId}/favorite`, {
      method: "POST",
    });
  },

  /**
   * Удаление курса из избранного
   */
  removeFromFavorites: async (courseId: string): Promise<ApiResponse<void>> => {
    return apiClient<void>(`/api/v1/courses/${courseId}/favorite`, {
      method: "DELETE",
    });
  },
};
