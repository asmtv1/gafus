import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mocked = vi.hoisted(() => ({
  list: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("@gafus/core/services/walks", () => ({
  listCompletedDogWalks: mocked.list,
  syncCompletedDogWalks: mocked.sync,
}));

import { walksRoutes } from "./walks.js";

const app = new Hono();
app.use("*", async (c, next) => {
  c.set("user", { id: "owner-from-jwt", username: "asmtv1", role: "USER" });
  await next();
});
app.route("/api/v1/walks", walksRoutes);
const valid = {
  clientId: "203e78bf-e7f0-4ed6-bec4-b48b0ad85068",
  startedAt: "2026-11-05T09:00:00.000Z",
  finishedAt: "2026-11-05T10:00:00.000Z",
  durationSeconds: 1800,
  steps: 2500,
  estimatedMeters: 2000,
  timerMode: "stopwatch",
  incompleteSteps: false,
};

beforeEach(() => {
  mocked.list.mockReset().mockResolvedValue([valid]);
  mocked.sync.mockReset().mockResolvedValue([valid]);
});

describe("private dog walk HTTP contract", () => {
  it("lists only the authenticated owner and returns no-store", async () => {
    const res = await app.request("http://test/api/v1/walks");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(mocked.list).toHaveBeenCalledWith("owner-from-jwt");
    expect((await res.json()).data).toEqual([valid]);
  });

  it("rejects malformed / duplicate walks without touching persistence", async () => {
    for (const payload of [
      { walks: [valid, valid] },
      { walks: [{ ...valid, durationSeconds: 6000 }] },
      { walks: [{ ...valid, clientId: "bad" }] },
      { walks: [{ ...valid, userId: "victim" }] },
    ]) {
      const response = await app.request("http://test/api/v1/walks/sync", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(response.status).toBe(400);
    }
    expect(mocked.sync).not.toHaveBeenCalled();
  });

  it("syncs as the JWT owner, never as a client supplied identity", async () => {
    const res = await app.request("http://test/api/v1/walks/sync", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ walks: [valid] }),
    });
    expect(res.status).toBe(200);
    expect(mocked.sync).toHaveBeenCalledWith("owner-from-jwt", [valid]);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("returns forbidden without leaking other accounts' history", async () => {
    mocked.list.mockRejectedValueOnce(new Error("WALKS_FORBIDDEN"));
    const res = await app.request("http://test/api/v1/walks");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("FORBIDDEN");
  });
});
