import { apiClient, type ApiResponse } from "./client";
import type { AchievementDataWire } from "@gafus/types";

export interface TrainingDatesResponse {
  dates: string[];
}

/**
 * API модуль для достижений (логика и дизайн как на web).
 */
export const achievementsApi = {
  getTrainingDates: async (
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<TrainingDatesResponse>> => {
    return apiClient<TrainingDatesResponse>("/api/v1/achievements/training-dates", {
      ...(requestGuard ? { requestGuard } : {}),
      suppressSubscriptionPaywall: true,
    });
  },

  /**
   * Полная статистика и достижения (GET /api/v1/achievements).
   */
  getAchievements: async (
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<AchievementDataWire>> => {
    return apiClient<AchievementDataWire>("/api/v1/achievements", {
      ...(requestGuard ? { requestGuard } : {}),
      suppressSubscriptionPaywall: true,
    });
  },
};
