import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  verify: vi.fn(), reg: vi.fn(), role: vi.fn(), dashboard: vi.fn(), payments: vi.fn(),
  promos: vi.fn(), npd: vi.fn(), promoCreate: vi.fn(), promoUpdate: vi.fn(),
  promoArchive: vi.fn(), npdRetry: vi.fn(), npdReconcile: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: f.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: f.reg }));
vi.mock("@gafus/prisma", () => ({ prisma: { user: { findUnique: f.role } } }));
vi.mock("@gafus/core/services/appSubscription", () => ({
  getAppSubscriptionAdminDashboard: f.dashboard,
  getAppSubscriptionPaymentHistory: f.payments,
  getAppSubscriptionPromoCodesAdmin: f.promos,
  getNpdAdminPage: f.npd,
  createAppSubscriptionPromoCode: f.promoCreate,
  updateAppSubscriptionPromoCode: f.promoUpdate,
  archiveAppSubscriptionPromoCode: f.promoArchive,
  adminRetryNpdReceiptOperation: f.npdRetry,
  adminQueueNpdReconciliation: f.npdReconcile,
  AppSubscriptionPromoCodeDomainError: class AppSubscriptionPromoCodeDomainError extends Error {
    constructor(public code: string, msg: string) { super(msg); }
  },
}));
import { authMiddleware } from "../../middleware/auth";
import { adminSubscriptionRoutes } from "./admin-subscriptions";
const base = "/api/v1/admin/app-subscriptions";
function app() {
  const h = new Hono();
  h.use(base, authMiddleware);
  h.use(`${base}/*`, authMiddleware);
  h.route(base, adminSubscriptionRoutes);
  return h;
}
const request = (query = "", authenticated = true) => app().request(`http://local.test${base}${query}`, {
  headers: authenticated ? { authorization: "Bearer token" } : {},
});
beforeEach(() => {
  vi.clearAllMocks();
  f.verify.mockResolvedValue({ id: "actor-1", role: "ADMIN", username: "admin" });
  f.reg.mockResolvedValue(true);
  f.role.mockResolvedValue({ role: "ADMIN" });
  f.dashboard.mockResolvedValue({ totals: { subscriptions: 3 } });
  f.payments.mockResolvedValue({ rows: [], total: 10 });
  f.promos.mockResolvedValue([{ id: "promo1" }]);
  f.npd.mockResolvedValue({ rows: [], total: 1 });
  f.promoCreate.mockResolvedValue({ id: "promo1", revision: 1 });
  f.promoUpdate.mockResolvedValue({ id: "promo1", revision: 2 });
  f.promoArchive.mockResolvedValue({ id: "promo1", archivedAt: "2026-10-25" });
  f.npdRetry.mockResolvedValue({ ok: true });
  f.npdReconcile.mockResolvedValue({ ok: true });
});

describe("admin premium subscriptions Next parity", () => {
  it("401 guest cannot read money and promo codes", async () => {
    expect((await request("", false)).status).toBe(401);
    expect(f.dashboard).not.toHaveBeenCalled();
  });
  it.each(["USER", "PARTNER", "TRAINER"])("403 %s before sensitive query", async role => {
    f.verify.mockResolvedValue({ id: "other", role, username: "other" });
    expect((await request()).status).toBe(403);
    expect(f.dashboard).not.toHaveBeenCalled();
  });
  it("denies role revoked after JWT creation", async () => {
    f.role.mockResolvedValue({ role: "USER" });
    expect((await request()).status).toBe(403);
    expect(f.dashboard).not.toHaveBeenCalled();
  });
  it("returns default payment dashboard with typed defaults and no-store", async () => {
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(f.payments).toHaveBeenCalledWith({
      page: 1, pageSize: 25, status: undefined, search: undefined,
    });
    expect((await res.json()).data).toEqual({
      role: "ADMIN", dashboard: { totals: { subscriptions: 3 } },
      paymentHistory: { rows: [], total: 10 }, promoCodes: null, npd: null,
    });
  });
  it("allows current moderator to read filtered payments", async () => {
    f.verify.mockResolvedValue({ id: "mod", role: "MODERATOR", username: "mod" });
    f.role.mockResolvedValue({ role: "MODERATOR" });
    const res = await request("?paymentPage=2&paymentPageSize=50&paymentStatus=FAILED&paymentSearch=user");
    expect(res.status).toBe(200);
    expect(f.payments).toHaveBeenCalledWith({
      page: 2, pageSize: 50, status: "FAILED", search: "user",
    });
  });
  it("rejects invalid page sizes and oversize search", async () => {
    expect((await request("?paymentPageSize=5000")).status).toBe(400);
    expect((await request("?npdSearch=" + "a".repeat(129))).status).toBe(400);
    expect(f.payments).not.toHaveBeenCalled();
  });
  it("uses Core promo admin projection and archived flag", async () => {
    const res = await request("?tab=promo-codes&includeArchived=1");
    expect(res.status).toBe(200);
    expect(f.promos).toHaveBeenCalledWith({ includeArchived: true });
    expect(f.dashboard).not.toHaveBeenCalled();
    expect((await res.json()).data.promoCodes).toEqual([{ id: "promo1" }]);
  });
  it("uses DB role in NPD projection and converts UTC date bounds", async () => {
    const res = await request("?tab=npd&npdFrom=2026-10-01&npdTo=2026-10-25&npdPage=3");
    expect(res.status).toBe(200);
    expect(f.npd).toHaveBeenCalledWith({
      role: "ADMIN", page: 3, pageSize: 25, status: undefined, search: undefined,
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-10-25T00:00:00.000Z"),
    });
  });
  it("redacts internal errors", async () => {
    f.dashboard.mockRejectedValue(new Error("sql-secrets"));
    const res = await request();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("sql-secrets");
  });
});


