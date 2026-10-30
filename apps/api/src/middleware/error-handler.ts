/**
 * Global Error Handler
 * Централизованная обработка ошибок
 */
import type { Context } from "hono";
import { createWebLogger, isZodErrorLike, sanitizeZodErrorForLogMeta } from "@gafus/logger";

const logger = createWebLogger("api-error");

export const errorHandler = (err: Error, c: Context) => {
  // Dynamic URL segments may contain user identifiers, signed tokens or PII.
  // Log the matched Hono route template instead of the raw request path.
  const base = {
    route: c.req.routePath,
    method: c.req.method,
    requestId: c.get("requestId"),
    hasBody: c.req.method === "POST" || c.req.method === "PUT" || c.req.method === "PATCH",
  };

  // Classify validation by its structure, never by an incidental message or name.
  const validationError = isZodErrorLike(err);
  if (validationError) {
    logger.error("Unhandled validation error", undefined, {
      ...base,
      ...sanitizeZodErrorForLogMeta(err),
    });
  } else {
    // Provider errors can embed user data or credentials in both message and
    // stack. Retain request correlation, but never forward the raw exception.
    logger.error("Unhandled internal error", undefined, {
      ...base,
      category: "internal",
    });
  }

  if (validationError) {
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
