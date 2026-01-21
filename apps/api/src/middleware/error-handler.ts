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
  });

  return c.json(
    {
      success: false,
      error: "Внутренняя ошибка сервера",
      requestId: c.get("requestId"),
    },
    500
  );
};
