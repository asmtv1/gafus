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

import { healthRoutes } from "./health";

function createTestApp() {
  const app = new Hono();
  app.route("/", healthRoutes);
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
});
