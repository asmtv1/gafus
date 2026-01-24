/**
 * API Server Entry Point
 * Hono-based REST API с JWT авторизацией для web и mobile клиентов
 */
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { prisma } from "@gafus/prisma";
import { connection as redis } from "@gafus/queues";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-server");
const PORT = Number(process.env.API_PORT) || 3001;

const server = serve({ fetch: app.fetch, port: PORT });
logger.info(`API server running on port ${PORT}`);

// Graceful shutdown
let isShuttingDown = false;

const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received, shutting down gracefully`);

  // Force exit timeout
  const forceExitTimeout = setTimeout(() => {
    logger.error("Forced shutdown after timeout", new Error("Shutdown timeout"));
    process.exit(1);
  }, 10000);

  try {
    // Закрываем HTTP сервер (перестаём принимать новые соединения)
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    logger.info("HTTP server closed");

    // Закрываем подключения к БД и Redis
    await Promise.all([prisma.$disconnect(), redis.quit()]);
    logger.info("Database and Redis connections closed");

    clearTimeout(forceExitTimeout);
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown", error as Error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
