import { Prisma } from "@gafus/prisma";
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
 * Преобразует ошибку Prisma в ServiceError или null, если это не ошибка Prisma.
 * Используется в handlePrismaError и getErrorMessage.
 */
export function prismaErrorToServiceError(
  error: unknown,
  context?: string,
): ServiceError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": {
        const field = error.meta?.target as string[] | undefined;
        const fieldName = field ? field.join(", ") : "данные";
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

  if (error instanceof Prisma.PrismaClientValidationError) {
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
