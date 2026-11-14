import {
  ServiceError,
  NotFoundError,
  ConflictError,
  InternalServiceError,
  ValidationError,
} from "./ServiceError";

/** Сообщение для неизвестных кодов Prisma — без технических деталей в UI. */
const UNKNOWN_PRISMA_CODE_USER_MESSAGE =
  "Не удалось выполнить операцию. Попробуйте позже.";

/**
 * Identify database error envelopes without importing the ORM into Core.
 * Prisma's public error names and codes are stable across separate generated
 * clients in one Node process; a generic Error with a coincidentally
 * matching code must NEVER be treated as a database error.
 */
function hasPrismaClientEnvelope(error: unknown, name: string): error is Error & { clientVersion: string } {
  return error instanceof Error && error.name === name &&
    typeof (error as Error & { clientVersion?: unknown }).clientVersion === "string" &&
    (error as Error & { clientVersion: string }).clientVersion.length > 0;
}

function isKnownPrismaError(error: unknown): error is Error & {
  code: string;
  meta?: { target?: unknown };
} {
  if (!hasPrismaClientEnvelope(error, "PrismaClientKnownRequestError")) return false;
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === "string" && /^P\d{4}$/.test(code);
}

function isPrismaValidationError(error: unknown): error is Error {
  return hasPrismaClientEnvelope(error, "PrismaClientValidationError");
}

/** Преобразует Prisma-ошибку в ServiceError без зависимости Core от клиента БД. */
export function prismaErrorToServiceError(
  error: unknown,
  context?: string,
): ServiceError | null {
  if (isKnownPrismaError(error)) {
    switch (error.code) {
      case "P2002": {
        const raw = error.meta?.target as string | string[] | undefined;
        const targets = Array.isArray(raw)
          ? raw.map(String)
          : raw != null
            ? [String(raw)]
            : [];
        const fieldName = targets.length > 0 ? targets.join(", ") : "данные";
        return new ConflictError(`Запись с такими ${fieldName} уже существует`);
      }

      case "P2025":
        return new NotFoundError(context || "Ресурс", undefined);

      case "P2003":
        return new ValidationError("Нарушение целостности данных (внешний ключ)");

      case "P2014":
        return new ValidationError("Нарушение ограничения (обязательное поле)");

      case "P2000":
        return new ValidationError("Введенные данные превышают допустимую длину");

      case "P2001":
        return new NotFoundError(context || "Ресурс", undefined);

      default:
        return new InternalServiceError(UNKNOWN_PRISMA_CODE_USER_MESSAGE);
    }
  }

  if (isPrismaValidationError(error)) {
    return new ValidationError("Ошибка валидации данных");
  }

  return null;
}

/**
 * Преобразует Prisma ошибки в типизированные ServiceError
 * @param error - Ошибка из Prisma
 * @param context - Контекст операции (название ресурса, например "Питомец", "Курс")
 * @throws ServiceError - Типизированная ошибка сервиса
 */
export function handlePrismaError(error: unknown, context?: string): never {
  if (error instanceof ServiceError) {
    throw error;
  }

  const mapped = prismaErrorToServiceError(error, context);
  if (mapped) {
    throw mapped;
  }

  throw new InternalServiceError("Неизвестная ошибка базы данных");
}
