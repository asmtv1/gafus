import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "@/constants";

interface ApiClientOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Базовый API клиент для взаимодействия с backend
 * Автоматически добавляет токен авторизации из SecureStore
 */
export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<ApiResponse<T>> {
  const { method = "GET", body, headers = {} } = options;

  // Получаем токен авторизации из безопасного хранилища
  const token = await SecureStore.getItemAsync("auth_token");

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
