import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  REWARDED_MAX_CREDIT_BALANCE,
  RewardedBalanceFullError,
  RewardedCreditsRequiredError,
} from "./index";

const state = vi.hoisted(() => ({
  wallets: new Map<string, { userId: string; balance: number; pendingRefundCredits: number }>(),
  transactions: new Map<
    string,
    {
      id: string;
      userId: string;
      type: "EARN" | "SPEND" | "REFUND" | "ADJUSTMENT";
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
      targetType?: string | null;
      targetId?: string | null;
      idempotencyKey: string;
      createdAt: Date;
    }
  >(),
}));

function createMockClient() {
  return {
    rewardedCreditWallet: {
      upsert: vi.fn(({ where, create }) => {
        if (!state.wallets.has(where.userId)) {
          state.wallets.set(where.userId, {
            userId: create.userId,
            balance: create.balance ?? 0,
            pendingRefundCredits: create.pendingRefundCredits ?? 0,
          });
        }
        return Promise.resolve(state.wallets.get(where.userId));
      }),
      findUnique: vi.fn(({ where }) => Promise.resolve(state.wallets.get(where.userId) ?? null)),
      update: vi.fn(({ where, data }) => {
        const wallet = state.wallets.get(where.userId);
        if (!wallet) {
          throw new Error("missing wallet");
        }
        if (typeof data.balance === "number") {
          wallet.balance = data.balance;
        }
        if (typeof data.pendingRefundCredits === "number") {
          wallet.pendingRefundCredits = data.pendingRefundCredits;
        }
        return Promise.resolve(wallet);
      }),
    },
    rewardedCreditTransaction: {
      findUnique: vi.fn(({ where }) =>
        Promise.resolve(state.transactions.get(where.idempotencyKey) ?? null),
      ),
      findMany: vi.fn(({ where }) =>
        Promise.resolve(
          [...state.transactions.values()].filter(
            (tx) =>
              tx.userId === where.userId &&
              (!where.type || tx.type === where.type) &&
              (!where.createdAt?.gte || tx.createdAt >= where.createdAt.gte) &&
              (!where.createdAt?.lt || tx.createdAt < where.createdAt.lt),
          ),
        ),
      ),
      create: vi.fn(({ data }) => {
        const tx = { id: `tx-${state.transactions.size + 1}`, createdAt: new Date(), ...data };
        state.transactions.set(data.idempotencyKey, tx);
        return Promise.resolve(tx);
      }),
    },
    $executeRawUnsafe: vi.fn(() => Promise.resolve(1)),
    $transaction: vi.fn((cb) => cb(createMockClient())),
  };
}

vi.mock("@gafus/prisma", () => ({
  prisma: createMockClient(),
}));

vi.mock("./settingsService", () => ({
  resolveRewardedPlatformSettings: vi.fn().mockResolvedValue({
    platform: "ANDROID",
    platformEnabled: true,
    paywallCtaEnabled: true,
    placementId: "demo-rewarded-yandex",
    dailyAdLimit: 1,
    testMode: true,
  }),
}));

vi.mock("../appSubscription", () => ({
  getAppSubscriptionAccess: vi.fn().mockResolvedValue({ hasActiveSubscription: false }),
}));

import {
  getRewardedCreditsStatus,
  grantRewardedCreditsToWallet,
  refundRewardedCredits,
  spendRewardedCredits,
} from "./walletService";

describe("rewarded credits wallet", () => {
  beforeEach(() => {
    state.wallets.clear();
    state.transactions.clear();
    vi.clearAllMocks();
  });

  it("creates wallet lazily with zero balance", async () => {
    await expect(getRewardedCreditsStatus({ userId: "user-1", platform: "ANDROID" })).resolves
      .toMatchObject({
        wallet: { balance: 0, pendingRefundCredits: 0, maxBalance: REWARDED_MAX_CREDIT_BALANCE },
      });
  });

  it("caps grant at the missing balance", async () => {
    state.wallets.set("user-1", { userId: "user-1", balance: 3, pendingRefundCredits: 0 });

    const result = await grantRewardedCreditsToWallet({
      userId: "user-1",
      sessionId: "session-1",
      platform: "ANDROID",
      now: new Date("2026-05-31T10:00:00.000Z"),
    });

    expect(result.grantedCredits).toBe(2);
    expect(result.balance).toBe(5);
  });

  it("rejects grants when balance is already full", async () => {
    state.wallets.set("user-1", { userId: "user-1", balance: 5, pendingRefundCredits: 0 });

    await expect(
      grantRewardedCreditsToWallet({
        userId: "user-1",
        sessionId: "session-1",
        platform: "ANDROID",
        now: new Date("2026-05-31T10:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(RewardedBalanceFullError);
  });

  it("does not spend twice for the same idempotency key", async () => {
    state.wallets.set("user-1", { userId: "user-1", balance: 5, pendingRefundCredits: 0 });

    const input = {
      userId: "user-1",
      target: { targetType: "ARTICLE" as const, targetId: "article-1", cost: 1 },
      amount: 1,
      idempotencyKey: "rewarded:spend:user-1:ARTICLE:article-1",
    };

    const first = await spendRewardedCredits(input);
    const replay = await spendRewardedCredits(input);

    expect(first.spentCredits).toBe(1);
    expect(replay.spentCredits).toBe(0);
    expect(state.wallets.get("user-1")?.balance).toBe(4);
  });

  it("throws insufficient credits when spending more than the wallet balance", async () => {
    state.wallets.set("user-1", { userId: "user-1", balance: 0, pendingRefundCredits: 0 });

    await expect(
      spendRewardedCredits({
        userId: "user-1",
        target: { targetType: "ARTICLE", targetId: "article-1", cost: 1 },
        amount: 1,
        idempotencyKey: "spend-1",
      }),
    ).rejects.toBeInstanceOf(RewardedCreditsRequiredError);
  });

  it("preserves refund overflow in pending refund credits", async () => {
    state.wallets.set("user-1", { userId: "user-1", balance: 4, pendingRefundCredits: 0 });

    const result = await refundRewardedCredits({
      userId: "user-1",
      target: { targetType: "CONSULTATION_BOOKING", targetId: "user-1:book-1", cost: 5 },
      amount: 5,
      reason: "cancelled",
      idempotencyKey: "rewarded:refund:consultation:booking-1:CANCELLED_BY_USER",
    });

    expect(result.balance).toBe(5);
    expect(result.pendingRefundCredits).toBe(4);
  });

  it("applies pending refund credits after the next spend", async () => {
    state.wallets.set("user-1", { userId: "user-1", balance: 5, pendingRefundCredits: 4 });

    await spendRewardedCredits({
      userId: "user-1",
      target: { targetType: "ARTICLE", targetId: "article-1", cost: 1 },
      amount: 1,
      idempotencyKey: "spend-1",
    });

    expect(state.wallets.get("user-1")).toMatchObject({
      balance: 5,
      pendingRefundCredits: 3,
    });
  });
});
