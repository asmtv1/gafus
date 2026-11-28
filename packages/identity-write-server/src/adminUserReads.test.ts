import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), list: vi.fn(), raw: vi.fn(), tx: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: { user: { findUnique: m.user, findMany: m.list }, $transaction: m.tx },
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({strings:[...strings],values}), empty: {strings:[""],values:[]} },
}));
import { readAdminUserRole, readAdminUserRoles, readAdminUserListRows, readAdminUserPage } from "./adminUserReads.js";

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


describe("bounded SQL paging",()=>{
  it("passes only selected page ids to the PII projection in database order",async()=>{
    m.tx.mockImplementation(async fn=>fn({$queryRaw:m.raw,user:{findMany:m.list}}));
    m.raw.mockResolvedValueOnce([{total:21n}]).mockResolvedValueOnce([{id:"b"},{id:"a"}]);
    m.list.mockResolvedValueOnce([{id:"a"},{id:"b"}]);
    const page=await readAdminUserPage({page:2,pageSize:10,search:"dog%_",sort:"username",direction:"asc"});
    expect(page.pagination).toMatchObject({page:2,total:21,pageSize:10});
    expect(page.users).toEqual([{id:"b"},{id:"a"}]);
    expect(m.list).toHaveBeenCalledOnce();
    expect(m.list.mock.calls[0][0].where).toEqual({id:{in:["b","a"]}});
    expect(m.raw.mock.calls[1].slice(-2)).toEqual([10,10]);
    expect(JSON.stringify(m.raw.mock.calls[0])).toContain("dog");
    expect(m.tx.mock.calls[0][1]).toEqual({isolationLevel:"RepeatableRead"});
  });
});
