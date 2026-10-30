import { parseUsernameAvailabilityData } from "@gafus/types";
import * as SecureStore from "expo-secure-store";
import type { PublicPet } from "@gafus/types";

import { apiClient, apiClientMultipart, type ApiResponse } from "./client";
import type { User } from "./auth";

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
  getProfile: async (requestGuard?: () => boolean): Promise<ApiResponse<User>> => {
    return apiClient<User>("/api/v1/user/profile", {
      ...(requestGuard ? { requestGuard } : {}),
    });
  },

  /**
   * Получить публичный профиль по username
   */
  getPublicProfile: async (
    username: string,
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<PublicProfile>> => {
    return apiClient<PublicProfile>(
      `/api/v1/user/profile/public?username=${encodeURIComponent(username)}`,
      { ...(requestGuard ? { requestGuard } : {}) },
    );
  },

  /**
   * Обновить профиль
   */
  updateProfile: async (
    data: UpdateProfileData,
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<UpdatedUserProfile>> => {
    // Only send editable profile fields. TypeScript alone cannot remove
    // extra runtime properties such as account roles or subscription state.
    const editableFields = [
      "fullName",
      "city",
      "about",
      "telegram",
      "instagram",
      "website",
      "birthDate",
    ] as const;
    const body: UpdateProfileData = {};
    for (const field of editableFields) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        body[field] = data[field];
      }
    }

    return apiClient<UpdatedUserProfile>("/api/v1/user/profile", {
      method: "PUT",
      body,
      ...(requestGuard ? { requestGuard } : {}),
    });
  },

  /**
   * Запрос смены email: письмо со ссылкой на новый адрес.
   */
  requestEmailChange: async (
    newEmail: string,
    requestGuard?: () => boolean,
    currentPassword?: string,
  ): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/auth/email-change-request", {
      method: "POST",
      body: { newEmail, ...(currentPassword ? { currentPassword } : {}) },
      ...(requestGuard ? { requestGuard } : {}),
    });
  },

  /**
   * Смена логина. Возвращает обновлённого user для обновления стора.
   */
  changeUsername: async (
    newUsername: string,
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<{ user: { id: string; username: string; role: string } }>> => {
    const res = await apiClient<{ user: { id: string; username: string; role: string } }>(
      "/api/v1/auth/username-change",
      {
        method: "POST",
        body: { newUsername },
        ...(requestGuard ? { requestGuard } : {}),
      },
    );
    return res;
  },

  /**
   * Проверка доступности логина (для live-check при вводе).
   */
  checkUsernameAvailable: async (
    username: string,
  ): Promise<ApiResponse<{ available: boolean }>> => {
    const response = await apiClient<unknown>(
      `/api/v1/auth/username-available?username=${encodeURIComponent(username)}`,
    );
    if (!response.success) {
      return { success: false, error: response.error, code: response.code, details: response.details };
    }
    const data = parseUsernameAvailabilityData(response.data);
    return data
      ? { success: true, data }
      : { success: false, code: "INVALID_RESPONSE", error: "Некорректный ответ API" };
  },

  /**
   * Письмо с 6-значным кодом на email профиля (перед удалением).
   */
  requestAccountDeletionCode: async (
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient<{ success: boolean }>("/api/v1/user/account/deletion-code", {
      method: "POST",
      body: {},
      skipAuthRefreshReplay: true,
      ...(requestGuard ? { requestGuard } : {}),
    });
  },

  /**
   * Необратимое удаление аккаунта (код из письма + Bearer).
   */
  deleteAccount: async (
    code: string,
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<{ success: boolean }>> => {
    if (!/^[0-9]{6}$/.test(code))
      return { success: false, code: "INVALID_CODE", error: "Введите шесть цифр" };
    return apiClient<{ success: boolean }>("/api/v1/user/account/delete", {
      method: "POST",
      body: { code },
      // Destructive operation: 401 refresh replay could delete after unknown ACK.
      skipAuthRefreshReplay: true,
      ...(requestGuard ? { requestGuard } : {}),
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

    // Recreate the native upload form on a bounded 401 refresh retry.
    return apiClientMultipart<{ avatarUrl: string }>("/api/v1/user/avatar", () => {
      const formData = new FormData();
      formData.append("file", {
        uri,
        type: mimeType,
        name: fileName,
      } as unknown as Blob);
      return formData;
    });
  },
};
