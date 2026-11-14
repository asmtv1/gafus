/**
 * Global Error Handler
 * Централизованная обработка ошибок
 */
import type { Context } from "hono";
import { ServiceError } from "@gafus/core/errors";
import { APPLICATION_PUBLIC_ERROR_HTTP, APPLICATION_PUBLIC_ERROR_MESSAGE, classifyApplicationPublicError } from "@gafus/types";
import { createWebLogger, isZodErrorLike, sanitizeZodErrorForLogMeta } from "@gafus/logger";

const logger = createWebLogger("api-error");

/** Domain errors have safe stable codes, but their messages may include private IDs. */
function safeDomainCode(error: Error) {
  if (!(error instanceof ServiceError)) return null;
  return classifyApplicationPublicError(error.code, error.statusCode);
}

export const errorHandler = (err: Error, c: Context) => {
  // Dynamic URL segments may contain user identifiers, signed tokens or PII.
  // Log the matched Hono route template instead of the raw request path.
  const base = {
    route: c.req.routePath,
    method: c.req.method,
    requestId: c.get("requestId"),
    traceId: c.get("traceId"),
    operationId: c.get("operationId"),
    hasBody: c.req.method === "POST" || c.req.method === "PUT" || c.req.method === "PATCH",
  };

  // Classify validation by its structure, never by an incidental message or name.
  const validationError = isZodErrorLike(err);
  const domainCode = safeDomainCode(err);
  if (validationError) {
    logger.error("Unhandled validation error", undefined, {
      ...base,
      ...sanitizeZodErrorForLogMeta(err),
    });
  } else if (domainCode) {
    logger.error("Handled domain error", undefined, {
      ...base, category: "domain", code: domainCode,
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

  if (domainCode) {
    return c.json({
      success: false,
      error: APPLICATION_PUBLIC_ERROR_MESSAGE[domainCode],
      code: domainCode,
      requestId: c.get("requestId"),
    }, APPLICATION_PUBLIC_ERROR_HTTP[domainCode]);
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
