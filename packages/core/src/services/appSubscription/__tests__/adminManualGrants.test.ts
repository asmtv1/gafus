import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  role: vi.fn(), manual: vi.fn(), update: vi.fn(), create: vi.fn(), cancel: vi.fn(),
  lock: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } },
  prisma: {
    $transaction: f.transaction,
  },
}));

import {
  adminGrantPaidUntil,
  adminGrantLifetime,
  adminClearManualGrant,
} from "../adminService";

beforeEach(() => {
  vi.clearAllMocks();
  f.role.mockImplementation(({ where }: { where: { id: string } }) => {
    if (where.id === "admin-1") return Promise.resolve({ role: "ADMIN" });
    return Promise.resolve({ id: "user-1" });
  });
  f.manual.mockResolvedValue(null);
  f.update.mockResolvedValue({});
  f.create.mockResolvedValue({});
  f.cancel.mockResolvedValue({ count: 1 });
  f.lock.mockResolvedValue([{ id: "admin-1" }, { id: "user-1" }]);
  f.transaction.mockImplementation(async (action: (tx: object) => Promise<unknown>, settings: unknown) => {
    expect(settings).toEqual({ isolationLevel: "Serializable" });
    return action({
      user: { findUnique: f.role },
      $queryRaw: f.lock,
      appSubscription: {
        findFirst: f.manual,
        update: f.update,
        create: f.create,
        updateMany: f.cancel,
      },
    });
  });
});

const args = { userId: "user-1", adminUserId: "admin-1" };

describe("manual subscription grants enforce CURRENT authority inside DB transactions", () => {
  it("new time-bound access creates one MANUAL subscription after row lock", async () => {
    const paidUntil = new Date("2032-01-01T00:00:00.000Z");
    await adminGrantPaidUntil({ ...args, paidUntil, reason: "gift" });
    expect(f.lock).toHaveBeenCalledOnce();
    expect(f.role).toHaveBeenCalledTimes(2);
    expect(f.manual).toHaveBeenCalledOnce();
    expect(f.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "user-1", provider: "MANUAL", isLifetime: false,
      currentPeriodEnd: paidUntil, manualGrantedById: "admin-1", manualReason: "gift",
    }) });
    expect(f.update).not.toHaveBeenCalled();
  });

  it("existing time-bound grant renews active MANUAL row, never creates duplicate", async () => {
    f.manual.mockResolvedValue({ id: "manual-1" });
    const paidUntil = new Date("2032-01-01T00:00:00.000Z");
    await adminGrantPaidUntil({ ...args, paidUntil });
    expect(f.update).toHaveBeenCalledWith({
      where: { id: "manual-1" },
      data: expect.objectContaining({ isLifetime: false, currentPeriodEnd: paidUntil }),
    });
    expect(f.create).not.toHaveBeenCalled();
  });

  it("new lifetime grant creates MANUAL lifetime row", async () => {
    await adminGrantLifetime({ ...args, reason: "compensation" });
    expect(f.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      provider: "MANUAL", isLifetime: true, currentPeriodEnd: null,
      manualGrantedById: "admin-1", manualReason: "compensation",
    }) });
  });

  it("existing lifetime grant only updates the locked active row", async () => {
    f.manual.mockResolvedValue({ id: "manual-2" });
    await adminGrantLifetime(args);
    expect(f.update).toHaveBeenCalledWith({
      where: { id: "manual-2" },
      data: expect.objectContaining({ isLifetime: true, currentPeriodEnd: null }),
    });
    expect(f.create).not.toHaveBeenCalled();
  });

  it("clears only active MANUAL grants and preserves external paid records", async () => {
    await adminClearManualGrant(args);
    expect(f.cancel).toHaveBeenCalledWith({
      where: { userId: "user-1", provider: "MANUAL",
        status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] } },
      data: expect.objectContaining({ status: "CANCELED", manualGrantedById: "admin-1" }),
    });
  });

  it.each(["paid", "lifetime", "clear"])("denies demoted admin for %s before any mutation", async kind => {
    f.role.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === "admin-1" ? { role: "USER" } : { id: "user-1" }));
    const op = kind === "paid" ? () => adminGrantPaidUntil({
      ...args, paidUntil: new Date("2032-01-01T00:00:00.000Z"),
    }) : kind === "lifetime" ? () => adminGrantLifetime(args) : () => adminClearManualGrant(args);
    await expect(op()).rejects.toThrow("FORBIDDEN");
    expect(f.lock).toHaveBeenCalledOnce();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
  });

  it("rejects nonexistent target after transaction lock", async () => {
    f.role.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === "admin-1" ? { role: "ADMIN" } : null));
    await expect(adminGrantLifetime(args)).rejects.toThrow("USER_NOT_FOUND");
    expect(f.create).not.toHaveBeenCalled();
  });

  it("rejects expired date before any transaction", async () => {
    await expect(adminGrantPaidUntil({ ...args, paidUntil: new Date("2000-01-01") }))
      .rejects.toThrow("paidUntil должен быть в будущем");
    expect(f.transaction).not.toHaveBeenCalled();
  });
});
