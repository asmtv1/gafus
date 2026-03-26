import type { ConsentPayload } from "@/shared/constants/consent";
import { API_BASE_URL } from "@/constants";
import { reportClientError } from "@/shared/lib/tracer";

import { apiClient, type ApiResponse } from "./client";

export interface User {
  id: string;
  username: string;
  phone: string | null;
  email: string | null;
  role: "USER" | "TRAINER" | "ADMIN" | "MODERATOR" | "PREMIUM";
  /** Совпадает с passwordSetAt на сервере (GET /user/profile) */
  hasAppPassword?: boolean;
  hasVkLinked?: boolean;
  profile?: {
    fullName: string | null;
    about: string | null;
    telegram: string | null;
    instagram: string | null;
    website: string | null;
    birthDate: string | null;
    avatarUrl: string | null;
  };
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface VkLoginResponse {
  user: Pick<User, "id" | "username" | "role">;
  accessToken?: string;
  refreshToken?: string;
  needsPhone?: boolean;
  /** Новый пользователь — нужно собрать согласия (mobile) */
  needsConsent?: boolean;
  vkConsentToken?: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  tempSessionId: string;
  consentPayload: ConsentPayload;
}

/**
 * API модуль для аутентификации
 */
export const authApi = {
  /**
   * Авторизация по логину и паролю
   */
  login: async (username: string, password: string): Promise<ApiResponse<LoginResponse>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      // Проверяем статус перед парсингом JSON
      if (!response.ok) {
        // Пытаемся получить JSON ошибки, но не падаем если это не JSON
        let errorData: { error?: string; code?: string } = {};
        try {
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            errorData = await response.json();
          }
        } catch {
          reportClientError(new Error("login_error_response_parse"), {
            issueKey: "AuthApi",
            keys: { operation: "login_error_response_parse" },
          });
          // Игнорируем ошибки парсинга - используем дефолтное сообщение
        }

        return {
          success: false,
          error: errorData.error || "Неверные учётные данные",
          code: errorData.code || `HTTP_${response.status}`,
        };
      }

      // Парсим JSON только если статус OK
      const data = await response.json();

