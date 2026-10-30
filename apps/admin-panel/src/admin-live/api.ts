/** Only same-origin /api/v1. Browser access/refresh cookies are HttpOnly, never read by JS. */
export type AuthActor = {
  id: string;
  username: string;
  role: "ADMIN" | "MODERATOR" | "TRAINER" | "PARTNER" | "USER";
};
export class AdminHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminHttpError";
  }
}
const ALLOWED_PATH = /^\/api\/v1\/[a-z0-9/_?-]+(?:[&=.%+\w-]+)?$/i;
function safePath(path: string) {
  // Decode delimiters and absolute URLs must not bypass relative API boundary.
  if (!ALLOWED_PATH.test(path) || path.includes("//") || /%(?:2f|5c|00)/i.test(path)) {
    throw new Error("Только относительные пути локального API");
  }
  return path;
}
export async function requestAdmin<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const response = await fetch(safePath(path), {
    method: options.method ?? "GET",
    credentials: "include",
    cache: "no-store",
    signal: options.signal,
    headers: {
      Accept: "application/json",
      "X-Gafus-Auth-Transport": "cookie",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  let value: { success?: boolean; data?: T; error?: string; code?: string };
  try {
    value = await response.json();
  } catch {
    throw new AdminHttpError(response.status, "INVALID_RESPONSE", "API вернул некорректный JSON");
  }
  if (!response.ok || value.success !== true) {
    throw new AdminHttpError(
      response.status,
      value.code ?? "REQUEST_FAILED",
      response.status === 401
        ? "Необходима авторизация"
        : response.status === 403
          ? "Недостаточно прав"
          : value.code === "STALE_CONFIG"
            ? "Данные изменены другим администратором. Обновите страницу."
            : (value.error ?? "Не удалось получить или сохранить данные"),
    );
  }
  return value.data as T;
}
export async function loginAdmin(username: string, password: string) {
  const data = await requestAdmin<{ user: AuthActor }>("/api/v1/auth/login", {
    method: "POST",
    body: { username, password },
  });
  return data.user;
}
export async function getAdminActor() {
  try {
    return await requestAdmin<AuthActor>("/api/v1/auth/me");
  } catch (e) {
    if (!(e instanceof AdminHttpError) || e.status !== 401) throw e;
    try {
      await requestAdmin("/api/v1/auth/refresh", { method: "POST", body: {} });
    } catch (refreshError) {
      if (refreshError instanceof AdminHttpError && [400, 401, 403].includes(refreshError.status))
        return null;
      throw refreshError;
    }
    try {
      return await requestAdmin<AuthActor>("/api/v1/auth/me");
    } catch (lastError) {
      if (lastError instanceof AdminHttpError && lastError.status === 401) return null;
      throw lastError;
    }
  }
}
export async function logoutAdmin() {
  await requestAdmin("/api/v1/auth/logout", { method: "POST", body: {} });
}
