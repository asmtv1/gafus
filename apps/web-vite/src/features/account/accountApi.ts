import { ApiError, apiRequest } from "../../shared/api/client";

/** Private POSTs use the same-origin server cookie principal + browser Origin validation. */
export async function requestEmailChange(
  newEmail: string, currentPassword?: string,
): Promise<void> {
  await apiRequest<void>("/api/v1/auth/email-change-request", {
    method: "POST",
    json: { newEmail, ...(currentPassword ? { currentPassword } : {}) },
    browserAuth: true, credentials: "include",
  });
}

/** Possession token is the ONLY authority. Never include browser cookies. */
export async function confirmEmailChange(token: string): Promise<void> {
  await apiRequest<void>("/api/v1/auth/email-change-confirm", {
    method: "POST", json: { token }, credentials: "omit",
  });
}

export async function setAccountPassword(newPassword: string): Promise<void> {
  await apiRequest<void>("/api/v1/auth/set-password", {
    method: "POST", json: { newPassword }, browserAuth: true, credentials: "include",
  });
}

export async function changeAccountPassword(
  currentPassword: string, newPassword: string,
): Promise<void> {
  await apiRequest<void>("/api/v1/auth/change-password", {
    method: "POST", json: { currentPassword, newPassword },
    browserAuth: true, credentials: "include",
  });
}

/** User-facing distinction without exposing unknown server failure internals. */
export function accountOperationError(error: unknown, action: "email" | "confirm" | "password"): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Сессия завершена. Войдите снова.";
    if (error.status === 403) return "Действие запрещено. Проверьте авторизацию.";
    if (error.status === 503 || error.status >= 500) {
      return "Сервис временно недоступен. Результат запроса неизвестен. Не повторяйте действие автоматически.";
    }
    if (error.status === 429) return "Слишком много запросов. Повторите попытку позже вручную.";
    if (error.status === 400 || error.status === 409) {
      // Possession-token errors are public: never mirror arbitrary backend
      // messages that could accidentally contain the one-time capability.
      if (action === "confirm") return "Ссылка недействительна или устарела.";
      if (action === "password") {
        // Exact known safe Core messages in the frozen W1 G02 contract.
        // Never echo a backend string that could reflect a typed password.
        const safePasswordMessages = new Set([
          "Пользователь не найден",
          "Пароль уже установлен, используйте смену пароля",
          "Сначала установите пароль",
          "Неверный текущий пароль",
        ]);
        return safePasswordMessages.has(error.message) ? error.message :
          "Не удалось проверить пароль. Проверьте введённые данные.";
      }
      if (error.message === "Неверный текущий пароль") return "Введите правильный текущий пароль.";
      return error.message;
    }
  }
  return action === "confirm"
    ? "Не удалось подтвердить email. Результат запроса неизвестен. Повторите действие вручную."
    : action === "email"
      ? "Не удалось запросить смену email. Результат запроса неизвестен."
      : "Не удалось изменить пароль. Результат запроса неизвестен.";
}
