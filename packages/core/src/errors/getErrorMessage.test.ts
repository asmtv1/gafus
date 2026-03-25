import { describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";

import {
  DEFAULT_ACTION_ERROR_MESSAGE,
  GENERIC_SERVER_ERROR_USER_MESSAGE,
  getErrorMessage,
  ZOD_USER_MESSAGE,
} from "./getErrorMessage";
import {
  AuthorizationError,
  ConflictError,
  InternalServiceError,
  NotFoundError,
  ValidationError,
} from "./ServiceError";

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

describe("getErrorMessage", () => {
  it("returns ValidationError.message for 4xx ServiceError", () => {
    expect(getErrorMessage(new ValidationError("Неверные данные"))).toBe("Неверные данные");
    expect(getErrorMessage(new NotFoundError("Курс"))).toContain("не найден");
    expect(getErrorMessage(new ConflictError("Уже есть"))).toBe("Уже есть");
    expect(getErrorMessage(new AuthorizationError("Нельзя"))).toBe("Нельзя");
  });

  it("returns generic message for 5xx ServiceError", () => {
    expect(getErrorMessage(new InternalServiceError("Секрет"))).toBe(
      GENERIC_SERVER_ERROR_USER_MESSAGE,
    );
  });

  it("returns ZOD_USER_MESSAGE for ZodError", () => {
    const parsed = z.object({ x: z.string() }).safeParse({});
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error).toBeInstanceOf(ZodError);
      expect(getErrorMessage(parsed.error)).toBe(ZOD_USER_MESSAGE);
    }
  });

  it("maps Prisma P2002 to user message", () => {
    const err = new MockKnownError("Unique", { code: "P2002", meta: { target: ["email"] } });
    expect(getErrorMessage(err)).toContain("email");
  });

  it("maps unknown Prisma code to generic server message", () => {
    const err = new MockKnownError("Unknown", { code: "P9999" });
    expect(getErrorMessage(err)).toBe(GENERIC_SERVER_ERROR_USER_MESSAGE);
  });

  it("maps Prisma validation error", () => {
    expect(getErrorMessage(new MockValidationError())).toBe("Ошибка валидации данных");
  });

  it("uses Error.message for plain Error", () => {
    expect(getErrorMessage(new Error("  hello  "))).toBe("hello");
  });

  it("uses fallback when Error.message is empty", () => {
    expect(getErrorMessage(new Error("   "), "Запасной")).toBe("Запасной");
  });

  it("uses DEFAULT for unknown and empty", () => {
    expect(getErrorMessage(undefined)).toBe(DEFAULT_ACTION_ERROR_MESSAGE);
    expect(getErrorMessage("строка")).toBe(DEFAULT_ACTION_ERROR_MESSAGE);
    expect(getErrorMessage(null, "Кастом")).toBe("Кастом");
  });

  it("passes prismaContext for NotFound message", () => {
    const err = new MockKnownError("nf", { code: "P2025" });
    expect(getErrorMessage(err, undefined, { prismaContext: "Пользователь" })).toContain(
      "Пользователь",
    );
  });
});