      return {
        success: true,
        data: data.data,
      };
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "AuthApi",
        keys: { operation: "login" },
      });
      // Обработка сетевых ошибок и ошибок парсинга
      if (error instanceof TypeError && error.message.includes("fetch")) {
        return {
          success: false,
          error: "Ошибка подключения к серверу",
          code: "NETWORK_ERROR",
        };
      }

      return {
        success: false,
        error: "Ошибка подключения к серверу",
        code: "NETWORK_ERROR",
      };
    }
  },

  /**
   * Регистрация нового пользователя
   */
  register: async (
    name: string,
    email: string,
    password: string,
    tempSessionId: string,
    consentPayload: ConsentPayload,
  ): Promise<ApiResponse<LoginResponse>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, tempSessionId, consentPayload }),
      });

      if (!response.ok) {
        let errorData: { error?: string; code?: string } = {};
        try {
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            errorData = await response.json();
            if (__DEV__) console.log("[authApi] register error response", { status: response.status, errorData });
          }
        } catch {
          reportClientError(new Error("register_error_response_parse"), {
            issueKey: "AuthApi",
            keys: { operation: "register_error_response_parse" },
          });
          // игнорируем ошибки парсинга
        }
        return {
          success: false,
          error: errorData.error || "Ошибка регистрации",
          code: errorData.code || `HTTP_${response.status}`,
        };
      }

      const result = await response.json();
      return { success: true, data: result.data };
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "AuthApi",
        keys: { operation: "register" },
      });
      if (error instanceof TypeError && error.message.includes("fetch")) {
        return { success: false, error: "Ошибка подключения к серверу", code: "NETWORK_ERROR" };
      }
      return { success: false, error: "Ошибка подключения к серверу", code: "NETWORK_ERROR" };
    }
  },

  /**
   * Получение профиля текущего пользователя
   */
  getProfile: async (): Promise<ApiResponse<User>> => {
    return apiClient<User>("/api/v1/user/profile");
  },

  /**
   * Выход из системы (инвалидация токена на сервере)
   */
  logout: async (refreshToken: string): Promise<ApiResponse<void>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        return { success: false, error: "Ошибка logout" };
      }

      return { success: true };
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "AuthApi",
        keys: { operation: "logout" },
      });
      // Не раскрываем ошибки logout
      return { success: true };
    }
  },

  /**
   * Запрос сброса пароля — письмо на email со ссылкой
   */
  sendPasswordResetRequest: async (email: string): Promise<ApiResponse<void>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/password-reset-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        let errorData: { error?: string; code?: string } = {};
        try {
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            errorData = await response.json();
          }
        } catch {
          reportClientError(new Error("password_reset_error_response_parse"), {
            issueKey: "AuthApi",
            keys: { operation: "password_reset_error_response_parse" },
          });
          // Игнорируем ошибки парсинга
        }

        return {
          success: false,
          error: errorData.error || "Ошибка отправки запроса",
          code: errorData.code || `HTTP_${response.status}`,
        };
      }

      // Для успешного ответа может не быть тела
      try {
        await response.json();
      } catch {
        reportClientError(new Error("password_reset_success_body_parse"), {
          issueKey: "AuthApi",
          keys: { operation: "password_reset_success_body_parse" },
        });
        // Игнорируем если нет JSON тела
      }

      return {
        success: true,
      };
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "AuthApi",
        keys: { operation: "send_password_reset_request" },
      });
      if (error instanceof TypeError && error.message.includes("fetch")) {
        return {
          success: false,
          error: "Ошибка подключения к серверу",
          code: "NETWORK_ERROR",
        };
      }

      return {
        success: false,
        error: "Ошибка подключения к серверу",
        code: "NETWORK_ERROR",
      };
    }
  },

  /**
   * Авторизация через VK ID (мобильный, PKCE)
   */
  loginViaVk: async (params: {
    code: string;
    code_verifier: string;
    device_id: string;
    state: string;
    platform?: "ios" | "android";
  }): Promise<ApiResponse<VkLoginResponse>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/vk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        let errorData: { error?: string; code?: string } = {};
        try {
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            errorData = await response.json();
          }
        } catch {
          reportClientError(new Error("vk_login_error_response_parse"), {
            issueKey: "AuthApi",
            keys: { operation: "vk_login_error_response_parse" },
          });
          // игнорируем ошибки парсинга
        }
        return {
          success: false,
          error: errorData.error || "Ошибка авторизации VK ID",
          code: errorData.code || `HTTP_${response.status}`,
        };
      }

      const result = await response.json();
      return { success: true, data: result.data };
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "AuthApi",
        keys: { operation: "login_via_vk" },
      });
      if (error instanceof TypeError && error.message.includes("fetch")) {
        return { success: false, error: "Ошибка подключения к серверу", code: "NETWORK_ERROR" };
      }
      return { success: false, error: "Ошибка подключения к серверу", code: "NETWORK_ERROR" };
    }
  },

  /**
   * Привязка VK аккаунта (требует Bearer-токен)
   */
  linkVk: async (params: {
    code: string;
    code_verifier: string;
    device_id: string;
    state: string;
    platform?: "ios" | "android";
  }): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/auth/vk-link", {
      method: "POST",
      body: params,
    });
  },

  /**
   * Отправка согласий для новых VK-пользователей (mobile).
   * Возвращает токены после успешного сохранения согласий.
   */
  submitVkConsent: async (
    vkConsentToken: string,
    consentPayload: ConsentPayload,
  ): Promise<ApiResponse<VkLoginResponse>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/vk-consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vkConsentToken, consentPayload }),
      });

      if (!response.ok) {
        let errorData: { error?: string } = {};
        try {
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            errorData = await response.json();
          }
        } catch {
          reportClientError(new Error("vk_consent_error_response_parse"), {
            issueKey: "AuthApi",
            keys: { operation: "vk_consent_error_response_parse" },
          });
          // игнорируем
        }
        return {
          success: false,
          error: errorData.error || "Ошибка сохранения согласий",
        };
      }

      const result = await response.json();
      return { success: true, data: result.data };
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "AuthApi",
        keys: { operation: "submit_vk_consent" },
      });
      if (error instanceof TypeError && error.message.includes("fetch")) {
        return { success: false, error: "Ошибка подключения к серверу", code: "NETWORK_ERROR" };
      }
      return { success: false, error: "Ошибка подключения к серверу", code: "NETWORK_ERROR" };
    }
  },

  /**
   * Установка номера телефона для VK-пользователя (требует Bearer-токен)
   */
  setVkPhone: async (phone: string): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/auth/vk-phone-set", {
      method: "POST",
      body: { phone },
    });
  },

  /**
   * Установка пароля для VK-пользователя без пароля (требует Bearer-токен)
   */
  setPassword: async (newPassword: string): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/auth/set-password", {
      method: "POST",
      body: { newPassword },
    });
  },

  /**
   * Сброс пароля по токену из письма
   */
  resetPasswordByToken: async (
    token: string,
    password: string,
  ): Promise<ApiResponse<void>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!response.ok) {
        let errorData: { error?: string } = {};
        try {
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            errorData = await response.json();
          }
        } catch {
          reportClientError(new Error("reset_password_error_response_parse"), {
            issueKey: "AuthApi",
            keys: { operation: "reset_password_error_response_parse" },
          });
          // игнорируем
        }
        return {
          success: false,
          error: errorData.error || "Не удалось сбросить пароль",
        };
      }

      return { success: true };
    } catch (error) {
      reportClientError(error instanceof Error ? error : new Error(String(error)), {
        issueKey: "AuthApi",
        keys: { operation: "reset_password_by_token" },
      });
      if (error instanceof TypeError && error.message.includes("fetch")) {
        return {
          success: false,
          error: "Ошибка подключения к серверу",
          code: "NETWORK_ERROR",
        };
      }
      return {
        success: false,
        error: "Ошибка подключения к серверу",
        code: "NETWORK_ERROR",
      };
    }
  },
};
