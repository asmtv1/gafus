/**
 * Global Error Handler
 * Централизованная обработка ошибок
 */
import type { Context } from "hono";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-error");

export const errorHandler = (err: Error, c: Context) => {
  logger.error("Unhandled error", err, {
    path: c.req.path,
    method: c.req.method,
    requestId: c.get("requestId"),
    errorMessage: err.message,
    errorStack: err.stack,
    errorName: err.name,
    // Для POST запросов логируем тело, если возможно
    hasBody: c.req.method === "POST" || c.req.method === "PUT" || c.req.method === "PATCH",
  });

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
