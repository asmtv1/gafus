import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  verify: vi.fn(), reg: vi.fn(), role: vi.fn(), dashboard: vi.fn(), alerts: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: fake.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: fake.reg }));
vi.mock("@gafus/prisma", () => ({ prisma: { user: { findUnique: fake.role } } }));
vi.mock("@gafus/core/services/systemHealth", () => ({
  getAdminMailDashboard: fake.dashboard,
  getAdminMailAlertCount: fake.alerts,
}));
import { authMiddleware } from "../../middleware/auth";
import { adminMailRoutes } from "./admin-mail";

const base = "/api/v1/admin/mail";
function app() {
  const h = new Hono();
  h.use(base, authMiddleware);
  h.use(`${base}/*`, authMiddleware);
  h.route(base, adminMailRoutes);
  return h;
}
function req(path = "", authenticated = true) {
  return app().request(`http://local.test${base}${path}`, {
    headers: authenticated ? { authorization: "Bearer token" } : {},
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.verify.mockResolvedValue({ id: "staff", role: "ADMIN", username: "admin" });
  fake.reg.mockResolvedValue(true);
  fake.role.mockResolvedValue({ role: "ADMIN" });
  fake.dashboard.mockResolvedValue({
    summary: { pending: 2, failed: 1 }, outbox: [{ id: "masked123" }],
    attempts: [], events: [],
  });
  fake.alerts.mockResolvedValue(3);
});

describe("admin mail monitoring", () => {
  it("401 anonymous denies core read", async () => {
    const result = await req("", false);
    expect(result.status).toBe(401);
    expect(fake.dashboard).not.toHaveBeenCalled();
  });
  it.each(["MODERATOR", "USER", "TRAINER"])("403 %s denies core read", async role => {
    fake.verify.mockResolvedValue({ id: "non-admin", role, username: role });
    const result = await req();
    expect(result.status).toBe(403);
    expect(fake.dashboard).not.toHaveBeenCalled();
  });
  it("rejects revoked actor despite ADMIN JWT", async () => {
    fake.role.mockResolvedValue({ role: "USER" });
    const result = await req();
    expect(result.status).toBe(403);
    expect(fake.dashboard).not.toHaveBeenCalled();
  });
  it("returns privacy-limited Core dashboard with no-store", async () => {
    const result = await req();
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect((await result.json()).data).toEqual({
      summary: { pending: 2, failed: 1 }, outbox: [{ id: "masked123" }],
      attempts: [], events: [],
    });
  });
  it("returns counter for menu badge", async () => {
    const result = await req("/alerts");
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ success: true, data: { count: 3 } });
  });
  it("does not expose a database error", async () => {
    fake.dashboard.mockRejectedValue(new Error("db-host-secret"));
    const result = await req();
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("db-host-secret");
  });
});
