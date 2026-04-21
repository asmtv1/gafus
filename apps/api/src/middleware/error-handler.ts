/**
 * Global Error Handler
 * Централизованная обработка ошибок
 */
import type { Context } from "hono";
import { createWebLogger, isZodErrorLike, sanitizeZodErrorForLogMeta } from "@gafus/logger";

const logger = createWebLogger("api-error");

export const errorHandler = (err: Error, c: Context) => {
  const base = {
    path: c.req.path,
    method: c.req.method,
    requestId: c.get("requestId"),
    hasBody: c.req.method === "POST" || c.req.method === "PUT" || c.req.method === "PATCH",
  };

  if (isZodErrorLike(err)) {
    logger.error("Unhandled error", undefined, {
      ...base,
      ...sanitizeZodErrorForLogMeta(err),
    });
  } else {
    logger.error("Unhandled error", err, {
      ...base,
      errorMessage: err.message,
      errorStack: err.stack,
      errorName: err.name,
    });
  }

  // Если это ошибка валидации от zValidator, возвращаем 400
  if (err.name === "ZodError" || err.message.includes("validation")) {
    return c.json(
      {
        success: false,
        error: "Ошибка валидации данных",
        code: "VALIDATION_ERROR",
        requestId: c.get("requestId"),
      },
      400,
    );
  }

  return c.json(
    {
      success: false,
      error: "Внутренняя ошибка сервера",
      code: "INTERNAL_SERVER_ERROR",
      requestId: c.get("requestId"),
    },
    500,
  );
};
