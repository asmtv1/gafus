import * as SecureStore from "expo-secure-store";

import { apiClient, type ApiResponse } from "./client";
import type { User } from "./auth";
import { API_BASE_URL } from "@/constants";

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

  /**
   * Запрос кода смены телефона (отправка в Telegram).
   */
  requestPhoneChange: async (): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/auth/phone-change-request", { method: "POST" });
  },

  /**
   * Подтверждение смены телефона по коду.
   */
  confirmPhoneChange: async (
    code: string,
    newPhone: string,
  ): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/auth/phone-change-confirm", {
      method: "POST",
      body: { code, newPhone },
    });
  },

  /**
   * Смена логина. Возвращает обновлённого user для обновления стора.
   */
  changeUsername: async (
    newUsername: string,
  ): Promise<ApiResponse<{ user: { id: string; username: string; role: string } }>> => {
    const res = await apiClient<{ user: { id: string; username: string; role: string } }>(
      "/api/v1/auth/username-change",
      { method: "POST", body: { newUsername } },
    );
    return res;
  },

  /**
   * Загрузить аватар (multipart/form-data).
   * uri — локальный URI из ImagePicker (file:// или content://).
   */
  uploadAvatar: async (
    uri: string,
    mimeType: string,
    fileName: string,
  ): Promise<ApiResponse<{ avatarUrl: string }>> => {
    const token = await SecureStore.getItemAsync("auth_token");
    if (!token) {
      return { success: false, error: "Не авторизован", code: "UNAUTHORIZED" };
    }

    const formData = new FormData();
    formData.append("file", {
      uri,
      type: mimeType,
      name: fileName,
    } as unknown as Blob);

    const response = await fetch(`${API_BASE_URL}/api/v1/user/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Ошибка загрузки аватара",
        code: data.code,
      };
    }
    return data;
  },
};
