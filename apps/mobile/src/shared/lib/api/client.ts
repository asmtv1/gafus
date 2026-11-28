import { isPairedProductionChat2Origin } from "./chat2ProductionOrigin";
import { authTokenStorage as SecureStore } from "@/shared/lib/authTokenStorage";

import { API_BASE_URL, NETWORK_TIMEOUTS } from "@/shared/config";
import { reportClientError } from "@/shared/lib/error-reporting";
import { isAbortError } from "./abortError";
import { buildMobileHttpDiagnostic, mobileEndpointGroup, newMobileTraceparent } from "./apiDiagnostics";
import { mobilePerformance } from "@/shared/lib/telemetry/mobilePerformance";
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
  /** Journal ACKs require the exact expected successful HTTP status. */
  expectedSuccessStatus?: number;
  timeoutMs?: number;
  /** G05 actor fence: blocks POST (including 401 refresh replay) after owner/epoch change. */
  /** Guard may inspect the exact SecureStore token selected for this request. */
  requestGuard?: (selectedAccessToken?: string | null) => boolean;
  /** Prevent a second sensitive write after an HTTP 401. */
  skipAuthRefreshReplay?: boolean;
  /** Optional isolated Chat2 origin, never accepted for other API routes. */
  chat2Origin?: string;
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
type SafeJsonErr = { ok: false; error: string; preview?: string; cause?: unknown };
type RefreshAccessTokenFailureCode =
  | "NO_REFRESH_TOKEN"
  | "REFRESH_REJECTED"
  | "NETWORK_ERROR"
  | "REQUEST_TIMEOUT"
  | "AUTH_REFRESH_UNAVAILABLE"
  | "G05_SESSION_CHANGED";
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
    const body = data as Record<string, unknown>;
    // AG4 narrow pet-edit source/mock grant. Hono returns fieldErrors at the
    // top level; expose only stable whitelisted codes to the existing details API.
    if (
      body.code === "PET_VALIDATION_ERROR" &&
      body.fieldErrors &&
      typeof body.fieldErrors === "object" &&
      !Array.isArray(body.fieldErrors)
    ) {
      const allowedFields = [
        "name",
        "type",
        "breed",
        "birthDate",
        "heightCm",
        "neckGirthCm",
        "muzzleGirthCm",
        "bellyGirthCm",
        "notes",
        "weightKg",
      ];
      const codes = [
        "INVALID_TYPE",
        "NOT_NULLABLE",
        "OUT_OF_RANGE",
        "REQUIRED",
        "UNSUPPORTED_FIELD",
        "INVALID_VALUE",
      ];
      const safe: Record<string, string> = {};
      for (const [key, value] of Object.entries(body.fieldErrors as Record<string, unknown>)) {
        if (allowedFields.includes(key) && typeof value === "string" && codes.includes(value))
          safe[key] = value;
      }
      return { fieldErrors: safe };
    }
    // Vet mutation precommit 400: preserve only schema field + machine code.
    // Never carry medical input, error text, attachment URL or unknown fields.
    if (
      (body.code === "VET_VISIT_VALIDATION_ERROR" || body.code === "VET_VISIT_INVALID_JSON") &&
      body.fieldErrors &&
      typeof body.fieldErrors === "object" &&
      !Array.isArray(body.fieldErrors)
    ) {
      const fields = [
        "body",
        "visitedOn",
        "specialty",
        "doctorName",
        "clinic",
        "diagnosis",
        "conclusion",
        "notes",
      ];
      const codes = ["INVALID_JSON", "INVALID_TYPE", "REQUIRED", "OUT_OF_RANGE", "INVALID_VALUE"];
      const safe: Record<string, string> = {};
      for (const [field, code] of Object.entries(body.fieldErrors as Record<string, unknown>))
        if (fields.includes(field) && typeof code === "string" && codes.includes(code))
          safe[field] = code;
      return { fieldErrors: safe };
    }
    const details = body.details;
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
function vetEndpoint(endpoint: string): boolean {
  return /^\/api\/v1\/pets\/[^/?]+\/vet-visits(?:\/|\?|$)/.test(endpoint);
}
function traceEndpoint(endpoint: string): string {
  return vetEndpoint(endpoint) ? "/api/v1/pets/:petId/vet-visits" : endpoint;
}
async function safeParseResponseJson(
  response: Response,
  sensitive = false,
): Promise<SafeJsonOk | SafeJsonErr> {
  // Rate limits can be returned as plain text by middleware or the proxy.
  if (response.status === 429) {
    return {
      ok: true,
      value: {
        success: false,
        code: "RATE_LIMITED",
        error: "Слишком много запросов. Подождите немного и повторите попытку.",
      },
    };
  }
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Пустой ответ сервера" };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch (parseError) { /* diagnostic: expected Invalid JSON becomes established response error handled by API diagnostics. */
    const preview = trimmed.slice(0, 120).replace(/\s+/g, " ");
    const base =
      "Сервер вернул ответ в неожиданном формате. Попробуйте позже или проверьте подключение.";
    const message =
      !sensitive && __DEV__
        ? `${base} (HTTP ${response.status}, начало: ${preview}${trimmed.length > 120 ? "…" : ""})`
        : base;
    return sensitive ? { ok: false, error: message, cause: new Error("SENSITIVE_INVALID_JSON_RESPONSE") } : { ok: false, error: message, preview, cause: parseError };
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

function getSessionChangedError(): ApiResponse<never> {
  return { success: false, code: "G05_SESSION_CHANGED", error: "Сессия изменилась" };
}

function getRefreshFailureResponse(
  result: Exclude<RefreshAccessTokenResult, { success: true }>,
): ApiResponse<never> {
  if (result.code === "G05_SESSION_CHANGED") return getSessionChangedError();
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
async function refreshAccessToken(isCurrent = () => true): Promise<RefreshAccessTokenResult> {
  // Если уже идёт refresh — ждём его результат
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync("refresh_token");
      if (!isCurrent()) return { success: false, code: "G05_SESSION_CHANGED" };
      if (!refreshToken) return { success: false, code: "NO_REFRESH_TOKEN" };

      const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getMobileClientHeaders(),
        },
        body: JSON.stringify({ refreshToken }),
      });

      const canUpdateCredentials = async () =>
        await SecureStore.getItemAsync("refresh_token") === refreshToken && isCurrent();

      if (!response.ok) {
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          // Refresh rejected by API — only clear the credentials it used.
          if (!(await canUpdateCredentials())) return { success: false, code: "G05_SESSION_CHANGED" };
          await SecureStore.deleteItemAsync("auth_token");
          if (!isCurrent()) return { success: false, code: "G05_SESSION_CHANGED" };
          await SecureStore.deleteItemAsync("refresh_token");
          return { success: false, code: "REFRESH_REJECTED" };
        }
        return { success: false, code: "AUTH_REFRESH_UNAVAILABLE" };
      }

      const result: unknown = await response.json();
      // HTTP 200 is not an ACK for a usable session unless both tokens exist.
      // Validate the entire pair before writing either SecureStore key.
      if (result && typeof result === "object" && !Array.isArray(result)) {
        const envelope = result as { success?: unknown; data?: unknown };
        const data = envelope.data;
        if (envelope.success === true && data && typeof data === "object" && !Array.isArray(data)) {
          const { accessToken, refreshToken } = data as {
            accessToken?: unknown;
            refreshToken?: unknown;
          };
          if (
            typeof accessToken === "string" &&
            accessToken.trim().length > 0 &&
            typeof refreshToken === "string" &&
            refreshToken.trim().length > 0
          ) {
            if (!(await canUpdateCredentials())) return { success: false, code: "G05_SESSION_CHANGED" };
            await SecureStore.setItemAsync("auth_token", accessToken);
            if (!isCurrent()) return { success: false, code: "G05_SESSION_CHANGED" };
            await SecureStore.setItemAsync("refresh_token", refreshToken);
            return { success: true };
          }
        }
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
function chat2OnlyBaseUrl(endpoint: string, origin?: string): string {
  if (!origin) return API_BASE_URL;
  if (endpoint !== "/api/v1/chats" && !endpoint.startsWith("/api/v1/chats/"))
    throw new Error("Раздельный Chat2 API разрешён только для сообщений");
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("Недопустимый адрес Chat 2.0");
  }
  const localDev =
    typeof __DEV__ !== "undefined" && __DEV__ && url.protocol === "http:" &&
    (/^(127\.0\.0\.1|localhost|10\.0\.2\.2)$/.test(url.hostname) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(url.hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(url.hostname));
  if (
    url.origin !== origin ||
    url.username || url.password || url.search || url.hash ||
    url.pathname !== "/" ||
    (["api.gafus.ru", "gafus.ru"].includes(url.hostname) &&
      !isPairedProductionChat2Origin(url.origin, API_BASE_URL)) ||
    (url.protocol !== "https:" && !localDev)
  )
    throw new Error("Chat 2.0: изолированный адрес или согласованный production API обязателен");
  return url.origin;
}

export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {},
): Promise<ApiResponse<T>> {
  return apiClientWithRefreshLimit<T>(endpoint, options, false);
}

