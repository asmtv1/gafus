/**
 * Stable public Application failure codes shared by API and Worker.
 * Do not reuse private exception messages as HTTP response bodies or event data.
 * The legacy AUTHORIZATION_ERROR code remains valid for existing clients.
 */
export const APPLICATION_PUBLIC_ERROR_HTTP = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  AUTHORIZATION_ERROR: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
} as const;

export const APPLICATION_PUBLIC_ERROR_MESSAGE = {
  VALIDATION_ERROR: "Ошибка валидации данных",
  UNAUTHORIZED: "Необходима авторизация",
  FORBIDDEN: "Недостаточно прав",
  AUTHORIZATION_ERROR: "Недостаточно прав",
  NOT_FOUND: "Ресурс не найден",
  CONFLICT: "Конфликт данных",
  RATE_LIMITED: "Слишком много запросов",
  DEPENDENCY_UNAVAILABLE: "Сервис временно недоступен",
} as const satisfies Record<keyof typeof APPLICATION_PUBLIC_ERROR_HTTP, string>;

export type ApplicationPublicErrorCode = keyof typeof APPLICATION_PUBLIC_ERROR_HTTP;

/** Safe deterministic classifier; raw status/code mismatches are never public. */
export function classifyApplicationPublicError(
  code: string, status: number,
): ApplicationPublicErrorCode | null {
  if (!Object.prototype.hasOwnProperty.call(APPLICATION_PUBLIC_ERROR_HTTP, code)) return null;
  const candidate = code as ApplicationPublicErrorCode;
  return APPLICATION_PUBLIC_ERROR_HTTP[candidate] === status ? candidate : null;
}

/** The Worker can retry transient failures; auth, validation and conflicts cannot. */
export function isRetryableApplicationError(code: string): boolean {
  return code === "RATE_LIMITED" || code === "DEPENDENCY_UNAVAILABLE";
}
