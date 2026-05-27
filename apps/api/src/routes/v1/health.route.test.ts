import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaQueryRawMock, redisPingMock } = vi.hoisted(() => ({
  prismaQueryRawMock: vi.fn(),
  redisPingMock: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $queryRaw: prismaQueryRawMock,
  },
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

  it("returns 503 when readiness checks fail", async () => {
    redisPingMock.mockRejectedValueOnce(new Error("redis down"));

    const response = await createTestApp().request("/ready");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not ready",
    });
  });
});
