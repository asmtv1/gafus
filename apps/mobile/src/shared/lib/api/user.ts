import { apiClient, type ApiResponse } from "./client";
import type { User } from "./auth";

export interface UpdateProfileData {
  fullName?: string;
  about?: string;
  telegram?: string;
  instagram?: string;
  website?: string;
  birthDate?: string;
}

export interface UserPreferences {
  notifications: boolean;
  theme: "light" | "dark" | "system";
  language: string;
}

/**
 * API модуль для работы с профилем пользователя
 */
export const userApi = {
  /**
   * Получить профиль текущего пользователя
   */
  getProfile: async (): Promise<ApiResponse<User>> => {
    return apiClient<User>("/api/v1/user/profile");
  },

  /**
   * Обновить профиль
   */
  updateProfile: async (data: UpdateProfileData): Promise<ApiResponse<User>> => {
    return apiClient<User>("/api/v1/user/profile", {
      method: "PUT",
      body: data,
    });
  },

  /**
   * Получить настройки пользователя
   */
  getPreferences: async (): Promise<ApiResponse<UserPreferences>> => {
    return apiClient<UserPreferences>("/api/v1/user/preferences");
  },

  /**
   * Обновить настройки
   */
  updatePreferences: async (
    data: Partial<UserPreferences>,
  ): Promise<ApiResponse<UserPreferences>> => {
    return apiClient<UserPreferences>("/api/v1/user/preferences", {
      method: "PUT",
      body: data,
    });
  },
};
