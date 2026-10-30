import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  verify: vi.fn(), register: vi.fn(), role: vi.fn(), lock: vi.fn(), bump: vi.fn(),
  transaction: vi.fn(), metrics: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: f.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: f.register }));
vi.mock("@gafus/core/services/training", () => ({ getCourseCacheMetricsSnapshot: f.metrics }));
vi.mock("@gafus/prisma", () => ({ prisma: {
  user: { findUnique: f.role }, $transaction: f.transaction,
} }));
import { authMiddleware } from "../../middleware/auth";
import { adminCacheRoutes } from "./admin-cache";
const base = "/api/v1/admin/cache";
const app = () => {
  const h = new Hono();
  h.use(base, authMiddleware);h.use(`${base}/*`, authMiddleware);
  h.route(base, adminCacheRoutes);
  return h;
};
const req = (path: string, method = "GET", body?: object, auth = true) => app().request(
  `http://local.test${base}${path}`, { method, headers: {
    ...(auth ? { authorization: "Bearer token" } : {}),
    ...(body ? { "content-type": "application/json" } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) },
);
beforeEach(() => {
  vi.clearAllMocks();
  f.verify.mockResolvedValue({ id: "admin1", role: "ADMIN", username: "admin" });
  f.register.mockResolvedValue(true);
  f.role.mockResolvedValue({ role: "ADMIN" });
  f.metrics.mockReturnValue({ counters: { hit: 2 }, flags: { enabled: true } });
  f.bump.mockResolvedValue([{ revision: 42n }]);
  f.transaction.mockImplementation(async callback => callback({
    user: { findUnique: f.role },
    $queryRaw: vi.fn().mockImplementationOnce(() => f.lock()).mockImplementationOnce(() => f.bump()),
  }));
});

describe("admin course cache durable revision", () => {
  it("guest 401 without metrics or SQL access", async () => {
    expect((await req("", "GET", undefined, false)).status).toBe(401);
    expect((await req("/courses/refresh", "POST", {}, false)).status).toBe(401);
    expect(f.metrics).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("current ADMIN and MODERATOR can read bounded cache metrics", async () => {
    const response = await req("");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.data.allNextTagsSupported).toBe(false);
    expect(body.data.courseRevisionSource).toBe("POSTGRESQL");
    f.verify.mockResolvedValue({ id: "mod", username: "mod", role: "MODERATOR" });
    f.role.mockResolvedValue({ role: "MODERATOR" });
    expect((await req("")).status).toBe(200);
  });
  it("denies user role and stale STAFF JWT", async () => {
    f.verify.mockResolvedValue({ id: "user", username: "user", role: "USER" });
    expect((await req("")).status).toBe(403);
    expect(f.metrics).not.toHaveBeenCalled();
    f.verify.mockResolvedValue({ id: "admin1", role: "ADMIN", username: "admin" });
    f.role.mockResolvedValue({ role: "USER" });
    expect((await req("")).status).toBe(403);
    expect((await req("/courses/refresh", "POST", { confirmation: "REFRESH_COURSE_CONTENT" })).status)
      .toBe(403);
    expect(f.bump).not.toHaveBeenCalled();
  });
  it.each([{}, { confirmation: "yes" },
    { confirmation: "REFRESH_COURSE_CONTENT", actorId: "forged" },
  ])("rejects unconfirmed writes without SQL", async body => {
    expect((await req("/courses/refresh", "POST", body)).status).toBe(400);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("bumps authoritative PG revision with role check under row lock", async () => {
    const response = await req("/courses/refresh", "POST", {
      confirmation: "REFRESH_COURSE_CONTENT",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true,
      data: { refreshed: true, revision: "42", scope: "HONO_COURSE_CONTENT" },
    });
    expect(f.lock).toHaveBeenCalledOnce();
    expect(f.bump).toHaveBeenCalledOnce();
  });
  it("fails closed when revision row absent", async () => {
    f.bump.mockResolvedValue([]);
    const res = await req("/courses/refresh", "POST", {
      confirmation: "REFRESH_COURSE_CONTENT",
    });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("CACHE_REVISION_MISSING");
  });
  it("masks sql failure and does not claim success", async () => {
    f.bump.mockRejectedValue(new Error("secret postgres db hostname"));
    const res = await req("/courses/refresh", "POST", {
      confirmation: "REFRESH_COURSE_CONTENT",
    });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("hostname");
  });
});
