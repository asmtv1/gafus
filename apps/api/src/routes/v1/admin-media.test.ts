import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  verify: vi.fn(),
  registration: vi.fn(),
  read: vi.fn(),
}));

vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: fakes.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: fakes.registration }));
vi.mock("@gafus/core/services/adminStorage", () => ({ getStorageStats: fakes.read }));

import { authMiddleware } from "../../middleware/auth";
import { adminMediaRoutes } from "./admin-media";

function testApp() {
  const h = new Hono();
  h.use("/api/v1/admin/media/*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  });
  h.use("/api/v1/admin/media/*", authMiddleware);
  h.route("/api/v1/admin/media", adminMediaRoutes);
  return h;
}
const url = "http://localhost/api/v1/admin/media/stats";
function request(headers?: Record<string, string>) {
  return testApp().request(url, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.registration.mockResolvedValue(true);
  fakes.verify.mockResolvedValue({ id: "admin-user", role: "ADMIN", username: "admin" });
  fakes.read.mockResolvedValue({ success: true, data: { totalExamResults: 4, withVideo: 2 } });
});

describe("admin media stats API", () => {
  it("rejects a guest before a Core/database read", async () => {
    const response = await request();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(fakes.read).not.toHaveBeenCalled();
  });

  it.each(["MODERATOR", "TRAINER", "USER"])("rejects %s before a Core read", async role => {
    fakes.verify.mockResolvedValue({ id: "other", role, username: "other" });
    const response = await request({ authorization: "Bearer test-token" });
    expect(response.status).toBe(403);
    expect(fakes.read).not.toHaveBeenCalled();
  });

  it("returns private, read-only aggregate stats to ADMIN", async () => {
    const response = await request({ authorization: "Bearer test-token" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      success: true, data: { totalExamResults: 4, withVideo: 2 },
    });
    expect(fakes.read).toHaveBeenCalledOnce();
  });

  it("does not leak storage exception text", async () => {
    fakes.read.mockRejectedValue(new Error("database-secret-must-not-leak"));
    const response = await request({ authorization: "Bearer test-token" });
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ success: false, code: "STORAGE_UNAVAILABLE" });
    expect(body).not.toContain("database-secret-must-not-leak");
  });

  it("maps Core failure result to 503 without exposing internal message", async () => {
    fakes.read.mockResolvedValue({ success: false, error: "internal database address" });
    const response = await request({ authorization: "Bearer test-token" });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("internal database address");
  });
});
