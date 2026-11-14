import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), list: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { user: { findUnique: m.user, findMany: m.list } } }));
import { readAdminUserRole, readAdminUserRoles, readAdminUserListRows } from "./adminUserReads.js";

beforeEach(() => { vi.clearAllMocks(); m.user.mockResolvedValue(null); m.list.mockResolvedValue([]); });
describe("admin user read-only current DB role projections", () => {
  it("never consults the database for a missing actor or target", async () => {
    expect(await readAdminUserRole("")).toBeNull();
    expect(await readAdminUserRoles("", "target")).toEqual({ actorRole: null, targetRole: null });
    expect(await readAdminUserRoles("admin", "")).toEqual({ actorRole: null, targetRole: null });
    expect(m.user).not.toHaveBeenCalled();
  });
  it("selects only current DB roles, by exact actor and target IDs", async () => {
    m.user.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      role: where.id === "actor" ? "ADMIN" : "PARTNER",
    }));
    expect(await readAdminUserRoles("actor", "target")).toEqual({ actorRole: "ADMIN", targetRole: "PARTNER" });
    expect(m.user).toHaveBeenCalledTimes(2);
    expect(m.user).toHaveBeenCalledWith({ where: { id: "actor" }, select: { role: true } });
    expect(m.user).toHaveBeenCalledWith({ where: { id: "target" }, select: { role: true } });
  });
  it("admin list selects only explicitly allowed fields, never passwords or tokens", async () => {
    await readAdminUserListRows();
    expect(m.list).toHaveBeenCalledTimes(1);
    const query = m.list.mock.calls[0]?.[0];
    expect(query.orderBy).toEqual({ createdAt: "desc" });
    expect(query.select).toMatchObject({
      id: true, username: true, role: true, registrationChannel: true,
      _count: { select: { pushSubscriptions: true } },
      partnerProfile: { select: { promoCodeId: true } },
    });
    for (const forbidden of ["password", "refreshTokens", "sessions", "resetTokens", "apiKey"])
      expect(JSON.stringify(query.select)).not.toContain(`"${forbidden}"`);
  });
});
