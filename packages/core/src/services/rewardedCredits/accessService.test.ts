import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubscriptionOrCreditsRequiredError } from "./errors";

const state = vi.hoisted(() => ({
  hasPremium: false,
  unlocks: new Set<string>(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    rewardedCreditTransaction: {
      findFirst: vi.fn(({ where }) =>
        Promise.resolve(
          state.unlocks.has(`${where.userId}:${where.targetType}:${where.targetId}`)
            ? { id: "tx-unlock" }
            : null,
        ),
      ),
    },
  },
}));

vi.mock("../appFeatureFlags", () => ({
  APP_FEATURE_APP_SUBSCRIPTION_GATING: "app_subscription_gating_enabled",
  getAppFeatureFlagEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("../appSubscription", () => ({
  getAppSubscriptionAccess: vi.fn(() =>
    Promise.resolve({ hasActiveSubscription: state.hasPremium }),
  ),
}));

const spendRewardedCredits = vi.fn(({ userId, target }) => {
  state.unlocks.add(`${userId}:${target.targetType}:${target.targetId}`);
  return Promise.resolve({
    spentCredits: target.cost ?? 1,
    balance: 4,
    pendingRefundCredits: 0,
    skippedDueToPremium: false,
    replay: false,
  });
});

vi.mock("./walletService", () => ({
  spendRewardedCredits: (...args: unknown[]) => spendRewardedCredits(...args),
}));

import {
  buildRewardedSpendIdempotencyKey,
  getPremiumOrRewardedAccess,
  unlockRewardedTarget,
} from "./accessService";

describe("premium or rewarded access", () => {
  beforeEach(() => {
    state.hasPremium = false;
    state.unlocks.clear();
    vi.clearAllMocks();
  });

  it("allows active Premium without spending credits", async () => {
    state.hasPremium = true;

    await expect(
      getPremiumOrRewardedAccess({
        userId: "user-1",
        platform: "ANDROID",
        target: { targetType: "ARTICLE", targetId: "article-1", cost: 1 },
      }),
    ).resolves.toMatchObject({ allowed: true, source: "PREMIUM" });
    expect(spendRewardedCredits).not.toHaveBeenCalled();
  });

  it("allows an already rewarded-unlocked target without spending again", async () => {
    state.unlocks.add("user-1:ARTICLE:article-1");

    await expect(
      getPremiumOrRewardedAccess({
        userId: "user-1",
        platform: "ANDROID",
        target: { targetType: "ARTICLE", targetId: "article-1", cost: 1 },
      }),
    ).resolves.toMatchObject({ allowed: true, source: "REWARDED" });
    expect(spendRewardedCredits).not.toHaveBeenCalled();
  });

  it("throws subscription-or-credits required when locked and caller does not unlock", async () => {
    await expect(
      getPremiumOrRewardedAccess({
        userId: "user-1",
        platform: "ANDROID",
        target: { targetType: "ARTICLE", targetId: "article-1", cost: 1 },
      }),
    ).rejects.toBeInstanceOf(SubscriptionOrCreditsRequiredError);
  });

  it("spends once when explicitly unlocking a locked target", async () => {
    const result = await unlockRewardedTarget({
      userId: "user-1",
      platform: "ANDROID",
      target: { targetType: "ARTICLE", targetId: "article-1", cost: 1 },
    });

    expect(result).toMatchObject({
      targetType: "ARTICLE",
      targetId: "article-1",
      unlocked: true,
      spentCredits: 1,
    });
    expect(spendRewardedCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: buildRewardedSpendIdempotencyKey("user-1", {
          targetType: "ARTICLE",
          targetId: "article-1",
        }),
      }),
    );
  });
});
