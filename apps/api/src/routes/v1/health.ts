/**
 * Health Check Endpoints
 * /health - базовая проверка работоспособности
 * /ready - проверка подключений к БД и Redis
 */
import { Hono } from "hono";
import { checkCoreDatabaseReady } from "@gafus/core/services/systemHealth";
import { connection as redis } from "@gafus/queues";
import {
  canReadCourseCacheMetrics,
  getCourseCacheMetricsSnapshot,
} from "@gafus/core/services/training";

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
    await Promise.all([checkCoreDatabaseReady(), redis.ping()]);
    return c.json({ status: "ready" });
  } catch (error) {
    return c.json({ status: "not ready", error: String(error) }, 503);
  }
});

// Read-only diagnostics, never exposed without an explicit long bearer token.
// The snapshot contains bounded process-local counts, not course/user IDs.
healthRoutes.get("/metrics/course-cache", (c) => {
  c.header("Cache-Control", "no-store");
  if (!canReadCourseCacheMetrics(c.req.header("Authorization") ?? null)) {
    return c.body(null, 404);
  }
  return c.json(getCourseCacheMetricsSnapshot());
});
