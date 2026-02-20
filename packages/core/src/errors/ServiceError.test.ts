import { describe, expect, it } from "vitest";

import {
  ServiceError,
  ValidationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  InternalServiceError,
} from "./ServiceError";

describe("ServiceError", () => {
  it("sets message, code, statusCode, name", () => {
    const err = new ServiceError("Ошибка", "ERR_CODE", 400);
    expect(err.message).toBe("Ошибка");
    expect(err.code).toBe("ERR_CODE");
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe("ServiceError");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ServiceError);
  });

  it("defaults statusCode to 500 when omitted", () => {
    const err = new ServiceError("Ошибка", "ERR_CODE");
    expect(err.statusCode).toBe(500);
  });
});

describe("ValidationError", () => {
  it("extends ServiceError with VALIDATION_ERROR code and 400 status", () => {
    const err = new ValidationError("Неверные данные");
    expect(err.message).toBe("Неверные данные");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe("ValidationError");
    expect(err).toBeInstanceOf(ServiceError);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it("accepts optional fields object", () => {
    const err = new ValidationError("Ошибка", { phone: "Слишком короткий" });
    expect(err.fields).toEqual({ phone: "Слишком короткий" });
  });
});

describe("AuthorizationError", () => {
  it("uses default message when omitted", () => {
    const err = new AuthorizationError();
    expect(err.message).toBe("Недостаточно прав доступа");
    expect(err.code).toBe("AUTHORIZATION_ERROR");
    expect(err.statusCode).toBe(403);
    expect(err.name).toBe("AuthorizationError");
  });

  it("accepts custom message", () => {
    const err = new AuthorizationError("Доступ запрещён");
    expect(err.message).toBe("Доступ запрещён");
  });
});

describe("NotFoundError", () => {
  it("formats message with resource and id when id provided", () => {
    const err = new NotFoundError("User", "123");
    expect(err.message).toContain("User");
    expect(err.message).toContain("123");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe("NotFoundError");
  });

  it("formats message without id when id omitted", () => {
    const err = new NotFoundError("User");
    expect(err.message).toContain("User");
    expect(err.message).not.toContain("undefined");
    expect(err.code).toBe("NOT_FOUND");
  });
});

describe("ConflictError", () => {
  it("sets CONFLICT code and 409 status", () => {
    const err = new ConflictError("Дубликат записи");
    expect(err.message).toBe("Дубликат записи");
    expect(err.code).toBe("CONFLICT");
    expect(err.statusCode).toBe(409);
    expect(err.name).toBe("ConflictError");
  });
});

describe("InternalServiceError", () => {
  it("uses default message when omitted", () => {
    const err = new InternalServiceError();
    expect(err.message).toBe("Внутренняя ошибка сервера");
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe("InternalServiceError");
  });

  it("accepts custom message", () => {
    const err = new InternalServiceError("База недоступна");
    expect(err.message).toBe("База недоступна");
  });
});
