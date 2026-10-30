/** ROOT031: real health route + lazy composition, synthetic dynamic provider-loader only. */
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadinessProbes } from "../../lib/readiness-deadline";

const m = vi.hoisted(() => ({
  redisModuleLoad: vi.fn(),
  databaseModuleLoad: vi.fn(),
  database: vi.fn(),
  redis: vi.fn(),
  metricsAuth: vi.fn(),
  metrics: vi.fn(),
}));

// Module factories are evaluated only by the real readiness composition's
// import() after GET /ready. Never initialize actual Redis/Prisma/queues.
vi.mock("@gafus/queues", () => {
  m.redisModuleLoad();
  return { connection: { ping: m.redis } };
});
vi.mock("@gafus/core/services/systemHealth", () => {
  m.databaseModuleLoad();
  return { checkCoreDatabaseReady: m.database };
});
vi.mock("@gafus/core/services/training", () => ({
  canReadCourseCacheMetrics: m.metricsAuth,
  getCourseCacheMetricsSnapshot: m.metrics,
}));

import { createHealthRoutes } from "./health";

function app(load?: () => Promise<ReadinessProbes>) {
  const router = new Hono();
  router.route("/", createHealthRoutes(load));
  return router;
}
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const failedBody = { status: "not ready", error: "Readiness probe failed" };

beforeEach(() => {
  vi.clearAllMocks();
  m.database.mockResolvedValue(undefined);
  m.redis.mockResolvedValue("PONG");
  m.metricsAuth.mockReturnValue(false);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ROOT031 readiness module-boundary isolation", () => {
  it("constructing router, /health and guarded metrics never import queues or probe; first canonical /ready does", async () => {
    const router = app();
    expect(m.redisModuleLoad).not.toHaveBeenCalled();
    expect(m.databaseModuleLoad).not.toHaveBeenCalled();
    expect(m.redis).not.toHaveBeenCalled();
    expect(m.database).not.toHaveBeenCalled();
    const health = await router.request("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", version: expect.any(String) });
    const metrics = await router.request("/metrics/course-cache");
    expect(metrics.status).toBe(404);
    expect(metrics.headers.get("Cache-Control")).toBe("no-store");
    expect(m.redisModuleLoad).not.toHaveBeenCalled();
    expect(m.databaseModuleLoad).not.toHaveBeenCalled();
    const ready = await router.request("/ready");
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ready" });
    expect(m.redisModuleLoad).toHaveBeenCalledOnce();
    expect(m.databaseModuleLoad).toHaveBeenCalledOnce();
    expect(m.redis).toHaveBeenCalledOnce();
    expect(m.database).toHaveBeenCalledOnce();
    expect((await router.request("/ready")).status).toBe(200);
    expect(m.redisModuleLoad).toHaveBeenCalledOnce();
    expect(m.databaseModuleLoad).toHaveBeenCalledOnce();
    expect(m.redis).toHaveBeenCalledTimes(2);
    expect(m.database).toHaveBeenCalledTimes(2);
  });

  it("eight concurrent requests share one pending lazy loader and same 5-second pair deadline", async () => {
    vi.useFakeTimers();
    let resolve!: (p: ReadinessProbes) => void;
    const pending = new Promise<ReadinessProbes>((r) => {
      resolve = r;
    });
    const load = vi.fn(() => pending);
    const router = app(load);
    const requests = Array.from({ length: 8 }, () => Promise.resolve(router.request("/ready")));
    await flush();
    expect(load).toHaveBeenCalledOnce();
    expect(m.database).not.toHaveBeenCalled();
    expect(m.redis).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    for (const r of await Promise.all(requests)) {
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual(failedBody);
    }
    expect(vi.getTimerCount()).toBe(0);
    expect((await router.request("/ready")).status).toBe(503);
    expect(load).toHaveBeenCalledOnce();
    resolve({ checkDatabase: m.database, pingRedis: m.redis });
    await flush();
    expect(m.database).toHaveBeenCalledOnce();
    expect(m.redis).toHaveBeenCalledOnce();
    expect((await router.request("/ready")).status).toBe(200);
    expect(load).toHaveBeenCalledOnce();
    expect(m.database).toHaveBeenCalledTimes(2);
    expect(m.redis).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("synchronous lazy loader failure is contained as safe 503; failed load not cached forever", async () => {
    const load = vi
      .fn<() => Promise<ReadinessProbes>>()
      .mockImplementationOnce(() => {
        throw new Error("PRIVATE_REDIS_IMPORT_ERROR");
      })
      .mockResolvedValue({ checkDatabase: m.database, pingRedis: m.redis });
    const router = app(load);
    const first = await router.request("/ready");
    expect(first.status).toBe(503);
    expect(await first.json()).toEqual(failedBody);
    expect(load).toHaveBeenCalledOnce();
    expect(m.database).not.toHaveBeenCalled();
    expect(m.redis).not.toHaveBeenCalled();
    const second = await router.request("/ready");
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ status: "ready" });
    expect(load).toHaveBeenCalledTimes(2);
    expect(m.database).toHaveBeenCalledOnce();
    expect(m.redis).toHaveBeenCalledOnce();
  });
});
