import { apiClient, type ApiResponse } from "./client";
import { API_BASE_URL } from "@/constants";

export interface User {
  id: string;
  username: string;
  phone: string;
  role: "USER" | "TRAINER" | "ADMIN" | "MODERATOR" | "PREMIUM";
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

export interface RegisterData {
  name: string; // Используется как username на backend
  phone: string;
  password: string;
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

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || "Неверные учётные данные",
          code: data.code,
        };
      }

      return {
        success: true,
        data: data.data,
      };
    } catch (error) {
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
    phone: string,
    password: string
  ): Promise<ApiResponse<LoginResponse>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || "Ошибка регистрации",
          code: result.code,
        };
      }

      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      return {
        success: false,
        error: "Ошибка подключения к серверу",
        code: "NETWORK_ERROR",
      };
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
    } catch {
      // Не раскрываем ошибки logout
      return { success: true };
    }
  },

  /**
   * Проверяет совпадение номера телефона с логином
   */
  checkPhoneMatchesUsername: async (
    username: string,
    phone: string
  ): Promise<ApiResponse<{ matches: boolean }>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/check-phone-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || "Ошибка проверки телефона",
          code: data.code,
        };
      }

      return {
        success: true,
        data: data.data,
      };
    } catch (error) {
      return {
        success: false,
        error: "Ошибка подключения к серверу",
        code: "NETWORK_ERROR",
      };
    }
  },

  /**
   * Отправляет запрос на сброс пароля
   */
  sendPasswordResetRequest: async (
    username: string,
    phone: string
  ): Promise<ApiResponse<void>> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/password-reset-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || "Ошибка отправки запроса",
          code: data.code,
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: "Ошибка подключения к серверу",
        code: "NETWORK_ERROR",
      };
    }
  },
};
