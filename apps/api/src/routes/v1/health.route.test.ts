import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaQueryRawMock, redisPingMock, canReadMetricsMock, getMetricsMock } = vi.hoisted(
  () => ({
    prismaQueryRawMock: vi.fn(),
    redisPingMock: vi.fn(),
    canReadMetricsMock: vi.fn(),
    getMetricsMock: vi.fn(),
  }),
);

vi.mock("@gafus/core/services/systemHealth", () => ({
  checkCoreDatabaseReady: prismaQueryRawMock,
}));

vi.mock("@gafus/core/services/training", () => ({
  canReadCourseCacheMetrics: canReadMetricsMock,
  getCourseCacheMetricsSnapshot: getMetricsMock,
}));

vi.mock("@gafus/queues", () => ({
  connection: {
    ping: redisPingMock,
  },
}));

import { createHealthRoutes } from "./health";

function createTestApp() {
  const app = new Hono();
  app.route(
    "/",
    createHealthRoutes(async () => ({
      checkDatabase: prismaQueryRawMock,
      pingRedis: redisPingMock,
    })),
  );
  return app;
}

describe("health route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaQueryRawMock.mockResolvedValue([{ ok: 1 }]);
    redisPingMock.mockResolvedValue("PONG");
    canReadMetricsMock.mockReturnValue(false);
    getMetricsMock.mockReturnValue({ counters: { hit: 3, miss: 1 } });
  });

  it("returns basic health status", async () => {
    const response = await createTestApp().request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      version: expect.any(String),
    });
  });

  it("returns ready when database and redis checks pass", async () => {
    const response = await createTestApp().request("/ready");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
    expect(prismaQueryRawMock).toHaveBeenCalledOnce();
    expect(redisPingMock).toHaveBeenCalledOnce();
  });

  it("does not disclose diagnostic metrics without authorization", async () => {
    const response = await createTestApp().request("/metrics/course-cache");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getMetricsMock).not.toHaveBeenCalled();
  });

  it("exposes only guarded metrics with no-store", async () => {
    canReadMetricsMock.mockReturnValue(true);
    const response = await createTestApp().request("/metrics/course-cache", {
      headers: { Authorization: "Bearer long-test-token" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ counters: { hit: 3, miss: 1 } });
    expect(canReadMetricsMock).toHaveBeenCalledWith("Bearer long-test-token");
  });

  it("returns 503 when readiness checks fail", async () => {
    redisPingMock.mockRejectedValueOnce(new Error("redis down"));

    const response = await createTestApp().request("/ready");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not ready",
    });
  });

  it("DB probe never settles: readiness responds with bounded sanitized 503", async () => {
    vi.useFakeTimers();
    try {
      prismaQueryRawMock.mockImplementationOnce(() => new Promise(() => undefined));
      const pending = Promise.resolve(createTestApp().request("/ready"));
      const observed = vi.fn();
      void pending.then(observed, observed);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(observed).toHaveBeenCalledTimes(1);
      const response = observed.mock.calls[0]![0] as Response;
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        status: "not ready",
        error: "Readiness probe failed",
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("Redis probe never settles: shared 5s deadline returns sanitized 503", async () => {
    vi.useFakeTimers();
    try {
      redisPingMock.mockImplementationOnce(() => new Promise(() => undefined));
      const pending = Promise.resolve(createTestApp().request("/ready"));
      await vi.advanceTimersByTimeAsync(4_999);
      let done = false;
      void pending.then(() => {
        done = true;
      });
      await Promise.resolve();
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const response = await pending;
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        status: "not ready",
        error: "Readiness probe failed",
      });
      expect(prismaQueryRawMock).toHaveBeenCalledTimes(1);
      expect(redisPingMock).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("raw DB/Redis exceptions never appear in 503 and timer is cleared", async () => {
    vi.useFakeTimers();
    try {
      const secret = "PRIVATE_DATABASE_URL_AND_REDIS_TOKEN";
      prismaQueryRawMock.mockRejectedValueOnce(new Error(secret));
      const response = await createTestApp().request("/ready");
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ status: "not ready", error: "Readiness probe failed" });
      expect(text).not.toContain(secret);
      expect(redisPingMock).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("both successful probes before deadline return 200 without remaining timers", async () => {
    vi.useFakeTimers();
    try {
      const response = await createTestApp().request("/ready");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ready" });
      expect(prismaQueryRawMock).toHaveBeenCalledOnce();
      expect(redisPingMock).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("late DB rejection after timeout cannot change settled 503 or leave a timer", async () => {
    vi.useFakeTimers();
    try {
      let rejectDb!: (reason: Error) => void;
      prismaQueryRawMock.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectDb = reject;
          }),
      );
      const pending = Promise.resolve(createTestApp().request("/ready"));
      await vi.advanceTimersByTimeAsync(5_000);
      const response = await pending;
      expect(response.status).toBe(503);
      const before = await response.text();
      expect(JSON.parse(before)).toEqual({ status: "not ready", error: "Readiness probe failed" });
      rejectDb(new Error("SECRET_LATE_DB_CONNECTION_ERROR"));
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
      expect(response.status).toBe(503);
      expect(before).not.toContain("SECRET_LATE_DB_CONNECTION_ERROR");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
