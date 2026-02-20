import { describe, expect, it, vi } from "vitest";

import { ConflictError, NotFoundError, ValidationError, InternalServiceError } from "./ServiceError";
import { handlePrismaError } from "./prismaErrorHandler";

const MockKnownError = vi.hoisted(() => {
  return class extends Error {
    code: string;
    meta?: Record<string, unknown>;

    constructor(message: string, opts: { code: string; meta?: Record<string, unknown> }) {
      super(message);
      this.name = "PrismaClientKnownRequestError";
      this.code = opts.code;
      this.meta = opts.meta;
    }
  };
});

const MockValidationError = vi.hoisted(() => {
  return class extends Error {
    constructor(message?: string) {
      super(message ?? "Validation error");
      this.name = "PrismaClientValidationError";
    }
  };
});

vi.mock("@gafus/prisma", () => ({
  Prisma: {
    PrismaClientKnownRequestError: MockKnownError,
    PrismaClientValidationError: MockValidationError,
  },
}));

describe("handlePrismaError", () => {
  it("rethrows same ServiceError when error is already ServiceError", () => {
    const original = new NotFoundError("User", "123");
    expect(() => handlePrismaError(original)).toThrow(original);
    expect(() => handlePrismaError(original)).toThrow(NotFoundError);
  });

  it("throws ConflictError for P2002 with meta.target", () => {
    const err = new MockKnownError("Unique constraint", {
      code: "P2002",
      meta: { target: ["phone"] },
    });
    expect(() => handlePrismaError(err)).toThrow(ConflictError);
    expect(() => handlePrismaError(err)).toThrow("phone");
  });

  it("throws ConflictError for P2002 without meta.target", () => {
    const err = new MockKnownError("Unique constraint", { code: "P2002" });
    expect(() => handlePrismaError(err)).toThrow(ConflictError);
    expect(() => handlePrismaError(err)).toThrow("данные");
  });

  it("throws NotFoundError for P2025 with context", () => {
    const err = new MockKnownError("Record not found", { code: "P2025" });
    expect(() => handlePrismaError(err, "Пользователь")).toThrow(NotFoundError);
    expect(() => handlePrismaError(err, "Пользователь")).toThrow("Пользователь");
  });

  it("throws NotFoundError for P2025 without context", () => {
    const err = new MockKnownError("Record not found", { code: "P2025" });
    expect(() => handlePrismaError(err)).toThrow(NotFoundError);
    expect(() => handlePrismaError(err)).toThrow("Ресурс");
  });

  it("throws NotFoundError for P2001", () => {
    const err = new MockKnownError("Record to update not found", { code: "P2001" });
    expect(() => handlePrismaError(err, "Курс")).toThrow(NotFoundError);
  });

  it("throws ValidationError for P2003", () => {
    const err = new MockKnownError("Foreign key violation", { code: "P2003" });
    expect(() => handlePrismaError(err)).toThrow(ValidationError);
    expect(() => handlePrismaError(err)).toThrow("внешний ключ");
  });

  it("throws ValidationError for P2014", () => {
    const err = new MockKnownError("Required field missing", { code: "P2014" });
    expect(() => handlePrismaError(err)).toThrow(ValidationError);
    expect(() => handlePrismaError(err)).toThrow("обязательное поле");
  });

  it("throws ValidationError for P2000", () => {
    const err = new MockKnownError("Value too long", { code: "P2000" });
    expect(() => handlePrismaError(err)).toThrow(ValidationError);
    expect(() => handlePrismaError(err)).toThrow("допустимую длину");
  });

  it("throws InternalServiceError for unknown Prisma code", () => {
    const err = new MockKnownError("Unknown", { code: "P9999" });
    expect(() => handlePrismaError(err, "Тест")).toThrow(InternalServiceError);
    expect(() => handlePrismaError(err, "Тест")).toThrow("P9999");
  });

  it("throws ValidationError for PrismaClientValidationError", () => {
    const err = new MockValidationError();
    expect(() => handlePrismaError(err)).toThrow(ValidationError);
    expect(() => handlePrismaError(err)).toThrow("Ошибка валидации данных");
  });

  it("throws InternalServiceError for plain Error", () => {
    const err = new Error("Database connection failed");
    expect(() => handlePrismaError(err)).toThrow(InternalServiceError);
    expect(() => handlePrismaError(err)).toThrow("Неизвестная ошибка базы данных");
  });
});