describe("admin premium subscription mutations", () => {
  const post = (path: string, body?: object, method = "POST") => app().request(
    `http://local.test${base}${path}`,
    { method, headers: { authorization: "Bearer token",
      ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) },
  );

  it("creates promo code through Core with current ADMIN role", async () => {
    const payload = { code: "DOG-25", discountPercent: 20, isActive: true };
    const response = await post("/promo-codes", payload);
    expect(response.status).toBe(200);
    expect(f.promoCreate).toHaveBeenCalledWith({ ...payload, actorId: "actor-1" });
  });

  it("rejects promo discount over 50% before write", async () => {
    const response = await post("/promo-codes", { code: "DOG-25", discountPercent: 90, isActive: true });
    expect(response.status).toBe(400);
    expect(f.promoCreate).not.toHaveBeenCalled();
  });

  it("rejects stale admin on promo create", async () => {
    f.role.mockResolvedValue({ role: "USER" });
    const response = await post("/promo-codes", { code: "DOG-25", discountPercent: 20, isActive: true });
    expect(response.status).toBe(403);
    expect(f.promoCreate).not.toHaveBeenCalled();
  });

  it("rejects moderator promo mutations before Core", async () => {
    f.verify.mockResolvedValue({ id: "mod", role: "MODERATOR", username: "mod" });
    const response = await post("/promo-codes", { code: "DOG-25", discountPercent: 20, isActive: true });
    expect(response.status).toBe(403);
    expect(f.promoCreate).not.toHaveBeenCalled();
  });

  it("updates and archives existing promo with actor from JWT", async () => {
    const update = await post("/promo-codes/promo1", { discountPercent: 15, isActive: false }, "PATCH");
    expect(update.status).toBe(200);
    expect(f.promoUpdate).toHaveBeenCalledWith({ id: "promo1", discountPercent: 15,
      isActive: false, actorId: "actor-1" });
    const archive = await post("/promo-codes/promo1", undefined, "DELETE");
    expect(archive.status).toBe(200);
    expect(f.promoArchive).toHaveBeenCalledWith({ id: "promo1", actorId: "actor-1" });
  });

  it("maps duplicate promo to conflict with safe code", async () => {
    const { AppSubscriptionPromoCodeDomainError } = await import("@gafus/core/services/appSubscription");
    f.promoCreate.mockRejectedValue(new AppSubscriptionPromoCodeDomainError(
      "PROMO_CODE_DUPLICATE", "contains internal info"));
    const response = await post("/promo-codes", { code: "DOG-25", discountPercent: 20, isActive: true });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, code: "PROMO_CODE_DUPLICATE" });
  });

  it("retries NPD receipt only through Core operator guard", async () => {
    const response = await post("/npd/receipt1/retry");
    expect(response.status).toBe(200);
    expect(f.npdRetry).toHaveBeenCalledWith("receipt1");
  });

  it("blocks ambiguous NPD retry requiring reconciliation", async () => {
    f.npdRetry.mockResolvedValue({ ok: false, code: "RECONCILIATION_REQUIRED" });
    const response = await post("/npd/receipt1/retry");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, code: "RECONCILIATION_REQUIRED" });
  });

  it("queues reconciliation and masks backend errors", async () => {
    const response = await post("/npd/receipt1/reconcile");
    expect(response.status).toBe(200);
    expect(f.npdReconcile).toHaveBeenCalledWith("receipt1");
    f.npdReconcile.mockRejectedValue(new Error("secret-dsn"));
    const failed = await post("/npd/receipt1/reconcile");
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("secret-dsn");
  });
});
