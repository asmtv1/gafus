import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { API_BASE_URL, NETWORK_TIMEOUTS } from "@/shared/config";
import { reportClientError } from "@/shared/lib/tracer";
import { isAbortError } from "./abortError";
import { notifySubscriptionRequired } from "./subscriptionRequired";

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
const API_REQUEST_TIMEOUT_MS = NETWORK_TIMEOUTS.request;

/**
 * Текст ошибки при HTTP 4xx/5xx: наш API отдаёт `error: string`, иные клиенты — `message` или Zod `issues`.
 */
function extractHttpErrorMessage(data: unknown, response: Response): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    if (typeof o.error === "string" && o.error.trim()) {
      return o.error;
    }
    if (typeof o.message === "string" && o.message.trim()) {
      return o.message;
    }
    const issues = o.issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0] as { message?: unknown } | undefined;
      if (first && typeof first.message === "string" && first.message.trim()) {
        return first.message;
      }
    }
  }
  const st = response.statusText?.trim();
  if (st) {
    return `Ошибка запроса (HTTP ${response.status}: ${st})`;
  }
  return `Ошибка запроса (HTTP ${response.status})`;
}

function extractHttpErrorCode(data: unknown): string | undefined {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const c = (data as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

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
  } catch (parseError) {
    reportClientError(parseError instanceof Error ? parseError : new Error(String(parseError)), {
      issueKey: "ApiClient",
      severity: "warning",
      keys: { operation: "parse_response_json", status: response.status },
    });
    const preview = trimmed.slice(0, 120).replace(/\s+/g, " ");
    const base =
      "Сервер вернул ответ в неожиданном формате. Попробуйте позже или проверьте подключение.";
    const message = __DEV__
      ? `${base} (HTTP ${response.status}, начало: ${preview}${trimmed.length > 120 ? "…" : ""})`
      : base;
    return { ok: false, error: message, preview };
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = API_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getAbortTimeoutError(): ApiResponse<never> {
  return {
    success: false,
    error: "Сервер долго не отвечает. Попробуйте снова.",
    code: "REQUEST_TIMEOUT",
  };
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

      const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/refresh`, {
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
    "X-Client-Platform": Platform.OS,
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
    const response = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, config);

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
      const code = extractHttpErrorCode(data);
      if (
        response.status === 402 &&
        (code === "SUBSCRIPTION_REQUIRED" || code === "SUBSCRIPTION_OR_CREDITS_REQUIRED")
      ) {
        notifySubscriptionRequired("required");
      }
      return {
        success: false,
        error: extractHttpErrorMessage(data, response),
        code,
      };
    }

    return data as ApiResponse<T>;
  } catch (error) {
    reportClientError(error, { issueKey: "ApiClient", keys: { endpoint } });
    if (isAbortError(error)) {
      return getAbortTimeoutError();
    }
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
    const headers: Record<string, string> = {
      "X-Client-Platform": Platform.OS,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return fetchWithTimeout(url, {
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
      return {
        success: false,
        error: extractHttpErrorMessage(data, response),
        code: extractHttpErrorCode(data),
      };
    }

    return data as ApiResponse<T>;
  } catch (error) {
    reportClientError(error, { issueKey: "ApiClientMultipart", keys: { endpoint } });
    if (isAbortError(error)) {
      return getAbortTimeoutError();
    }
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
