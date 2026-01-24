import { apiClient, type ApiResponse } from "./client";
import type { AchievementData } from "@gafus/types";

export interface TrainingDatesResponse {
  dates: string[];
}

/**
 * API модуль для достижений (логика и дизайн как на web).
 */
export const achievementsApi = {
  getTrainingDates: async (): Promise<ApiResponse<TrainingDatesResponse>> => {
    return apiClient<TrainingDatesResponse>("/api/v1/achievements/training-dates");
  },

  /**
   * Полная статистика и достижения (GET /api/v1/achievements).
   */
  getAchievements: async (): Promise<ApiResponse<AchievementData>> => {
    return apiClient<AchievementData>("/api/v1/achievements");
  },
};
