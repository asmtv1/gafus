import { Prisma } from "@gafus/prisma";
import {
  ServiceError,
  NotFoundError,
  ConflictError,
  InternalServiceError,
  ValidationError
} from "./ServiceError";

/**
 * Преобразует Prisma ошибки в типизированные ServiceError
 * @param error - Ошибка из Prisma
 * @param context - Контекст операции (название ресурса, например "Питомец", "Курс")
 * @throws ServiceError - Типизированная ошибка сервиса
 */
export function handlePrismaError(error: unknown, context?: string): never {
  // Если это уже ServiceError, пробрасываем дальше
  if (error instanceof ServiceError) {
    throw error;
  }

  // Обрабатываем известные Prisma ошибки
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        // Уникальное ограничение нарушено
        const field = error.meta?.target as string[] | undefined;
        const fieldName = field ? field.join(', ') : 'данные';
        throw new ConflictError(`Запись с такими ${fieldName} уже существует`);
      }

      case 'P2025': {
        // Запись не найдена
        throw new NotFoundError(context || "Ресурс", undefined);
      }

      case 'P2003': {
        // Нарушение внешнего ключа
        throw new ValidationError("Нарушение целостности данных (внешний ключ)");
      }

      case 'P2014': {
        // Нарушение обязательного поля
        throw new ValidationError("Нарушение ограничения (обязательное поле)");
      }

      case 'P2000': {
        // Значение слишком длинное
        throw new ValidationError("Введенные данные превышают допустимую длину");
      }

      case 'P2001': {
        // Запись не найдена (старая версия)
        throw new NotFoundError(context || "Ресурс", undefined);
      }

      default: {
        // Неизвестная Prisma ошибка
        throw new InternalServiceError(`Ошибка базы данных: ${error.code}. ${context || ''}`);
      }
    }
  }

  // Обрабатываем ошибки валидации Prisma
  if (error instanceof Prisma.PrismaClientValidationError) {
    throw new ValidationError("Ошибка валидации данных");
  }

  // Остальные ошибки - внутренняя ошибка сервера
  throw new InternalServiceError("Неизвестная ошибка базы данных");
}
