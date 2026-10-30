/** G1: real Core admin RBAC and idempotency orchestration with isolated fake Tx. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  actorRole: "ADMIN", transaction: vi.fn(), userLookup: vi.fn(),
  locking: vi.fn(), changeBalance: vi.fn(), walletAudit: vi.fn(),
  transactionUpdate: vi.fn(), queryRaw: vi.fn(),
  settingsUpsert: vi.fn(), settingsRevision: vi.fn(),
  existing: null as null | {
    id: string; userId: string; delta: number; adminActorId: string; balanceAfter: number;
  },
}));
vi.mock("@gafus/prisma", () => ({
  prisma: { $transaction: db.transaction },
}));
vi.mock("../gafus/locking", () => ({ lockGafusUser: db.locking }));
vi.mock("../gafus/walletService", () => ({ changeGafusBalanceTx: db.changeBalance }));
vi.mock("../gafus/settingsService", () => ({
  DEFAULT_GAFUS_SETTINGS: { economyEnabled: true, earningEnabled: true, spendingEnabled: true },
  getGafusSettingsTx: vi.fn(async () => ({ revision: 3 })),
}));

import {
  adjustGafusBalanceAdmin, getGafusAdminDashboard, updateGafusSettingsAdmin,
} from "./index";

const tx = {
  user: { findUnique: db.userLookup },
  $queryRaw: db.queryRaw,
  gafusSettings: { upsert: db.settingsUpsert },
  gafusSettingsRevision: { create: db.settingsRevision },
  gafusAdminAudit: { create: db.walletAudit },
  gafusWallet: {
    aggregate: vi.fn(async () => ({ _sum: { balance: 42 }, _count: { _all: 2 } })),
    findUnique: vi.fn(async () => ({ balance: 42 })),
  },
  gafusTransaction: {
    groupBy: vi.fn(async () => []),
    findUnique: vi.fn(async () => db.existing),
    update: db.transactionUpdate,
  },
  gafusFraudSignal: { count: vi.fn(async () => 0) },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.actorRole = "ADMIN";
  db.existing = null;
  db.userLookup.mockImplementation(async () => ({ role: db.actorRole }));
  db.transaction.mockImplementation(async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx));
  db.locking.mockResolvedValue(undefined);
  db.changeBalance.mockImplementation(async (
    _tx: unknown, input: { userId: string; amount: number },
  ) => {
    db.existing = {
      id: "g1-transaction", userId: input.userId,
      delta: input.amount, adminActorId: "admin-A", balanceAfter: 42 + input.amount,
    };
    return { transactionId: "g1-transaction", balance: 42 + input.amount, replay: false };
  });
});

const validAdjust = {
  actorId: "admin-A", userId: "user-B", delta: 10,
  requestId: "g1-request-001", reason: "Documented manual reconciliation",
};
const validSettings = {
  actorId: "admin-A", expectedRevision: 3, patch: { earningEnabled: false },
  reason: "Change after review",
};

describe("G1 admin permission and idempotency: actual Core + mocked Prisma Tx", () => {
  it.each(["USER", "PARTNER", "TRAINER", "MODERATOR"])("denies role %s for ALL three admin operations before mutation", async role => {
    db.actorRole = role;
    await expect(getGafusAdminDashboard("non-admin")).rejects.toThrow("FORBIDDEN");
    await expect(updateGafusSettingsAdmin(validSettings)).rejects.toThrow("FORBIDDEN");
    await expect(adjustGafusBalanceAdmin(validAdjust)).rejects.toThrow("FORBIDDEN");
    expect(db.userLookup).toHaveBeenCalledTimes(3);
    expect(db.locking).not.toHaveBeenCalled();
    expect(db.settingsUpsert).not.toHaveBeenCalled();
    expect(db.settingsRevision).not.toHaveBeenCalled();
    expect(db.changeBalance).not.toHaveBeenCalled();
    expect(db.walletAudit).not.toHaveBeenCalled();
  });

  it("ADMIN can read dashboard under Core authorization", async () => {
    const data = await getGafusAdminDashboard("admin-A");
    expect(data).toMatchObject({ wallets: { count: 2, outstanding: 42 }, fraudOpen: 0 });
    expect(db.userLookup).toHaveBeenCalledWith({
      where: { id: "admin-A" }, select: { role: true },
    });
  });

  it("stale revision prevents changing settings", async () => {
    await expect(updateGafusSettingsAdmin({ ...validSettings, expectedRevision: 2 }))
      .rejects.toThrow("SETTINGS_REVISION_CONFLICT");
    expect(db.queryRaw).toHaveBeenCalledOnce();
    expect(db.settingsUpsert).not.toHaveBeenCalled();
    expect(db.walletAudit).not.toHaveBeenCalled();
  });

  it("repeated wallet requestId returns replay without new debit/audit", async () => {
    const first = await adjustGafusBalanceAdmin(validAdjust);
    const repeated = await adjustGafusBalanceAdmin(validAdjust);
    expect(first).toEqual({ transactionId: "g1-transaction", balance: 52, replay: false });
    expect(repeated).toEqual({ transactionId: "g1-transaction", balance: 52, replay: true });
    expect(db.changeBalance).toHaveBeenCalledOnce();
    expect(db.walletAudit).toHaveBeenCalledOnce();
    expect(db.transactionUpdate).toHaveBeenCalledOnce();
  });

  it("same requestId with different amount is a conflict without extra side effects", async () => {
    await adjustGafusBalanceAdmin(validAdjust);
    await expect(adjustGafusBalanceAdmin({ ...validAdjust, delta: 20 }))
      .rejects.toThrow("REQUEST_CONFLICT");
    expect(db.changeBalance).toHaveBeenCalledOnce();
    expect(db.walletAudit).toHaveBeenCalledOnce();
  });
});
