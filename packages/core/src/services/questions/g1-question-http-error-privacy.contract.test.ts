/** AG1-SOC-040: unexpected question errors retain stable HTTP 500 without logging PII. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v3";

const m = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.logError }),
}));
import { QuestionError, questionHttpError } from "./errors";

describe("AG1-SOC-040 privacy-safe question HTTP errors", () => {
  beforeEach(() => vi.resetAllMocks());

  it("unexpected storage failure hides credentials in HTTP and structured logs", () => {
    const secret = "PRIVATE_QUESTION_PHOTO_KEY_AND_PROVIDER_TOKEN_ABC";
    const err = new Error(`S3 signed link expires ${secret}`);
    err.stack = `provider.stack: /uploads/user-A/${secret}`;
    const result = questionHttpError(err);
    expect(result).toEqual({
      status: 500,
      body: {
        success: false,
        error: "Не удалось выполнить запрос. Попробуйте ещё раз",
        code: "QUESTIONS_UNAVAILABLE",
      },
    });
    expect(m.logError).toHaveBeenCalledTimes(1);
    // Pino serializes Error.message/stack specially; JSON.stringify(Error) drops
    // these non-enumerable fields, so inspect the actual logger argument.
    const loggedError = m.logError.mock.calls[0]?.[1];
    expect(loggedError?.message ?? "").not.toContain(secret);
    expect(loggedError?.stack ?? "").not.toContain(secret);
  });

  it("an unexpected non-Error provider value cannot leak via String(value)", () => {
    const secret = "PRIVATE_HTTP_BEARER_TOKEN_DEF";
    const result = questionHttpError({ toString: () => `Bearer ${secret}` });
    expect(result.status).toBe(500);
    const loggedError = m.logError.mock.calls[0]?.[1];
    expect(loggedError?.message ?? "").not.toContain(secret);
  });

  it("known application error retains specific status and code without internal log", () => {
    const result = questionHttpError(new QuestionError("PHOTO_FORBIDDEN", "Фото недоступно", 403));
    expect(result).toEqual({
      status: 403,
      body: { success: false, error: "Фото недоступно", code: "PHOTO_FORBIDDEN" },
    });
    expect(m.logError).not.toHaveBeenCalled();
  });

  it("invalid JSON syntax has stable HTTP 400 without stack exposure", () => {
    const result = questionHttpError(new SyntaxError("Bearer SENSITIVE_INPUT"));
    expect(result).toEqual({
      status: 400,
      body: { success: false, error: "Некорректный запрос", code: "INVALID_REQUEST" },
    });
    expect(m.logError).not.toHaveBeenCalled();
  });

  it("schema validation retains HTTP 400 and a public error string", () => {
    const result = z.string().min(2, "Слишком коротко").safeParse("x");
    expect(result.success).toBe(false);
    if (result.success) throw new Error("INVALID_TEST_SETUP");
    expect(questionHttpError(result.error)).toEqual({
      status: 400,
      body: { success: false, error: "Слишком коротко", code: "VALIDATION_ERROR" },
    });
    expect(m.logError).not.toHaveBeenCalled();
  });
});
