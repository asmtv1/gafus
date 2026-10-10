import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  admin: true,
  pending: 0,
  active: 0,
  oldWallet: { userId: "user-1", balance: 2, pendingRefundCredits: 0 },
  balance: 0,
  txs: new Map<string, { id: string; userId: string; kind: string; delta: number; balanceAfter: number }>(),
  audits: [] as object[],
}));
vi.mock("@gafus/prisma", () => {
  const db = {
    user: { findUnique: vi.fn(async () => ({ role: state.admin ? "ADMIN" : "USER" })) },
    rewardedCreditWallet: {
      aggregate: vi.fn(async ({ where }: { where: { pendingRefundCredits?: unknown } }) =>
        where.pendingRefundCredits
          ? { _count: { _all: state.pending ? 1 : 0 }, _sum: { pendingRefundCredits: state.pending } }
          : { _count: { _all: 1 }, _sum: { balance: state.oldWallet.balance } }),
      findMany: vi.fn(async () => [state.oldWallet]),
      findUnique: vi.fn(async () => state.oldWallet),
    },
    rewardedAdSession: { count: vi.fn(async () => state.active) },
    gafusTransaction: {
      count: vi.fn(async () => state.txs.size),
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        state.txs.get(where.idempotencyKey) ?? null),
    },
    gafusAdminAudit: { create: vi.fn(async ({ data }: { data: object }) => {
      state.audits.push(data);
    }) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { prisma: db };
});
vi.mock("./locking", () => ({ lockGafusUser: vi.fn(async () => {}) }));
vi.mock("./walletService", () => ({
  changeGafusBalanceTx: vi.fn(async (_tx: unknown, input: {
    userId: string; amount: number; idempotencyKey: string; kind: string;
  }) => {
    const id = `tx-${state.txs.size + 1}`;
    state.balance += input.amount;
    state.txs.set(input.idempotencyKey, { id, userId: input.userId,
      kind: input.kind, delta: input.amount, balanceAfter: state.balance });
    return { transactionId: id, balance: state.balance, replay: false };
  }),
}));

import { getLegacyGafusImportPreflight, importLegacyRewardedBatch } from "./legacyImportService";

describe("one-time legacy rewarded-credit import", () => {
  const oldDisabled = process.env.GAFUS_LEGACY_REWARDED_DISABLED;
  const oldEnabled = process.env.GAFUS_LEGACY_IMPORT_ENABLED;
  beforeEach(() => {
    state.admin = true; state.pending = 0; state.active = 0;
    state.oldWallet = { userId: "user-1", balance: 2, pendingRefundCredits: 0 };
    state.balance = 0; state.txs.clear(); state.audits.length = 0;
    process.env.GAFUS_LEGACY_REWARDED_DISABLED = "true";
    process.env.GAFUS_LEGACY_IMPORT_ENABLED = "true";
  });
  afterEach(() => {
    if (oldDisabled === undefined) delete process.env.GAFUS_LEGACY_REWARDED_DISABLED;
    else process.env.GAFUS_LEGACY_REWARDED_DISABLED = oldDisabled;
    if (oldEnabled === undefined) delete process.env.GAFUS_LEGACY_IMPORT_ENABLED;
    else process.env.GAFUS_LEGACY_IMPORT_ENABLED = oldEnabled;
  });

  it("reports a preflight without any mutation", async () => {
    expect(await getLegacyGafusImportPreflight("admin-1")).toMatchObject({
      activeWallets: 1, credits: 2,
      pendingRefundCredits: 0, unsettledSessions: 0,
    });
    expect(state.txs.size).toBe(0);
  });

  it("imports once and preserves the old wallet row", async () => {
    const args = { actorId: "admin-1", confirmed: true };
    expect(await importLegacyRewardedBatch(args)).toMatchObject({ imported: 1, credits: 2 });
    expect(await importLegacyRewardedBatch(args)).toMatchObject({ imported: 0, replays: 1 });
    expect(state.balance).toBe(2);
    expect(state.oldWallet.balance).toBe(2);
    expect(state.txs.size).toBe(1);
    expect(state.audits).toHaveLength(1);
  });

  it("blocks cutover before ads disabled and while refunds or sessions remain", async () => {
    process.env.GAFUS_LEGACY_REWARDED_DISABLED = "false";
    await expect(importLegacyRewardedBatch({ actorId: "admin-1", confirmed: true }))
      .rejects.toThrow("LEGACY_IMPORT_DISABLED");
    process.env.GAFUS_LEGACY_REWARDED_DISABLED = "true";
    state.active = 1;
    await expect(importLegacyRewardedBatch({ actorId: "admin-1", confirmed: true }))
      .rejects.toThrow("LEGACY_IMPORT_UNSETTLED_STATE");
    state.active = 0;
    state.pending = 1;
    await expect(importLegacyRewardedBatch({ actorId: "admin-1", confirmed: true }))
      .rejects.toThrow("LEGACY_IMPORT_UNSETTLED_STATE");
    expect(state.txs.size).toBe(0);
  });

  it("requires admin and an explicit confirmation", async () => {
    state.admin = false;
    await expect(importLegacyRewardedBatch({ actorId: "user-1", confirmed: true }))
      .rejects.toThrow("FORBIDDEN");
    state.admin = true;
    await expect(importLegacyRewardedBatch({ actorId: "admin-1", confirmed: false }))
      .rejects.toThrow("LEGACY_IMPORT_CONFIRMATION_REQUIRED");
  });
});
