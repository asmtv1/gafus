import { beforeEach, describe, expect, it, vi } from "vitest";
import { withGafusAdminRows } from "./admin-rows";

const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  user: vi.fn(),
  queryRaw: vi.fn(),
  settings: vi.fn(),
  revision: vi.fn(),
  audit: vi.fn(),
  transactionByKey: vi.fn(),
  transactionUpdate: vi.fn(),
  balance: vi.fn(),
  walletTotals: vi.fn(),
  ledgerTotals: vi.fn(),
  fraudCount: vi.fn(),
  fraudList: vi.fn(),
  fraudFind: vi.fn(),
  fraudUpdate: vi.fn(),
}));
const fakeTx = {
  user: { findUnique: db.user },
  $queryRaw: db.queryRaw,
  gafusSettings: { upsert: db.settings },
  gafusSettingsRevision: { create: db.revision },
  gafusAdminAudit: { create: db.audit },
  gafusWallet: { findUnique: db.balance, aggregate: db.walletTotals },
  gafusTransaction: {
    findUnique: db.transactionByKey,
    update: db.transactionUpdate,
    groupBy: db.ledgerTotals,
  },
  gafusFraudSignal: {
    count: db.fraudCount,
    findMany: db.fraudList,
    findUnique: db.fraudFind,
    updateMany: db.fraudUpdate,
  },
};
vi.mock("@gafus/prisma", () => ({ prisma: { $transaction: db.transaction } }));
beforeEach(() => {
  vi.resetAllMocks();
  db.transaction.mockImplementation(async (fn) => fn(fakeTx));
});
const snapshot = {
  revision: 2,
  economyEnabled: true,
  earningEnabled: true,
  spendingEnabled: true,
  postReward: 1,
  questionReward: 1,
  answerReward: 1,
  activityLimit: 3,
  activityWindowSeconds: 86400,
  reactionThreshold: 10,
  reactionReward: 1,
  bestAnswerReward: 1,
  courseStepCost: 1,
  miniGuideCost: 1,
  accessDurationSeconds: 604800,
};

describe("Gafus admin transaction adapter", () => {
  it("always exposes the SAME transaction for Core domain ledger actions", async () => {
    await withGafusAdminRows(
      async (rows) => {
        expect(rows.rawTx).toBe(fakeTx);
        await rows.actorRole("admin-1");
        await rows.lockSettings();
        await rows.upsertSettings(snapshot, "admin-1");
        await rows.appendSettingsRevision(2, "admin-1", snapshot);
        await rows.appendAudit({
          actorId: "admin-1",
          action: "SETTINGS_UPDATED",
          reason: "Reviewed details",
          before: { revision: 1 },
          after: snapshot,
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(db.user).toHaveBeenCalledWith({ where: { id: "admin-1" }, select: { role: true } });
    expect(db.queryRaw).toHaveBeenCalledOnce();
    expect(db.settings).toHaveBeenCalledWith({
      where: { key: "default" },
      create: { key: "default", ...snapshot, updatedById: "admin-1" },
      update: { ...snapshot, updatedById: "admin-1" },
    });
    expect(db.revision).toHaveBeenCalledWith({
      data: { revision: 2, actorId: "admin-1", snapshot },
    });
    expect(db.audit).toHaveBeenCalledWith({
      data: {
        actorId: "admin-1",
        action: "SETTINGS_UPDATED",
        reason: "Reviewed details",
        before: { revision: 1 },
        after: snapshot,
      },
    });
  });

  it("reads idempotent wallet ledger and only mutates precisely identified transaction", async () => {
    await withGafusAdminRows(async (rows) => {
      await rows.findTransactionByKey("gafus:admin:user-1:req-1");
      await rows.walletBalance("owner-1");
      await rows.annotateTransaction("tx-1", "admin-1", "Reviewed wallet adjustment");
      await rows.walletTotals();
      await rows.ledgerTotals();
    });
    expect(db.transactionByKey).toHaveBeenCalledWith({
      where: { idempotencyKey: "gafus:admin:user-1:req-1" },
    });
    expect(db.balance).toHaveBeenCalledWith({
      where: { userId: "owner-1" },
      select: { balance: true },
    });
    expect(db.transactionUpdate).toHaveBeenCalledWith({
      where: { id: "tx-1" },
      data: { adminActorId: "admin-1", reason: "Reviewed wallet adjustment" },
    });
  });

  it("limits fraud result page and reserves CAS review for OPEN signals", async () => {
    await withGafusAdminRows(async (rows) => {
      await rows.countOpenFraud();
      await rows.listFraudSignals("OPEN");
      await rows.findFraudSignal("signal-1");
      await rows.updateOpenFraudSignal("signal-1", "RESOLVED", "admin-1");
    });
    expect(db.fraudCount).toHaveBeenCalledWith({ where: { status: "OPEN" } });
    const list = db.fraudList.mock.calls[0]![0];
    expect(list.where).toEqual({ status: "OPEN" });
    expect(list.take).toBe(100);
    expect(list.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(list.select.metadata).toBe(true);
    expect(db.fraudFind).toHaveBeenCalledWith({ where: { id: "signal-1" } });
    expect(db.fraudUpdate).toHaveBeenCalledWith({
      where: { id: "signal-1", status: "OPEN" },
      data: { status: "RESOLVED", resolvedById: "admin-1", resolvedAt: expect.any(Date) },
    });
  });
});
