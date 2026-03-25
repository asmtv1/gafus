import { ZodError } from "zod";

import { ServiceError } from "./ServiceError";
import { prismaErrorToServiceError } from "./prismaErrorHandler";

/** Сообщение по умолчанию для не-Error / пустого сообщения. */
export const DEFAULT_ACTION_ERROR_MESSAGE = "Неизвестная ошибка";

/** Единый текст для Zod в UI (без сырых путей полей). */
export const ZOD_USER_MESSAGE = "Проверьте введённые данные";

/** Текст для ошибок с HTTP 5xx и внутренних сбоев — без внутренних деталей. */
export const GENERIC_SERVER_ERROR_USER_MESSAGE =
  "Не удалось выполнить операцию. Попробуйте позже.";

export interface GetErrorMessageOptions {
  /** Контекст для Prisma (например имя сущности в NotFound). */
  prismaContext?: string;
}

/**
 * Безопасная строка для пользователя из unknown (server actions, сервисы).
 * Не подставляет сырой Zod/Prisma; для 5xx — общая фраза.
 * Логирование полной ошибки — отдельно через logger.error(..., Error, meta).
 *
 * `fallback` используется для не-Error и пустого `Error.message`, а не вместо доменных ошибок.
 */
export function getErrorMessage(
  error: unknown,
  fallback?: string,
  options?: GetErrorMessageOptions,
): string {
  if (error instanceof ServiceError) {
    if (error.statusCode >= 500) {
      return GENERIC_SERVER_ERROR_USER_MESSAGE;
    }
    return error.message;
  }

  if (error instanceof ZodError) {
    return ZOD_USER_MESSAGE;
  }

  const fromPrisma = prismaErrorToServiceError(error, options?.prismaContext);
  if (fromPrisma) {
    if (fromPrisma.statusCode >= 500) {
      return GENERIC_SERVER_ERROR_USER_MESSAGE;
    }
    return fromPrisma.message;
  }

  if (error instanceof Error) {
    const trimmed = error.message.trim();
    if (trimmed) {
      return trimmed;
    }
    return fallback ?? DEFAULT_ACTION_ERROR_MESSAGE;
  }

  return fallback ?? DEFAULT_ACTION_ERROR_MESSAGE;
}
