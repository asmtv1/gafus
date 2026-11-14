import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), find: vi.fn(), update: vi.fn(), revoke: vi.fn(), delete: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { $transaction: m.transaction } }));
import { updateAdminUserRows, deleteAdminUserRows } from "./adminUserWrites.js";

const tx = {
  $queryRaw: m.lock,
  user: { findUnique: m.find, update: m.update, delete: m.delete },
  refreshToken: { updateMany: m.revoke },
};
beforeEach(() => {
  vi.clearAllMocks();
  m.transaction.mockImplementation((cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
  m.lock.mockResolvedValue([]);
  m.find.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    role: where.id === "admin" ? "ADMIN" : "USER",
  }));
  m.update.mockResolvedValue({}); m.revoke.mockResolvedValue({ count: 0 }); m.delete.mockResolvedValue({});
});
describe("admin user DB transaction boundary", () => {
  it("locks both users and invokes role policy before updating, revoking, or binding", async () => {
    const events: string[] = [];
    m.lock.mockImplementation(async () => { events.push("lock"); return []; });
    const bindPartner = vi.fn(async () => { events.push("bind"); });
    m.update.mockImplementation(async () => { events.push("update"); return {}; });
    m.revoke.mockImplementation(async () => { events.push("revoke"); return {}; });
    await updateAdminUserRows("target", { role: "PARTNER", partnerPromoCodeId: "promo" }, "admin", {
      authorize: (role, target) => {
        expect([role, target]).toEqual(["ADMIN", "USER"]);
        events.push("authorize");
      }, bindPartner,
    });
    expect(events).toEqual(["lock", "authorize", "update", "revoke", "bind"]);
    expect(m.update.mock.calls[0]?.[0].data.sessionsRevokedAt).toBeInstanceOf(Date);
    expect(m.revoke).toHaveBeenCalledWith({ where: { userId: "target", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(bindPartner).toHaveBeenCalledWith(tx, "target", "promo");
  });
  it("revoked or demoted actor cannot mutate any row, even for a harmless edit", async () => {
    await expect(updateAdminUserRows("target", { username: "changed" }, "admin", {
      authorize: () => { throw Error("ACTOR_ROLE_REVOKED"); }, bindPartner: vi.fn(),
    })).rejects.toThrow("ACTOR_ROLE_REVOKED");
    expect(m.lock).toHaveBeenCalledTimes(1);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.revoke).not.toHaveBeenCalled();
  });
  it("ordinary profile edits do not revoke all sessions or invoke partner binding", async () => {
    const bindPartner = vi.fn();
    await updateAdminUserRows("target", { phone: "+100" }, "admin", { authorize: vi.fn(), bindPartner });
    expect(m.revoke).not.toHaveBeenCalled();
    expect(m.update.mock.calls[0]?.[0].data.sessionsRevokedAt).toBeUndefined();
    expect(bindPartner).not.toHaveBeenCalled();
  });
  it("actorless role or partner changes cannot bypass core policy", async () => {
    const authorize = vi.fn(() => { throw Error("REAUTH_REQUIRED"); });
    await expect(updateAdminUserRows("target", { role: "ADMIN" }, undefined, {
      authorize, bindPartner: vi.fn(),
    })).rejects.toThrow("REAUTH_REQUIRED");
    expect(authorize).toHaveBeenCalledWith(null, null);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("deletion requires actor lock, current DB role, cleanup in the transaction, then delete", async () => {
    const events: string[] = [];
    const cleanup = vi.fn(async () => { events.push("outbox"); });
    m.lock.mockImplementation(async () => { events.push("lock"); return []; });
    m.delete.mockImplementation(async () => { events.push("delete"); return {}; });
    await deleteAdminUserRows("target", "admin", () => { events.push("authorize"); }, cleanup);
    expect(events).toEqual(["lock", "authorize", "outbox", "delete"]);
    expect(cleanup).toHaveBeenCalledWith(tx, "target", expect.any(Date));
    await expect(deleteAdminUserRows("admin", "admin", vi.fn(), cleanup)).rejects.toThrow("ADMIN_DELETE_SELF_OR_MISSING_ACTOR");
    expect(m.delete).toHaveBeenCalledTimes(1);
  });
  it("blocked delete never enqueues the cleanup tombstone or deletes the account", async () => {
    const cleanup = vi.fn();
    await expect(deleteAdminUserRows("target", "admin", () => { throw Error("FORBIDDEN"); }, cleanup)).rejects.toThrow("FORBIDDEN");
    expect(cleanup).not.toHaveBeenCalled();
    expect(m.delete).not.toHaveBeenCalled();
  });
});
