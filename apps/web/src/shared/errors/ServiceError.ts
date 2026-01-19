/**
 * Базовый класс для всех ошибок сервисов
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

/**
 * Ошибка валидации данных (400)
 */
export class ValidationError extends ServiceError {
  constructor(message: string, public fields?: Record<string, string>) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

/**
 * Ошибка авторизации/доступа (403)
 */
export class AuthorizationError extends ServiceError {
  constructor(message: string = 'Недостаточно прав доступа') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * Ресурс не найден (404)
 */
export class NotFoundError extends ServiceError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} с ID ${id} не найден` : `${resource} не найден`,
      'NOT_FOUND',
      404
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Конфликт данных (409)
 */
export class ConflictError extends ServiceError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

/**
 * Внутренняя ошибка сервера (500)
 */
export class InternalServiceError extends ServiceError {
  constructor(message: string = 'Внутренняя ошибка сервера') {
    super(message, 'INTERNAL_ERROR', 500);
    this.name = 'InternalServiceError';
  }
}