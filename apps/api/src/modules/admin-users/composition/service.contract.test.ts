/** Real Core authorization policy wired to transaction-owned admin adapters. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  roles: vi.fn(), role: vi.fn(), list: vi.fn(), update: vi.fn(), delete: vi.fn(),
  bind: vi.fn(), cleanup: vi.fn(),
}));
vi.mock("@gafus/identity-write-server/admin-user-reads", () => ({
  readAdminUserRoles: m.roles, readAdminUserRole: m.role, readAdminUserListRows: m.list,
}));
vi.mock("@gafus/identity-write-server/admin-user-writes", () => ({
  updateAdminUserRows: m.update, deleteAdminUserRows: m.delete,
  bindPartnerPromoCodeInTransaction: m.bind,
}));
vi.mock("../../account-cleanup/composition/enqueue.js", () => ({
  enqueueAccountStorageCleanup: m.cleanup,
}));
import { deleteUserAdmin, updateUserAdmin } from "./service";
type SyntheticTx = { lockedUserTransaction: boolean };
const tx: SyntheticTx = { lockedUserTransaction: true };
const at = new Date("2026-11-12T00:00:00Z");
beforeEach(() => { vi.clearAllMocks(); m.cleanup.mockResolvedValue(undefined); m.bind.mockResolvedValue(undefined); });

describe("admin-user Application/Persistence transactional composition", () => {
  it("denies moderator partner promotion AFTER lock, BEFORE any mutation or binding", async () => {
    m.update.mockImplementation(async (_id: string, _input: unknown, actorId: string,
      ports: {authorize: (actorRole: string, targetRole: string) => void}) => {
      expect(actorId).toBe("moderator-current-role");
      ports.authorize("MODERATOR", "USER");
    });
    const result = await updateUserAdmin("target-A", {
      role: "PARTNER", partnerPromoCodeId: "promo-A",
    }, "moderator-current-role");
    expect(result).toEqual({ success: false,
      error: "Только администратор может управлять ролью и промокодом партнёра" });
    expect(m.bind).not.toHaveBeenCalled();
  });
  it("binds approved partner promo in the SAME transaction as the role change", async () => {
    m.update.mockImplementation(async (_id: string, _input: unknown, _actor: string,
      ports: { authorize: (actorRole: string, targetRole: string) => void;
        bindPartner: (tx: SyntheticTx, owner: string, promo: string) => Promise<unknown> }) => {
      ports.authorize("ADMIN", "USER");
      await ports.bindPartner(tx, "target-A", "promo-A");
    });
    expect(await updateUserAdmin("target-A", {
      role: "PARTNER", partnerPromoCodeId: "promo-A",
    }, "admin-A")).toEqual({ success: true });
    expect(m.bind).toHaveBeenCalledExactlyOnceWith(tx, {
      userId: "target-A", promoCodeId: "promo-A",
    });
  });
  it("passes deletion cleanup as the transaction callback BEFORE user deletion", async () => {
    const steps: string[] = [];
    m.cleanup.mockImplementation(async (actual: unknown) => {
      expect(actual).toBe(tx);
      steps.push("cleanup-committed-intent");
    });
    m.delete.mockImplementation(async (target: string, actor: string,
      authorize: (actorRole: string, targetRole: string) => void,
      enqueue: (tx: SyntheticTx, owner: string, at: Date) => Promise<unknown>) => {
      expect([target, actor]).toEqual(["target-A", "admin-A"]);
      authorize("ADMIN", "USER");
      await enqueue(tx, target, at);
      steps.push("user-cascade-deleted");
    });
    expect(await deleteUserAdmin("target-A", "admin-A")).toEqual({ success: true });
    expect(steps).toEqual(["cleanup-committed-intent", "user-cascade-deleted"]);
    expect(m.cleanup).toHaveBeenCalledExactlyOnceWith(tx, "target-A", at);
  });
});
