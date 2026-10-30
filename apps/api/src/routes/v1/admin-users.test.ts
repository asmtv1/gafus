import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  verify: vi.fn(), reg: vi.fn(), users: vi.fn(), promos: vi.fn(),
  dbRole: vi.fn(), update: vi.fn(), remove: vi.fn(), partnerPolicy: vi.fn(),
  grantSummary: vi.fn(), paidUntil: vi.fn(), lifetime: vi.fn(),
  clear: vi.fn(), cancelRenewal: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: mock.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: mock.reg }));
vi.mock("@gafus/core/services/adminUser", () => ({
  getAllUsers: mock.users,
  updateUserAdmin: mock.update,
  deleteUserAdmin: mock.remove,
  partnerChangeRequiresAdmin: mock.partnerPolicy,
}));
vi.mock("@gafus/prisma", () => ({ prisma: {
  user: { findUnique: mock.dbRole },
} }));
vi.mock("@gafus/core/services/appSubscription", () => ({
  getFreePartnerPromoCodesForAdminPanel: mock.promos,
  getUserAppSubscriptionAdminSummary: mock.grantSummary,
  adminGrantPaidUntil: mock.paidUntil,
  adminGrantLifetime: mock.lifetime,
  adminClearManualGrant: mock.clear,
  cancelYookassaAppSubscription: mock.cancelRenewal,
}));

import { authMiddleware } from "../../middleware/auth";
import { adminUsersRoutes } from "./admin-users";

function app() {
  const h = new Hono();
  h.use("/api/v1/admin/users", async (c, next) => {
    c.header("Cache-Control", "private, no-store"); await next();
  });
  h.use("/api/v1/admin/users", authMiddleware);
  h.use("/api/v1/admin/users/*", authMiddleware);
  h.route("/api/v1/admin/users", adminUsersRoutes);
  return h;
}
const url = "http://local.test/api/v1/admin/users";
const req = (authenticated = true) => app().request(url, {
  headers: authenticated ? { authorization: "Bearer token" } : {},
});

beforeEach(() => {
  vi.clearAllMocks();
  mock.verify.mockResolvedValue({ id: "staff-1", role: "ADMIN", username: "admin" });
  mock.reg.mockResolvedValue(true);
  mock.promos.mockResolvedValue([{ id: "p1", code: "PROMO" }]);
  mock.users.mockResolvedValue({ success: true, data: [{ id: "u1", username: "dog" }] });
  mock.dbRole.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve({ role: where.id === "staff-1" ? "ADMIN" : "USER" }));
  mock.update.mockResolvedValue({ success: true });
  mock.remove.mockResolvedValue({ success: true });
  mock.partnerPolicy.mockResolvedValue(false);
  mock.grantSummary.mockResolvedValue({ hasActiveSubscription: false });
  mock.paidUntil.mockResolvedValue(undefined);
  mock.lifetime.mockResolvedValue(undefined);
  mock.clear.mockResolvedValue(undefined);
  mock.cancelRenewal.mockResolvedValue(undefined);
});

describe("admin users read parity", () => {
  it("401 guest never accesses sensitive data", async () => {
    const result = await req(false);
    expect(result.status).toBe(401);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(mock.users).not.toHaveBeenCalled();
    expect(mock.promos).not.toHaveBeenCalled();
  });

  it.each(["USER", "TRAINER", "PARTNER"])("403 %s never accesses user data", async role => {
    mock.verify.mockResolvedValue({ id: "other", role, username: "other" });
    const result = await req();
    expect(result.status).toBe(403);
    expect(mock.users).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "MODERATOR"])("serves %s with Core-backed data", async role => {
    mock.verify.mockResolvedValue({ id: "staff-1", role, username: "staff" });
    const result = await req();
    expect(result.status).toBe(200);
    expect(mock.promos).toHaveBeenCalledWith("staff-1");
    expect(mock.users).toHaveBeenCalledOnce();
    expect(await result.json()).toEqual({
      success: true,
      data: { users: [{ id: "u1", username: "dog" }],
        freePartnerPromoCodes: [{ id: "p1", code: "PROMO" }] },
    });
  });

  it("denies stale JWT when current DB role was revoked", async () => {
    mock.promos.mockRejectedValue(new Error("FORBIDDEN"));
    const result = await req();
    expect(result.status).toBe(403);
    expect(mock.users).not.toHaveBeenCalled();
  });

  it("returns a generic no-store 503 if data read fails", async () => {
    mock.users.mockResolvedValue({ success: false, error: "secret db dsn" });
    const result = await req();
    expect(result.status).toBe(503);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(await result.text()).not.toContain("secret db dsn");
  });
});


