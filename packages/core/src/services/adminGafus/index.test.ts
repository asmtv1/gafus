import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "ADMIN",
  status: "OPEN",
  balance: 2,
  debits: [] as { amount: number; kind: string; key: string }[],
  audits: [] as object[],
  edits: [] as object[],
}));
vi.mock("@gafus/prisma", () => {
  const tx = {
    user: { findUnique: vi.fn(async () => ({ role: mocks.role })) },
    gafusFraudSignal: {
      findUnique: vi.fn(async () => ({
        id: "signal-1", userId: "owner-1", status: mocks.status,
        kind: "REACTION_BURST", severity: "MEDIUM",
      })),
      updateMany: vi.fn(async ({ where, data }: {
        where: { status: string }; data: { status: string };
      }) => {
        if (where.status !== mocks.status) return { count: 0 };
        mocks.status = data.status;
        return { count: 1 };
      }),
    },
    gafusWallet: { findUnique: vi.fn(async () => ({ balance: mocks.balance })) },
    gafusTransaction: { update: vi.fn(async ({ data }: { data: object }) => {
      mocks.edits.push(data);
    }) },
    gafusAdminAudit: { create: vi.fn(async ({ data }: { data: object }) => {
      mocks.audits.push(data);
    }) },
  };
  return { prisma: { $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } };
});
vi.mock("../gafus/locking", () => ({ lockGafusUser: vi.fn(async () => {}) }));
vi.mock("../gafus/walletService", () => ({
  changeGafusBalanceTx: vi.fn(async (_tx: unknown, input: {
    amount: number; kind: string; idempotencyKey: string;
  }) => {
    mocks.debits.push({ amount: input.amount, kind: input.kind, key: input.idempotencyKey });
    mocks.balance += input.amount;
    return { transactionId: "tx-1", balance: mocks.balance, replay: false };
  }),
}));
vi.mock("../gafus/settingsService", () => ({
  DEFAULT_GAFUS_SETTINGS: {}, getGafusSettingsTx: vi.fn(),
}));

import { reviewGafusFraudSignalAdmin } from "./index";

describe("Gafus fraud manual review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "ADMIN";
    mocks.status = "OPEN";
    mocks.balance = 2;
    mocks.debits.length = 0;
    mocks.audits.length = 0;
    mocks.edits.length = 0;
  });

  it("rejects unauthenticated policy role and missing review reason", async () => {
    mocks.role = "USER";
    await expect(reviewGafusFraudSignalAdmin({
      actorId: "visitor", signalId: "signal-1",
      action: "DISMISS", reason: "Checked by staff",
    })).rejects.toThrow("FORBIDDEN");
    mocks.role = "ADMIN";
    await expect(reviewGafusFraudSignalAdmin({
      actorId: "admin", signalId: "signal-1",
      action: "DISMISS", reason: "no",
    })).rejects.toThrow("REASON_REQUIRED");
  });

  it("dismisses a soft signal without touching balances", async () => {
    const result = await reviewGafusFraudSignalAdmin({
      actorId: "admin", signalId: "signal-1",
      action: "DISMISS", reason: "Reactions from genuine accounts",
    });
    expect(result).toMatchObject({ status: "DISMISSED", recovered: 0 });
    expect(mocks.debits).toHaveLength(0);
    expect(mocks.audits).toHaveLength(1);
    await expect(reviewGafusFraudSignalAdmin({
      actorId: "admin", signalId: "signal-1",
      action: "DISMISS", reason: "Second attempt is invalid",
    })).rejects.toThrow("FRAUD_SIGNAL_ALREADY_REVIEWED");
  });

  it("recovers at most the available balance, ledgered and audited exactly once", async () => {
    const result = await reviewGafusFraudSignalAdmin({
      actorId: "admin", signalId: "signal-1", action: "CONFIRM",
      requestedReversal: 5, reason: "Confirmed coordinated artificial reactions",
    });
    expect(result).toMatchObject({
      status: "RESOLVED", requested: 5, recovered: 2, unrecovered: 3,
    });
    expect(mocks.balance).toBe(0);
    expect(mocks.debits).toEqual([{
      amount: -2, kind: "ADMIN_DEBIT", key: "gafus:fraud:signal-1",
    }]);
    expect(mocks.edits).toHaveLength(1);
    expect(mocks.audits).toHaveLength(1);
  });
});
