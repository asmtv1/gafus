import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "@/constants";
import { reportClientError } from "@/shared/lib/tracer";

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

type SafeJsonOk = { ok: true; value: unknown };
type SafeJsonErr = { ok: false; error: string; preview?: string };

/**
 * Читает тело ответа как текст и парсит JSON.
 * Прокси/HTML/текст вместо JSON дают понятную ошибку вместо «Unexpected character: T».
 */
async function safeParseResponseJson(response: Response): Promise<SafeJsonOk | SafeJsonErr> {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Пустой ответ сервера" };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    const preview = trimmed.slice(0, 120).replace(/\s+/g, " ");
    const base =
      "Сервер вернул ответ в неожиданном формате. Попробуйте позже или проверьте подключение.";
    const error = __DEV__
      ? `${base} (HTTP ${response.status}, начало: ${preview}${trimmed.length > 120 ? "…" : ""})`
      : base;
    return { ok: false, error, preview };
  }
}

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
    } catch (error) {
      reportClientError(error, { issueKey: "RefreshToken" });
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
  options: ApiClientOptions = {},
): Promise<ApiResponse<T>> {
  const { method = "GET", body, headers = {}, skipAuth = false } = options;

  const token = skipAuth ? null : await SecureStore.getItemAsync("auth_token");

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...headers,
  };

  const config: RequestInit = {
    method,
    headers: requestHeaders,
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

    const parsed = await safeParseResponseJson(response);
    if (!parsed.ok) {
      reportClientError(new Error(parsed.error), {
        issueKey: "ApiClient",
        keys: {
          endpoint,
          httpStatus: String(response.status),
          invalidBody: "1",
          ...(parsed.preview ? { bodyPreview: parsed.preview.slice(0, 80) } : {}),
        },
      });
      return {
        success: false,
        error: parsed.error,
        code: "INVALID_RESPONSE",
      };
    }
    const data = parsed.value;

    if (!response.ok) {
      const errObj =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as { error?: unknown; code?: unknown })
          : null;
      return {
        success: false,
        error:
          errObj && typeof errObj.error === "string" ? errObj.error : "Ошибка запроса",
        code: errObj && typeof errObj.code === "string" ? errObj.code : undefined,
      };
    }

    return data as ApiResponse<T>;
  } catch (error) {
    reportClientError(error, { issueKey: "ApiClient", keys: { endpoint } });
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

/**
 * POST multipart/form-data с Bearer и повтором после refresh (без Content-Type — boundary выставит runtime).
 */
export async function apiClientMultipart<T>(
  endpoint: string,
  buildFormData: () => FormData,
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;

  const doFetch = async (): Promise<Response> => {
    const token = await SecureStore.getItemAsync("auth_token");
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetch(url, {
      method: "POST",
      headers,
      body: buildFormData(),
    });
  };

  try {
    let response = await doFetch();
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        response = await doFetch();
      } else {
        return {
          success: false,
          error: "Сессия истекла",
          code: "SESSION_EXPIRED",
        };
      }
    }

    const parsed = await safeParseResponseJson(response);
    if (!parsed.ok) {
      reportClientError(new Error(parsed.error), {
        issueKey: "ApiClientMultipart",
        keys: {
          endpoint,
          httpStatus: String(response.status),
          invalidBody: "1",
        },
      });
      return {
        success: false,
        error: parsed.error,
        code: "INVALID_RESPONSE",
      };
    }
    const data = parsed.value;

    if (!response.ok) {
      const errObj =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as { error?: unknown; code?: unknown })
          : null;
      return {
        success: false,
        error:
          errObj && typeof errObj.error === "string" ? errObj.error : "Ошибка запроса",
        code: errObj && typeof errObj.code === "string" ? errObj.code : undefined,
      };
    }

    return data as ApiResponse<T>;
  } catch (error) {
    reportClientError(error, { issueKey: "ApiClientMultipart", keys: { endpoint } });
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
