import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  verify: vi.fn(), registration: vi.fn(), list: vi.fn(), detail: vi.fn(), mark: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: fake.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: fake.registration }));
vi.mock("@gafus/core/services/appSubscription", () => ({
  listPartnerAdminBalances: fake.list,
  getPartnerAdminBalanceDetail: fake.detail,
  markPartnerBalancePaidAdmin: fake.mark,
}));
import { authMiddleware } from "../../middleware/auth";
import { adminPartnerRoutes } from "./admin-partners";

const base = "http://local.test/api/v1/admin/partners";
function app() {
  const h = new Hono();
  h.use("/api/v1/admin/partners/*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  });
  h.use("/api/v1/admin/partners", authMiddleware);
  h.use("/api/v1/admin/partners/*", authMiddleware);
  h.route("/api/v1/admin/partners", adminPartnerRoutes);
  return h;
}
function request(path = "", method = "GET", authenticated = true) {
  return app().request(base + path, {
    method, headers: authenticated ? { authorization: "Bearer test-token" } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.verify.mockResolvedValue({ id: "actor-from-jwt", role: "ADMIN", username: "admin" });
  fake.registration.mockResolvedValue(true);
  fake.list.mockResolvedValue([{ id: "partner1", availableKopecks: 5200 }]);
  fake.detail.mockResolvedValue({ id: "partner1", availableKopecks: 5200, payouts: [] });
  fake.mark.mockResolvedValue({ success: true, amountKopecks: 5200 });
});

describe("Hono admin partner parity with Next Core actions", () => {
  it("401 guest performs no financial read", async () => {
    const response = await request("", "GET", false);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(fake.list).not.toHaveBeenCalled();
  });

  it.each(["MODERATOR", "USER", "TRAINER"])("403 %s performs no financial read", async role => {
    fake.verify.mockResolvedValue({ id: "other", role, username: "other" });
    const response = await request();
    expect(response.status).toBe(403);
    expect(fake.list).not.toHaveBeenCalled();
  });

  it("lists admin balances using only the authenticated actor", async () => {
    const response = await request("?actorId=forged");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(fake.list).toHaveBeenCalledWith("actor-from-jwt");
    expect(await response.json()).toEqual({
      success: true, data: [{ id: "partner1", availableKopecks: 5200 }],
    });
  });

  it("validates partner id and retrieves a specific detail", async () => {
    const invalid = await request("/bad%20id");
    expect(invalid.status).toBe(400);
    expect(fake.detail).not.toHaveBeenCalled();
    const response = await request("/partner1");
    expect(response.status).toBe(200);
    expect(fake.detail).toHaveBeenCalledWith("actor-from-jwt", "partner1");
  });

  it("404 on unknown partner", async () => {
    fake.detail.mockResolvedValue(null);
    const response = await request("/missing");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, code: "PARTNER_NOT_FOUND" });
  });

  it("marks paid via the existing locked Core transaction and JWT actor", async () => {
    const response = await request("/partner1/mark-paid?actorId=forged", "POST");
    expect(response.status).toBe(200);
    expect(fake.mark).toHaveBeenCalledWith({ actorId: "actor-from-jwt", partnerId: "partner1" });
    expect(await response.json()).toEqual({ success: true, amountKopecks: 5200 });
  });

  it("returns conflict when Core rejects duplicate/unavailable payout", async () => {
    fake.mark.mockResolvedValue({ success: false, error: "Баланс уже выплачен" });
    const response = await request("/partner1/mark-paid", "POST");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, error: "Баланс уже выплачен" });
  });

  it("does not reveal internal database messages", async () => {
    fake.mark.mockRejectedValue(new Error("secret-payout-sql"));
    const response = await request("/partner1/mark-paid", "POST");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret-payout-sql");
  });

  it("Core must still enforce the actor's CURRENT DB role (not JWT alone)", async () => {
    fake.list.mockRejectedValue(new Error("FORBIDDEN"));
    const response = await request();
    expect(response.status).toBe(403);
  });
});
