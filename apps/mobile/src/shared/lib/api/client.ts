import * as SecureStore from "expo-secure-store";

import { API_BASE_URL, NETWORK_TIMEOUTS } from "@/shared/config";
import { addTracerBreadcrumb, reportClientError } from "@/shared/lib/tracer";
import { isAbortError } from "./abortError";
import { getMobileClientHeaders } from "./client-context";
import {
  notifySubscriptionRequired,
  shouldNotifySubscriptionRequired,
} from "./subscriptionRequired";

interface ApiClientOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  suppressSubscriptionPaywall?: boolean;
  timeoutMs?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
}

// Флаг для предотвращения параллельных refresh запросов
let isRefreshing = false;
let refreshPromise: Promise<RefreshAccessTokenResult> | null = null;

type SafeJsonOk = { ok: true; value: unknown };
type SafeJsonErr = { ok: false; error: string; preview?: string };
type RefreshAccessTokenFailureCode =
  | "NO_REFRESH_TOKEN"
  | "REFRESH_REJECTED"
  | "NETWORK_ERROR"
  | "REQUEST_TIMEOUT"
  | "AUTH_REFRESH_UNAVAILABLE";
type RefreshAccessTokenResult =
  | { success: true }
  | { success: false; code: RefreshAccessTokenFailureCode };
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

function extractHttpErrorDetails(data: unknown): Record<string, unknown> | undefined {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const details = (data as Record<string, unknown>).details;
    if (details && typeof details === "object" && !Array.isArray(details)) {
      return details as Record<string, unknown>;
    }
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
  timeoutMs: number = API_REQUEST_TIMEOUT_MS,
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

function getNetworkError(): ApiResponse<never> {
  return {
    success: false,
    error: "Нет подключения к интернету",
    code: "NETWORK_ERROR",
  };
}

function isNetworkRequestError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error instanceof TypeError) return true;
  const message = error.message.toLowerCase();
  return (
    message.includes("network request failed") ||
    message.includes("internet connection") ||
    message.includes("network connection") ||
    message.includes("offline")
  );
}

function getRefreshFailureResponse(
  result: Exclude<RefreshAccessTokenResult, { success: true }>,
): ApiResponse<never> {
  if (result.code === "REQUEST_TIMEOUT") {
    return getAbortTimeoutError();
  }
  if (result.code === "NETWORK_ERROR") {
    return getNetworkError();
  }
  if (result.code === "AUTH_REFRESH_UNAVAILABLE") {
    return {
      success: false,
      error: "Сервер авторизации временно недоступен. Попробуйте позже.",
      code: "AUTH_REFRESH_UNAVAILABLE",
    };
  }
  return {
    success: false,
    error: "Сессия истекла",
    code: "SESSION_EXPIRED",
  };
}

/**
 * Обновляет access token используя refresh token
 */
