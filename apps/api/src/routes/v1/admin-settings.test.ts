import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  verify: vi.fn(), reg: vi.fn(), role: vi.fn(), read: vi.fn(), save: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: f.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: f.reg }));
vi.mock("@gafus/core/services/adminUser", () => ({ readAdminActorRole: f.role }));
vi.mock("@gafus/core/services/appSubscription", () => ({
  getDefaultAppSubscriptionSettings: f.read,
  updateDefaultAppSubscriptionSettings: f.save,
}));
import { authMiddleware } from "../../middleware/auth";
import { adminSettingsRoutes } from "./admin-settings";
const base = "/api/v1/admin/settings";
function app() {
  const h = new Hono();
  h.use(`${base}/*`, authMiddleware);
  h.route(base, adminSettingsRoutes);
  return h;
}
const req = (method = "GET", body?: object, auth = true) => app().request(
  `http://local.test${base}/subscriptions`, {
    method, headers: { ...(auth ? { authorization: "Bearer token" } : {}),
      ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const input = {
  twoWeeksEnabled: false, yookassaTwoWeeksPriceRub: 1185, twoWeeksIntervalDays: 30,
  monthlyEnabled: true, yookassaMonthlyPriceRub: 1465, monthlyIntervalDays: 30,
  threeMonthsEnabled: false, yookassaThreeMonthsPriceRub: 2470, threeMonthsIntervalDays: 90,
  monthlyAppleProductId: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  f.verify.mockResolvedValue({ id: "admin", role: "ADMIN", username: "admin" });
  f.reg.mockResolvedValue(true);
  f.role.mockResolvedValue("ADMIN");
  f.read.mockResolvedValue(null);
  f.save.mockResolvedValue({});
});

describe("admin pricing controls", () => {
  it("blocks unauthenticated read", async () => {
    expect((await req("GET", undefined, false)).status).toBe(401);
    expect(f.read).not.toHaveBeenCalled();
  });
  it("MODERATOR reads but cannot change prices", async () => {
    f.verify.mockResolvedValue({ id: "mod", role: "MODERATOR", username: "mod" });
    f.role.mockResolvedValue("MODERATOR");
    expect((await req()).status).toBe(200);
    expect((await req("PUT", input)).status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });
  it("rejects JWT ADMIN who lost DB privileges", async () => {
    f.role.mockResolvedValue("USER");
    expect((await req()).status).toBe(403);
    expect((await req("PUT", input)).status).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });
  it("returns Next-identical safe default plans and no-store", async () => {
    const response = await req();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ success: true, data: {
      ...input, threeMonthsIntervalDays: 30,
    } });
  });
  it("saves exact validated price settings with JWT actor", async () => {
    const response = await req("PUT", input);
    expect(response.status).toBe(200);
    expect(f.save).toHaveBeenCalledWith({ ...input, actorId: "admin" });
  });
  it("rejects negative price, invalid duration, extra fields", async () => {
    for (const bad of [
      { ...input, yookassaMonthlyPriceRub: -5 },
      { ...input, monthlyIntervalDays: 0 },
      { ...input, actorId: "forged" },
    ]) {
      expect((await req("PUT", bad)).status).toBe(400);
    }
    expect(f.save).not.toHaveBeenCalled();
  });
  it("does not expose internal upsert details on error", async () => {
    f.save.mockRejectedValue(new Error("secret-db-settings"));
    const response = await req("PUT", input);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret-db-settings");
  });
});
