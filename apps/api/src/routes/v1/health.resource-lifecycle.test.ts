/** ROOT031 / WORK070 — real Hono route, synthetic unresolved dependency calls only. */
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  database: vi.fn(),
  redis: vi.fn(),
  metricsAuth: vi.fn(),
  metrics: vi.fn(),
}));
vi.mock("@gafus/core/services/systemHealth", () => ({ checkCoreDatabaseReady: m.database }));
vi.mock("@gafus/queues", () => ({ connection: { ping: m.redis } }));
vi.mock("@gafus/core/services/training", () => ({
  canReadCourseCacheMetrics: m.metricsAuth,
  getCourseCacheMetricsSnapshot: m.metrics,
}));
import { createHealthRoutes } from "./health";

function app() {
  const a = new Hono();
  a.route(
    "/",
    createHealthRoutes(async () => ({
      checkDatabase: m.database,
      pingRedis: m.redis,
    })),
  );
  return a;
}
const tick = async () => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};

describe("ROOT031 readiness unresolved-resource lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    m.database.mockResolvedValue(undefined);
    m.redis.mockResolvedValue("PONG");
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("repeated timed-out HTTP requests cannot launch unbounded new DB/Redis pairs", async () => {
    m.database.mockImplementation(() => new Promise<void>(() => undefined));
    m.redis.mockImplementation(() => new Promise<void>(() => undefined));
    const router = app();
    for (let i = 0; i < 4; i += 1) {
      const request = Promise.resolve(router.request("/ready"));
      await tick();
      await vi.advanceTimersByTimeAsync(5000);
      const response = await request;
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        status: "not ready",
        error: "Readiness probe failed",
      });
      expect(vi.getTimerCount()).toBe(0);
    }
    expect(m.database).toHaveBeenCalledTimes(1);
    expect(m.redis).toHaveBeenCalledTimes(1);
  });

  it("32 simultaneous requests share one deadline, one DB/Redis pair and sanitized 503", async () => {
    m.database.mockImplementation(() => new Promise<void>(() => undefined));
    m.redis.mockImplementation(() => new Promise<void>(() => undefined));
    const router = app();
    const requests = Array.from({ length: 32 }, () => Promise.resolve(router.request("/ready")));
    await tick();
    expect(m.database).toHaveBeenCalledTimes(1);
    expect(m.redis).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    const responses = await Promise.all(requests);
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        status: "not ready",
        error: "Readiness probe failed",
      });
    }
    expect(vi.getTimerCount()).toBe(0);
    const afterDeadline = await router.request("/ready");
    expect(afterDeadline.status).toBe(503);
    expect(m.database).toHaveBeenCalledTimes(1);
    expect(m.redis).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejecting DB does not release pair while Redis stays unresolved; fresh success only after both settle", async () => {
    let rejectDb!: (error: Error) => void;
    let resolveRedis!: (value: string) => void;
    m.database.mockImplementationOnce(
      () =>
        new Promise<void>((_r, reject) => {
          rejectDb = reject;
        }),
    );
    m.redis.mockImplementationOnce(
      () =>
        new Promise<string>((r) => {
          resolveRedis = r;
        }),
    );
    const router = app();
    const first = Promise.resolve(router.request("/ready"));
    await tick();
    rejectDb(new Error("PRIVATE_DB_EXCEPTION"));
    const firstResponse = await first;
    expect(firstResponse.status).toBe(503);
    expect(await firstResponse.json()).toEqual({
      status: "not ready",
      error: "Readiness probe failed",
    });
    expect(vi.getTimerCount()).toBe(0);
    expect((await router.request("/ready")).status).toBe(503);
    expect(m.database).toHaveBeenCalledTimes(1);
    expect(m.redis).toHaveBeenCalledTimes(1);
    resolveRedis("PONG");
    await tick();
    const recovered = await router.request("/ready");
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({ status: "ready" });
    expect(m.database).toHaveBeenCalledTimes(2);
    expect(m.redis).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("after 5s, one settled sibling never releases pair; late reject drains and only NEW success is 200", async () => {
    let resolveDb!: () => void;
    let rejectRedis!: (error: Error) => void;
    m.database.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolveDb = r;
        }),
    );
    m.redis.mockImplementationOnce(
      () =>
        new Promise<void>((_r, reject) => {
          rejectRedis = reject;
        }),
    );
    const router = app();
    const timedOut = Promise.resolve(router.request("/ready"));
    await tick();
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await timedOut;
    expect(response.status).toBe(503);
    const fixed = await response.text();
    expect(JSON.parse(fixed)).toEqual({ status: "not ready", error: "Readiness probe failed" });
    expect(vi.getTimerCount()).toBe(0);
    resolveDb();
    await tick();
    expect((await router.request("/ready")).status).toBe(503);
    expect(m.database).toHaveBeenCalledTimes(1);
    expect(m.redis).toHaveBeenCalledTimes(1);
    rejectRedis(new Error("PRIVATE_LATE_REDIS_TOKEN"));
    await tick();
    expect(response.status).toBe(503);
    expect(fixed).not.toContain("PRIVATE_LATE_REDIS_TOKEN");
    const fresh = await router.request("/ready");
    expect(fresh.status).toBe(200);
    expect(await fresh.json()).toEqual({ status: "ready" });
    expect(m.database).toHaveBeenCalledTimes(2);
    expect(m.redis).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("two independent health routers never share a probe pair or one another's pending state", async () => {
    let resolveFirstDb!: () => void;
    let resolveFirstRedis!: () => void;
    m.database.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolveFirstDb = r;
        }),
    );
    m.redis.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolveFirstRedis = r;
        }),
    );
    m.database.mockImplementationOnce(() => new Promise<void>(() => undefined));
    m.redis.mockImplementationOnce(() => new Promise<void>(() => undefined));
    const firstRouter = app();
    const secondRouter = app();
    const firstRequest = Promise.resolve(firstRouter.request("/ready"));
    const secondRequest = Promise.resolve(secondRouter.request("/ready"));
    await tick();
    expect(m.database).toHaveBeenCalledTimes(2);
    expect(m.redis).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(2);
    resolveFirstDb();
    resolveFirstRedis();
    expect((await firstRequest).status).toBe(200);
    expect(vi.getTimerCount()).toBe(1);
    const firstAgain = await firstRouter.request("/ready");
    expect(firstAgain.status).toBe(200);
    expect(m.database).toHaveBeenCalledTimes(3);
    expect(m.redis).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await secondRequest).status).toBe(503);
    expect(vi.getTimerCount()).toBe(0);
    expect((await secondRouter.request("/ready")).status).toBe(503);
    expect(m.database).toHaveBeenCalledTimes(3);
    expect(m.redis).toHaveBeenCalledTimes(3);
  });

  it("concurrent fast healthy probes share one pair but next healthy request refreshes", async () => {
    let resolveDb!: () => void;
    let resolveRedis!: () => void;
    m.database.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolveDb = r;
        }),
    );
    m.redis.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolveRedis = r;
        }),
    );
    const router = app();
    const requests = Array.from({ length: 8 }, () => Promise.resolve(router.request("/ready")));
    await tick();
    expect(m.database).toHaveBeenCalledTimes(1);
    expect(m.redis).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    resolveDb();
    resolveRedis();
    const responses = await Promise.all(requests);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect((await router.request("/ready")).status).toBe(200);
    expect(m.database).toHaveBeenCalledTimes(2);
    expect(m.redis).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