async function refreshAccessToken(): Promise<RefreshAccessTokenResult> {
  // Если уже идёт refresh — ждём его результат
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync("refresh_token");
      if (!refreshToken) return { success: false, code: "NO_REFRESH_TOKEN" };

      const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getMobileClientHeaders(),
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          // Refresh rejected by API — this is a real expired/invalid session.
          await SecureStore.deleteItemAsync("auth_token");
          await SecureStore.deleteItemAsync("refresh_token");
          return { success: false, code: "REFRESH_REJECTED" };
        }
        return { success: false, code: "AUTH_REFRESH_UNAVAILABLE" };
      }

      const result = await response.json();
      if (result.success && result.data) {
        await SecureStore.setItemAsync("auth_token", result.data.accessToken);
        await SecureStore.setItemAsync("refresh_token", result.data.refreshToken);
        return { success: true };
      }

      return { success: false, code: "AUTH_REFRESH_UNAVAILABLE" };
    } catch (error) {
      reportClientError(error, { issueKey: "RefreshToken" });
      if (isAbortError(error)) {
        return { success: false, code: "REQUEST_TIMEOUT" };
      }
      if (isNetworkRequestError(error)) {
        return { success: false, code: "NETWORK_ERROR" };
      }
      return { success: false, code: "AUTH_REFRESH_UNAVAILABLE" };
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
  const {
    method = "GET",
    body,
    headers = {},
    skipAuth = false,
    suppressSubscriptionPaywall = false,
    timeoutMs = API_REQUEST_TIMEOUT_MS,
  } = options;

  const token = skipAuth ? null : await SecureStore.getItemAsync("auth_token");

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...getMobileClientHeaders(),
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

  const requestStartedAt = Date.now();
  addTracerBreadcrumb("api", `${method} ${endpoint}`, { method, endpoint });

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, config, timeoutMs);
    addTracerBreadcrumb(
      "api",
      `${method} ${endpoint} → ${response.status}`,
      {
        method,
        endpoint,
        status: response.status,
        durationMs: Date.now() - requestStartedAt,
      },
      response.ok ? "info" : "warning",
    );

    // Auto-refresh при 401
    if (response.status === 401 && !skipAuth) {
      const refreshResult = await refreshAccessToken();
      if (refreshResult.success) {
        // Повторяем запрос с новым токеном
        return apiClient(endpoint, options);
      }
      return getRefreshFailureResponse(refreshResult);
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
        typeof __DEV__ !== "undefined" &&
        __DEV__ &&
        endpoint === "/api/v1/app-subscription/yookassa/start"
      ) {
        console.log("[apiClient] app-subscription/yookassa/start non-ok", {
          status: response.status,
          statusText: response.statusText,
          code,
          data,
        });
      }
      if (
        shouldNotifySubscriptionRequired({
          httpStatus: response.status,
          code,
          suppressSubscriptionPaywall,
        })
      ) {
        notifySubscriptionRequired("required");
      }
      return {
        success: false,
        error: extractHttpErrorMessage(data, response),
        code,
        details: extractHttpErrorDetails(data),
      };
    }

    return data as ApiResponse<T>;
  } catch (error) {
    addTracerBreadcrumb(
      "api",
      `${method} ${endpoint} failed`,
      { method, endpoint, durationMs: Date.now() - requestStartedAt },
      "error",
    );
    reportClientError(error, { issueKey: "ApiClient", keys: { endpoint } });
    if (isAbortError(error)) {
      return getAbortTimeoutError();
    }
    // Обработка сетевых ошибок
    if (isNetworkRequestError(error)) {
      return getNetworkError();
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
  const requestStartedAt = Date.now();
  addTracerBreadcrumb("api", `POST ${endpoint}`, { method: "POST", endpoint });

  const doFetch = async (): Promise<Response> => {
    const token = await SecureStore.getItemAsync("auth_token");
    const headers: Record<string, string> = {
      ...getMobileClientHeaders(),
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
    addTracerBreadcrumb(
      "api",
      `POST ${endpoint} → ${response.status}`,
      {
        method: "POST",
        endpoint,
        status: response.status,
        durationMs: Date.now() - requestStartedAt,
      },
      response.ok ? "info" : "warning",
    );
    if (response.status === 401) {
      const refreshResult = await refreshAccessToken();
      if (refreshResult.success) {
        response = await doFetch();
      } else {
        return getRefreshFailureResponse(refreshResult);
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
    addTracerBreadcrumb(
      "api",
      `POST ${endpoint} failed`,
      { method: "POST", endpoint, durationMs: Date.now() - requestStartedAt },
      "error",
    );
    reportClientError(error, { issueKey: "ApiClientMultipart", keys: { endpoint } });
    if (isAbortError(error)) {
      return getAbortTimeoutError();
    }
    if (isNetworkRequestError(error)) {
      return getNetworkError();
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
      code: "UNKNOWN_ERROR",
    };
  }
}
