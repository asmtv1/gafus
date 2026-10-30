/**
 * Health Check Endpoints
 * /health - базовая проверка работоспособности
 * /ready - проверка подключений к БД и Redis
 */
import { Hono } from "hono";
import { createReadinessCheck } from "../../lib/readiness-deadline.js";
import type { ReadinessProbes } from "../../lib/readiness-deadline.js";
import { createLazyReadinessProbes, loadReadinessProbes } from "./health-readiness-composition.js";
import {
  canReadCourseCacheMetrics,
  getCourseCacheMetricsSnapshot,
} from "@gafus/core/services/training";

/** Per-instance readiness state; other routers do not share probe resources. */
export function createHealthRoutes(
  loadReadiness: () => Promise<ReadinessProbes> = loadReadinessProbes,
) {
  const healthRoutes = new Hono();
  const checkReadiness = createReadinessCheck(createLazyReadinessProbes(loadReadiness));

  healthRoutes.get("/health", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
    });
  });

  healthRoutes.get("/ready", async (c) => {
    try {
      await checkReadiness();
      return c.json({ status: "ready" });
    } catch {
      // Never disclose Redis/SQL connection details in a health response.
      return c.json({ status: "not ready", error: "Readiness probe failed" }, 503);
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

  return healthRoutes;
}

export const healthRoutes = createHealthRoutes();