async function apiClientWithRefreshLimit<T>(
  endpoint: string,
  options: ApiClientOptions,
  alreadyRefreshed: boolean,
): Promise<ApiResponse<T>> {
  const {
    method = "GET",
    body,
    headers = {},
    skipAuth = false,
    suppressSubscriptionPaywall = false,
    expectedSuccessStatus,
    timeoutMs = API_REQUEST_TIMEOUT_MS,
    requestGuard,
    skipAuthRefreshReplay = false,
    chat2Origin,
  } = options;

  const token = skipAuth ? null : await SecureStore.getItemAsync("auth_token");
  if (requestGuard && !requestGuard(token)) return getSessionChangedError();

  const clientTraceparent=newMobileTraceparent();
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...getMobileClientHeaders(),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...headers,
    ...(clientTraceparent?{traceparent:clientTraceparent}:{}),
  };

  const config: RequestInit = {
    method,
    headers: requestHeaders,
  };

  if (body && method !== "GET") {
    config.body = JSON.stringify(body);
  }

  const safeEndpoint = traceEndpoint(endpoint);
  const sensitive = vetEndpoint(endpoint) || endpoint === "/api/v1/auth/change-password";

  const startedAt=Date.now();
  try {
    if (requestGuard && !requestGuard(token)) return getSessionChangedError();
    const response = await fetchWithTimeout(`${chat2OnlyBaseUrl(endpoint, chat2Origin)}${endpoint}`, config, timeoutMs).finally(()=>mobilePerformance.record(`API_${mobileEndpointGroup(endpoint)}`,Date.now()-startedAt));


    // Auto-refresh при 401
    if (response.status === 401 && !skipAuth && !alreadyRefreshed && !skipAuthRefreshReplay) {
      const isCurrent = () => requestGuard?.(token) ?? true;
      if (!isCurrent()) return getSessionChangedError();
      const refreshResult = await refreshAccessToken(isCurrent);
      if (!isCurrent()) return getSessionChangedError();
      if (refreshResult.success) {
        // Повторяем запрос с новым токеном
        return apiClientWithRefreshLimit<T>(endpoint, options, true);
      }
      return getRefreshFailureResponse(refreshResult);
    }

    if (requestGuard && !requestGuard(token)) return getSessionChangedError();
    const parsed = await safeParseResponseJson(response, sensitive);
    if (requestGuard && !requestGuard(token)) return getSessionChangedError();
    if (!parsed.ok) {
      reportClientError(parsed.cause ?? new Error("API_INVALID_RESPONSE"), {
        issueKey: "ApiClientInvalidResponse",
        http: buildMobileHttpDiagnostic({endpoint,method,category:"invalid_response",startedAt,retried:alreadyRefreshed,response,clientTraceparent}),
        keys: {
          endpoint: safeEndpoint,
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
      if(response.status>=500)reportClientError(new Error("API_SERVER_FAILURE"),{
        issueKey:"ApiClientServerFailure",
        http:buildMobileHttpDiagnostic({endpoint,method,category:"server",startedAt,retried:alreadyRefreshed,response,clientTraceparent}),
      });
      const code = extractHttpErrorCode(data);
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

    if (expectedSuccessStatus !== undefined && response.status !== expectedSuccessStatus) {
      return { success: false, code: "UNEXPECTED_SUCCESS_STATUS" };
    }
    return data as ApiResponse<T>;
  } catch (error) {
    if (requestGuard && !requestGuard(token)) return getSessionChangedError();
    reportClientError(
      sensitive
        ? new Error(
            endpoint === "/api/v1/auth/change-password"
              ? "PASSWORD_HTTP_FAILED"
              : "VET_HTTP_FAILED",
          )
        : error,
      {
        issueKey: "ApiClient",
        severity:isAbortError(error)||isNetworkRequestError(error)?"warning":"error",
        http:buildMobileHttpDiagnostic({endpoint,method,category:isAbortError(error)?"timeout":isNetworkRequestError(error)?"network":"unknown",
          startedAt,retried:alreadyRefreshed,clientTraceparent}),
        keys: { endpoint: safeEndpoint },
      },
    );
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
  requestGuard?: ApiClientOptions["requestGuard"],
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  const safeEndpoint = traceEndpoint(endpoint);
  const sensitive = vetEndpoint(endpoint);

  const startedAt=Date.now();
  let retried=false;
  let clientTraceparent:string|undefined;
  let selectedToken: string | null | undefined;
  const doFetch = async (): Promise<{ response: Response; token: string | null } | null> => {
    const token = await SecureStore.getItemAsync("auth_token");
    selectedToken = token;
    if (requestGuard && !requestGuard(token)) return null;
    clientTraceparent=newMobileTraceparent();
    const headers: Record<string, string> = {
      ...getMobileClientHeaders(),
      ...(clientTraceparent?{traceparent:clientTraceparent}:{}),
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const attemptStarted=Date.now();
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: buildFormData(),
    }).finally(()=>mobilePerformance.record("API_MULTIPART",Date.now()-attemptStarted));
    return {response, token};
  };

  try {
    let selected = await doFetch();
    if (!selected || (requestGuard && !requestGuard(selected.token))) return getSessionChangedError();
    if (selected.response.status === 401) {
      const originalToken = selected.token;
      const isCurrent = () => requestGuard?.(originalToken) ?? true;
      const refreshResult = await refreshAccessToken(isCurrent);
      if (!isCurrent()) return getSessionChangedError();
      if (refreshResult.success) {
        retried=true;
        selected = await doFetch();
        if (!selected || (requestGuard && !requestGuard(selected.token))) return getSessionChangedError();
      } else {
        return getRefreshFailureResponse(refreshResult);
      }
    }
    const {response, token} = selected;

    const parsed = await safeParseResponseJson(response, sensitive);
    if (requestGuard && !requestGuard(token)) return getSessionChangedError();
    if (!parsed.ok) {
      reportClientError(parsed.cause ?? new Error("API_MULTIPART_INVALID_RESPONSE"), {
        issueKey: "ApiClientMultipartInvalidResponse",
        http:buildMobileHttpDiagnostic({endpoint,method:"POST",category:"invalid_response",startedAt,retried,response,clientTraceparent}),
        keys: {
          endpoint: safeEndpoint,
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
      if(response.status>=500)reportClientError(new Error("API_MULTIPART_SERVER_FAILURE"),{
        issueKey:"ApiClientMultipartServerFailure",
        http:buildMobileHttpDiagnostic({endpoint,method:"POST",category:"server",startedAt,retried,response,clientTraceparent}),
      });
      return {
        success: false,
        error: extractHttpErrorMessage(data, response),
        code: extractHttpErrorCode(data),
      };
    }

    return data as ApiResponse<T>;
  } catch (error) {
    if (requestGuard && !requestGuard(selectedToken)) return getSessionChangedError();
    reportClientError(sensitive ? new Error("VET_MULTIPART_FAILED") : error, {
      issueKey: "ApiClientMultipart",
      severity:isAbortError(error)||isNetworkRequestError(error)?"warning":"error",
      http:buildMobileHttpDiagnostic({endpoint,method:"POST",category:isAbortError(error)?"timeout":isNetworkRequestError(error)?"network":"unknown",
        startedAt,retried,clientTraceparent}),
      keys: { endpoint: safeEndpoint },
    });
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
