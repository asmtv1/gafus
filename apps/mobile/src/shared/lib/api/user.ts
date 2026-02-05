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

/** Курс в публичном профиле кинолога */
export interface PublicProfileCourse {
  id: string;
  name: string;
  type: string;
  logoImg: string;
  shortDesc: string;
  duration: string;
  isPrivate: boolean;
  isPaid: boolean;
  priceRub: number | null;
  avgRating: number | null;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
}

/** Публичный профиль (структура как в API / profile из web) */
export interface PublicProfile {
  username: string;
  role: string;
  profile: {
    fullName: string | null;
    birthDate: string | null;
    about: string | null;
    telegram: string | null;
    instagram: string | null;
    website: string | null;
    avatarUrl: string | null;
  } | null;
  diplomas?: { id: string; title: string; issuedBy: string | null; issuedAt: string }[];
  pets?: unknown[];
  /** Курсы кинолога (только при role === TRAINER) */
  courses?: PublicProfileCourse[];
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
   * Получить публичный профиль по username
   */
  getPublicProfile: async (username: string): Promise<ApiResponse<PublicProfile>> => {
    return apiClient<PublicProfile>(`/api/v1/user/profile/public?username=${username}`);
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
