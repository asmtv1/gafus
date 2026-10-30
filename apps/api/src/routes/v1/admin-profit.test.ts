import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  verify: vi.fn(), reg: vi.fn(), role: vi.fn(), read: vi.fn(), save: vi.fn(), cancel: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: f.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: f.reg }));
vi.mock("@gafus/prisma", () => ({ prisma: { user: { findUnique: f.role } } }));
vi.mock("@gafus/core/services/appSubscription", () => ({
  getProfitDashboard: f.read, saveProfitVideoExpense: f.save, cancelProfitVideoExpense: f.cancel,
}));
import { authMiddleware } from "../../middleware/auth";
import { adminProfitRoutes } from "./admin-profit";
const base = "/api/v1/admin/profit";
function app() {
  const h = new Hono();
  h.use(base, authMiddleware);
  h.use(`${base}/*`, authMiddleware);
  h.route(base, adminProfitRoutes);
  return h;
}
function request(path = "", method = "GET", body?: object, authenticated = true) {
  return app().request("http://local.test" + base + path, {
    method,
    headers: {
      ...(authenticated ? { authorization: "Bearer token" } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const expense = {
  requestKey: "key-2026-10-25-abcdef01",
  input: { partnerId: "partner1", paidDay: "2026-10-23", quantity: 2, comment: "work" },
};
beforeEach(() => {
  vi.clearAllMocks();
  f.verify.mockResolvedValue({ id: "admin", role: "ADMIN", username: "admin" });
  f.reg.mockResolvedValue(true);
  f.role.mockResolvedValue({ role: "ADMIN" });
  f.read.mockResolvedValue({ total: 10000 });
  f.save.mockResolvedValue({});
  f.cancel.mockResolvedValue(undefined);
});

describe("admin profit report and accountable writes", () => {
  it("401 guest causes no Core read", async () => {
    expect((await request("", "GET", undefined, false)).status).toBe(401);
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each(["USER", "TRAINER", "MODERATOR"])("403 %s", async role => {
    f.verify.mockResolvedValue({ id: "other", role, username: "other" });
    expect((await request()).status).toBe(403);
    expect(f.read).not.toHaveBeenCalled();
  });
  it("403 demoted DB admin", async () => {
    f.role.mockResolvedValue({ role: "USER" });
    expect((await request()).status).toBe(403);
    expect(f.read).not.toHaveBeenCalled();
  });
  it("reads report with parsed pagination and no-store", async () => {
    const response = await request("?from=2026-09-01&to=2026-10-25&paymentPage=2&videoPage=3");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(f.read).toHaveBeenCalledWith({
      from: "2026-09-01", to: "2026-10-25", paymentPage: 2, videoPage: 3,
    });
  });
  it("rejects invalid pagination and date", async () => {
    expect((await request("?paymentPage=0")).status).toBe(400);
    expect((await request("?from=not-a-date")).status).toBe(400);
    expect(f.read).not.toHaveBeenCalled();
  });
  it("saves financial expense by authenticated actor and idempotency key", async () => {
    const response = await request("/video-expenses", "POST", expense);
    expect(response.status).toBe(200);
    expect(f.save).toHaveBeenCalledWith({ ...expense, actorId: "admin" });
  });
  it("rejects malformed expense and extra actor field", async () => {
    const response = await request("/video-expenses", "POST", { ...expense, actorId: "forged" });
    expect(response.status).toBe(400);
    expect(f.save).not.toHaveBeenCalled();
  });
  it("passes cancellation revision to existing Core transaction", async () => {
    const response = await request("/video-expenses/cancel", "POST", { id: "expense1", version: 5 });
    expect(response.status).toBe(200);
    expect(f.cancel).toHaveBeenCalledWith("admin", "expense1", 5);
  });
  it("rejects stale version as 409", async () => {
    f.cancel.mockRejectedValue(new Error("Запись уже изменена. Обновите страницу"));
    const response = await request("/video-expenses/cancel", "POST", { id: "expense1", version: 3 });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, code: "STALE_RECORD" });
  });
  it("masks provider/internal errors", async () => {
    f.save.mockRejectedValue(new Error("secret-expense-db"));
    const response = await request("/video-expenses", "POST", expense);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret-expense-db");
  });
});
