import * as SecureStore from "expo-secure-store";
import type { PublicPet } from "@gafus/types";

import { apiClient, type ApiResponse } from "./client";
import type { User } from "./auth";
import { API_BASE_URL } from "@/shared/config";

export interface UpdateProfileData {
  fullName?: string;
  city?: string;
  about?: string;
  telegram?: string;
  instagram?: string;
  website?: string;
  birthDate?: string;
}

/** PUT /user/profile returns profile fields, not the account. */
export type UpdatedUserProfile = NonNullable<User["profile"]> & { userId: string };

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
  updatedAt: string | Date;
  trainingLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
}

/** Публичный профиль (структура как в API / profile из web) */
export interface PublicProfile {
  chatRole?: "admin" | "trainer" | "subscriber" | null;
  username: string;
  role: string;
  profile: {
    fullName: string | null;
    city?: string | null;
    birthDate: string | null;
    about: string | null;
    telegram: string | null;
    instagram: string | null;
    website: string | null;
    avatarUrl: string | null;
  } | null;
  diplomas?: { id: string; title: string; issuedBy: string | null; issuedAt: string }[];
  pets?: (Omit<PublicPet, "birthDate"> & { birthDate: string | null })[];
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
    return apiClient<PublicProfile>(
      `/api/v1/user/profile/public?username=${encodeURIComponent(username)}`,
    );
  },

  /**
   * Обновить профиль
   */
  updateProfile: async (data: UpdateProfileData): Promise<ApiResponse<UpdatedUserProfile>> => {
    return apiClient<UpdatedUserProfile>("/api/v1/user/profile", {
      method: "PUT",
      body: data,
    });
  },

  /**
   * Запрос смены email: письмо со ссылкой на новый адрес.
   */
  requestEmailChange: async (newEmail: string): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/auth/email-change-request", {
      method: "POST",
      body: { newEmail },
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
   * Проверка доступности логина (для live-check при вводе).
   */
  checkUsernameAvailable: async (
    username: string,
  ): Promise<ApiResponse<{ available: boolean }>> => {
    return apiClient<{ available: boolean }>(
      `/api/v1/auth/username-available?username=${encodeURIComponent(username)}`,
    );
  },

  /**
   * Письмо с 6-значным кодом на email профиля (перед удалением).
   */
  requestAccountDeletionCode: async (): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient<{ success: boolean }>("/api/v1/user/account/deletion-code", {
      method: "POST",
      body: {},
    });
  },

  /**
   * Необратимое удаление аккаунта (код из письма + Bearer).
   */
  deleteAccount: async (code: string): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient<{ success: boolean }>("/api/v1/user/account/delete", {
      method: "POST",
      body: { code },
    });
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