describe("admin users write contracts", () => {
  const api = (path: string, method: string, body?: object) => app().request(url + path, {
    method,
    headers: { authorization: "Bearer token", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  it("PATCH validates payload before any database access", async () => {
    const result = await api("/u1", "PATCH", { role: "ROOT", actorId: "forged" });
    expect(result.status).toBe(400);
    expect(mock.dbRole).not.toHaveBeenCalled();
  });

  it("PATCH admin passes actor from JWT to Core", async () => {
    const result = await api("/u1", "PATCH", { username: "new-name" });
    expect(result.status).toBe(200);
    expect(mock.update).toHaveBeenCalledWith("u1", { username: "new-name" }, "staff-1");
    expect(mock.partnerPolicy).toHaveBeenCalledWith("staff-1", "u1", { username: "new-name" });
  });

  it("PATCH supports legacy email update through the same Core operation", async () => {
    const result = await api("/u1", "PATCH", { email: "dog@example.org" });
    expect(result.status).toBe(200);
    expect(mock.update).toHaveBeenCalledWith("u1", { email: "dog@example.org" }, "staff-1");
  });

  it("rejects malformed email without mutating Core data", async () => {
    const result = await api("/u1", "PATCH", { email: "not_an_email" });
    expect(result.status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("403 when the current DB role no longer authorizes a mutation", async () => {
    mock.dbRole.mockResolvedValue({ role: "USER" });
    const result = await api("/u1", "PATCH", { username: "new-name" });
    expect(result.status).toBe(403);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("403 when moderator tries to change a role", async () => {
    mock.verify.mockResolvedValue({ id: "staff-1", role: "MODERATOR", username: "mod" });
    mock.dbRole.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ role: where.id === "staff-1" ? "MODERATOR" : "USER" }));
    const result = await api("/u1", "PATCH", { role: "ADMIN" });
    expect(result.status).toBe(403);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("403 when moderator tries to delete an admin or trainer", async () => {
    mock.verify.mockResolvedValue({ id: "staff-1", role: "MODERATOR", username: "mod" });
    mock.dbRole.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ role: where.id === "staff-1" ? "MODERATOR" : "TRAINER" }));
    const result = await api("/u1", "DELETE");
    expect(result.status).toBe(403);
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("DELETE admin reuses Core cleanup and passes actor from JWT", async () => {
    const result = await api("/u1", "DELETE");
    expect(result.status).toBe(200);
    expect(mock.remove).toHaveBeenCalledWith("u1", "staff-1");
  });

  it("DELETE cannot bypass Core self-deletion protection", async () => {
    mock.remove.mockResolvedValue({ success: false, error: "Нельзя удалить самого себя" });
    const result = await api("/staff-1", "DELETE");
    expect(result.status).toBe(422);
    expect(mock.remove).toHaveBeenCalledWith("staff-1", "staff-1");
  });

  it("does not disclose database exceptions on user update", async () => {
    mock.update.mockRejectedValue(new Error("secret-internal-sql"));
    const result = await api("/u1", "PATCH", { username: "new-name" });
    expect(result.status).toBe(500);
    expect(await result.text()).not.toContain("secret-internal-sql");
  });
});


describe("admin user subscription parity", () => {
  const req = (method: string, body?: object, auth = true) => app().request(
    `${url}/u1/app-subscription`, {
      method, headers: {
        ...(auth ? { authorization: "Bearer token" } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      }, ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );

  it("requires auth for read and all grant operations", async () => {
    expect((await req("GET", undefined, false)).status).toBe(401);
    expect((await req("POST", { action: "lifetime" }, false)).status).toBe(401);
    expect(mock.grantSummary).not.toHaveBeenCalled();
    expect(mock.lifetime).not.toHaveBeenCalled();
  });

  it("MODERATOR can read only, never grant", async () => {
    mock.verify.mockResolvedValue({ id: "staff-1", role: "MODERATOR", username: "mod" });
    mock.dbRole.mockResolvedValue({ role: "MODERATOR" });
    expect((await req("GET")).status).toBe(200);
    expect(mock.grantSummary).toHaveBeenCalledWith("u1");
    expect((await req("POST", { action: "lifetime" })).status).toBe(403);
    expect(mock.lifetime).not.toHaveBeenCalled();
  });

  it("demoted JWT ADMIN cannot read or grant", async () => {
    mock.dbRole.mockResolvedValue({ role: "USER" });
    expect((await req("GET")).status).toBe(403);
    expect((await req("POST", { action: "lifetime" })).status).toBe(403);
    expect(mock.grantSummary).not.toHaveBeenCalled();
    expect(mock.lifetime).not.toHaveBeenCalled();
  });

  it("paid_until validates timestamp and JWT actor", async () => {
    const res = await req("POST", { action: "paid_until", paidUntil: "2032-01-01T00:00:00.000Z", reason: "gift" });
    expect(res.status).toBe(200);
    expect(mock.paidUntil).toHaveBeenCalledWith({
      userId: "u1", adminUserId: "staff-1", paidUntil: new Date("2032-01-01T00:00:00.000Z"), reason: "gift",
    });
  });

  it("rejects expired and invalid date before touching Core", async () => {
    expect((await req("POST", { action: "paid_until", paidUntil: "2001-01-01" })).status).toBe(400);
    expect((await req("POST", { action: "paid_until", paidUntil: "unknown" })).status).toBe(400);
    expect(mock.paidUntil).not.toHaveBeenCalled();
  });

  it("lifetime and clear action use Core with JWT actor", async () => {
    expect((await req("POST", { action: "lifetime", reason: "partner" })).status).toBe(200);
    expect(mock.lifetime).toHaveBeenCalledWith({ userId: "u1", adminUserId: "staff-1", reason: "partner" });
    expect((await req("POST", { action: "clear" })).status).toBe(200);
    expect(mock.clear).toHaveBeenCalledWith({ userId: "u1", adminUserId: "staff-1" });
  });

  it("cancel renewal only uses existing Core, not clear manual grant", async () => {
    expect((await req("POST", { action: "cancel_yookassa_renewal" })).status).toBe(200);
    expect(mock.cancelRenewal).toHaveBeenCalledWith("u1");
    expect(mock.clear).not.toHaveBeenCalled();
  });

  it("rejects unknown action and actorId spoofing", async () => {
    expect((await req("POST", { action: "gift_money" })).status).toBe(400);
    expect((await req("POST", { action: "lifetime", actorId: "forged" })).status).toBe(400);
    expect(mock.lifetime).not.toHaveBeenCalled();
  });

  it("masks database errors during manual grant", async () => {
    mock.lifetime.mockRejectedValue(new Error("secret-postgres-dsn"));
    const res = await req("POST", { action: "lifetime" });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("secret-postgres-dsn");
  });
});
