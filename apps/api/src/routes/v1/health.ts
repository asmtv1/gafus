/**
 * Health Check Endpoints
 * /health - базовая проверка работоспособности
 * /ready - проверка подключений к БД и Redis
 */
import { Hono } from "hono";
import { prisma } from "@gafus/prisma";
import { connection as redis } from "@gafus/queues";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
});

healthRoutes.get("/ready", async (c) => {
  try {
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);
    return c.json({ status: "ready" });
  } catch (error) {
    return c.json({ status: "not ready", error: String(error) }, 503);
  }
});
