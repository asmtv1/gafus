/** AG1-003: one Hono error boundary, strict validation vs internal + PII-safe logs. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const log = vi.hoisted(() => ({
  error: vi.fn(),
  sanitize: vi.fn(() => ({ category: "validation", issueCount: 1 })),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: log.error }),
  isZodErrorLike: (error: Error) => error.name === "ZodError" &&
    Array.isArray((error as Error & { issues?: unknown }).issues),
  sanitizeZodErrorForLogMeta: log.sanitize,
}));

import { errorHandler } from "./error-handler";

function appWithError(error: Error) {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", "request-g1-003");
    await next();
  });
  app.get("/error/:privateId", () => { throw error; });
  app.onError(errorHandler);
  return app;
}

describe("AG1-003 Hono central 400/500 and sanitized logging", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never maps a non-Zod provider validation-message failure to 400", async () => {
    const privateValue = "PRIVATE_VALIDATION_FAILURE_ORIGIN_AUTH_SECRET";
    const error = new Error(`upstream validation failure: ${privateValue}`);
    error.stack = `STACK_API_TOKEN_${privateValue}`;
    const response = await appWithError(error).request("/error/PRIVATE_PATH_IDENTIFIER");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Внутренняя ошибка сервера",
      code: "INTERNAL_SERVER_ERROR",
      requestId: "request-g1-003",
    });
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(privateValue);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("PRIVATE_PATH_IDENTIFIER");
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("STACK_API_TOKEN");
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("maps a real ZodError to 400 without logging sensitive input", async () => {
    const privateValue = "user.password=PRIVATE_PASSWORD_123";
    const schema = z.object({ phone: z.string().max(2) });
    const parsed = schema.safeParse({ phone: privateValue });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("TEST_SETUP_MUST_BE_INVALID");
    const response = await appWithError(parsed.error).request("/error/SECRET_PROFILE_ID");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "Ошибка валидации данных",
      code: "VALIDATION_ERROR",
      requestId: "request-g1-003",
    });
    expect(log.sanitize).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(privateValue);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("SECRET_PROFILE_ID");
  });

  it("rejects a forged ZodError name without validated issues as internal 500", async () => {
    const error = new Error("unknown runtime failure");
    error.name = "ZodError";
    const response = await appWithError(error).request("/error/id");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      requestId: "request-g1-003",
    });
    expect(log.sanitize).not.toHaveBeenCalled();
  });

  it("does not classify case-insensitive incidental validation in a runtime error as 400", async () => {
    const response = await appWithError(new Error("Validation failed in provider"))
      .request("/error/id");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
