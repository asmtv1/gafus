import { apiClient, type ApiResponse } from "./client";

export interface TrainingDatesResponse {
  dates: string[];
}

export interface UserStats {
  totalTrainings: number;
  totalMinutes: number;
  currentStreak: number;
  longestStreak: number;
  completedCourses: number;
}

/**
 * API модуль для достижений
 */
export const achievementsApi = {
  /**
   * Получить даты тренировок для календаря
   */
  getTrainingDates: async (): Promise<ApiResponse<TrainingDatesResponse>> => {
    return apiClient<TrainingDatesResponse>("/api/v1/achievements/training-dates");
  },

  /**
   * Получить статистику пользователя
   */
  getStats: async (): Promise<ApiResponse<UserStats>> => {
    return apiClient<UserStats>("/api/v1/achievements/stats");
  },
};
