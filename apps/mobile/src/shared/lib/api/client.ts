import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "@/constants";

interface ApiClientOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// Флаг для предотвращения параллельных refresh запросов
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * Обновляет access token используя refresh token
 */
async function refreshAccessToken(): Promise<boolean> {
  // Если уже идёт refresh — ждём его результат
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync("refresh_token");
      if (!refreshToken) return false;

      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        // Refresh failed — очищаем токены
        await SecureStore.deleteItemAsync("auth_token");
        await SecureStore.deleteItemAsync("refresh_token");
        return false;
      }

      const result = await response.json();
      if (result.success && result.data) {
        await SecureStore.setItemAsync("auth_token", result.data.accessToken);
        await SecureStore.setItemAsync("refresh_token", result.data.refreshToken);
        return true;
      }

      return false;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Базовый API клиент с автоматическим refresh токена
 */
export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<ApiResponse<T>> {
  const { method = "GET", body, headers = {}, skipAuth = false } = options;

  const token = skipAuth ? null : await SecureStore.getItemAsync("auth_token");

  const config: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
  };

  if (body && method !== "GET") {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

    // Auto-refresh при 401
    if (response.status === 401 && !skipAuth) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Повторяем запрос с новым токеном
        return apiClient(endpoint, options);
      }
      // Refresh не удался — возвращаем ошибку (UI должен редиректить на login)
      return {
        success: false,
        error: "Сессия истекла",
        code: "SESSION_EXPIRED",
      };
    }

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Ошибка запроса",
        code: data.code,
      };
    }

    return data;
  } catch (error) {
    // Обработка сетевых ошибок
    if (error instanceof TypeError && error.message === "Network request failed") {
      return {
        success: false,
        error: "Нет подключения к интернету",
        code: "NETWORK_ERROR",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
      code: "UNKNOWN_ERROR",
    };
  }
}
