import type { ConsentPayload } from "@/shared/constants/consent";
import { API_BASE_URL } from "@/shared/config";
import { reportClientError } from "@/shared/lib/error-reporting";

import { apiClient, type ApiResponse } from "./client";
import { getMobileClientHeaders } from "./client-context";

export interface User {
  id: string;
  username: string;
  phone: string | null;
  email: string | null;
  role: "USER" | "PARTNER" | "TRAINER" | "ADMIN" | "MODERATOR";
  /** Совпадает с passwordSetAt на сервере (GET /user/profile) */
  hasAppPassword?: boolean;
  profile?: {
    fullName: string | null;
    city?: string | null;
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

/** Native Hono login/register may return only id, username and role. */
function normalizeNativeSessionUser(data: LoginResponse): LoginResponse {
  return {
    ...data,
    user: { ...data.user, phone: data.user.phone ?? null, email: data.user.email ?? null },
  };
}

/**
 * Auth transports always return a machine-readable code on failure.  Screens
 * use it for retry/expiry decisions and must not have to infer it from UI copy.
 */
export type AuthApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  tempSessionId: string;
  consentPayload: ConsentPayload;
  promoCode?: string;
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
        headers: { "Content-Type": "application/json", ...getMobileClientHeaders() },
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
        data: normalizeNativeSessionUser(data.data),
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
    registrationChannel: "IOS" | "ANDROID" | "WEB",
    promoCode?: string,
  ): Promise<AuthApiResponse<LoginResponse>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getMobileClientHeaders() },
        body: JSON.stringify({
          name,
          email,
          password,
          tempSessionId,
          consentPayload,
          registrationChannel,
          promoCode: promoCode?.trim() || undefined,
        }),
      });

      if (!response.ok) {
        let errorData: { error?: string; code?: string } = {};
        try {
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            errorData = await response.json();
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
      return { success: true, data: normalizeNativeSessionUser(result.data) };
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

  /** Public normalization/validity check only; eligibility stays server-authoritative. */
  previewRegistrationPromoCode: async (
    promoCode: string,
  ): Promise<ApiResponse<{ code: string }>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/registration-promo-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getMobileClientHeaders() },
        body: JSON.stringify({ promoCode }),
      });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({}) as { error?: string; code?: string });
        return {
          success: false,
          error: errorData.error || "Промокод не удалось проверить",
          code: errorData.code || `HTTP_${response.status}`,
        };
      }
      const result = await response.json();
      return { success: true, data: result.data };
    } catch {
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
    const controller = new AbortController();
    // A disconnected device must not indefinitely block navigation/logout.
    const deadline = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getMobileClientHeaders() },
        body: JSON.stringify({ refreshToken }),
        signal: controller.signal,
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
      // Network/timeout errors are not proof of server-side revocation.
      return { success: false, error: "Не удалось подтвердить выход на сервере" };
    } finally {
      clearTimeout(deadline);
    }
  },

  /**
   * Запрос сброса пароля — письмо на email со ссылкой
   */
  sendPasswordResetRequest: async (email: string): Promise<ApiResponse<void>> => {
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    // Bound the entire operation, including response parsing, even if native
    // fetch fails to settle after abort. Do not automatically replay a reset.
    const timeout = new Promise<ApiResponse<void>>((resolve) => {
      deadline = setTimeout(() => {
        controller.abort();
        resolve({
          success: false,
          error: "Сервер долго не отвечает. Проверьте подключение и попробуйте снова.",
          code: "REQUEST_TIMEOUT",
        });
      }, 20_000);
    });
    const request = async (): Promise<ApiResponse<void>> => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/password-reset-request`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getMobileClientHeaders() },
          body: JSON.stringify({ email }),
          signal: controller.signal,
        });

        if (response.ok) return { success: true };

        let errorData: { error?: unknown; code?: unknown } = {};
        try {
          if (response.headers.get("content-type")?.includes("application/json")) {
            errorData = await response.json();
          }
        } catch {
          if (!controller.signal.aborted) {
            reportClientError(new Error("password_reset_error_response_parse"), {
              issueKey: "AuthApi",
              keys: { operation: "password_reset_error_response_parse" },
            });
          }
        }

        return {
          success: false,
          error: typeof errorData?.error === "string" ? errorData.error : "Ошибка отправки запроса",
          code: typeof errorData?.code === "string" ? errorData.code : `HTTP_${response.status}`,
        };
      } catch (error) {
        if (!controller.signal.aborted) {
          reportClientError(error instanceof Error ? error : new Error(String(error)), {
            issueKey: "AuthApi",
            keys: { operation: "send_password_reset_request" },
          });
        }
        return {
          success: false,
          error: "Ошибка подключения к серверу",
          code: "NETWORK_ERROR",
        };
      }
    };
    try {
      return await Promise.race([timeout, request()]);
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
    }
  },

  /**
   * Установка пароля в аккаунте без пароля (требует Bearer-токен)
   */
  setPassword: async (newPassword: string): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/auth/set-password", {
      method: "POST",
      body: { newPassword },
    });
  },

  /**
   * Смена пароля для пользователя с уже установленным паролем (Bearer).
   */
  changePassword: async (
    currentPassword: string,
    newPassword: string,
    requestGuard?: () => boolean,
  ): Promise<ApiResponse<void>> => {
    return apiClient<void>("/api/v1/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
      ...(requestGuard ? { requestGuard } : {}),
      skipAuthRefreshReplay: true,
    });
  },

  /**
   * Сброс пароля по токену из письма
   */
  resetPasswordByToken: async (token: string, password: string): Promise<ApiResponse<void>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getMobileClientHeaders() },
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
