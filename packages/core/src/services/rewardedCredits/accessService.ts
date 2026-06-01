import { prisma } from "@gafus/prisma";

import { SubscriptionOrCreditsRequiredError } from "./errors";
import type {
  PremiumOrRewardedAccessDto,
  RewardedPlatform,
  RewardedTargetInput,
  RewardedUnlockResultDto,
} from "./types";
import { APP_FEATURE_APP_SUBSCRIPTION_GATING, getAppFeatureFlagEnabled } from "../appFeatureFlags";
import { getAppSubscriptionAccess } from "../appSubscription";
import { spendRewardedCredits } from "./walletService";

export function buildRewardedSpendIdempotencyKey(
  userId: string,
  target: Pick<RewardedTargetInput, "targetType" | "targetId">,
): string {
  return `rewarded:spend:${userId}:${target.targetType}:${target.targetId}`;
}

export async function hasRewardedTargetUnlock(input: {
  userId: string;
  target: RewardedTargetInput;
}): Promise<boolean> {
  const transaction = await prisma.rewardedCreditTransaction.findFirst({
    where: {
      userId: input.userId,
      type: "SPEND",
      targetType: input.target.targetType,
      targetId: input.target.targetId,
    },
    select: { id: true },
  });
  return Boolean(transaction);
}

export async function getPremiumOrRewardedAccess(input: {
  userId: string;
  platform: RewardedPlatform;
  target: RewardedTargetInput;
  now?: Date;
}): Promise<PremiumOrRewardedAccessDto> {
  const gatingEnabled = await getAppFeatureFlagEnabled(
    APP_FEATURE_APP_SUBSCRIPTION_GATING,
    true,
  );
  if (!gatingEnabled) {
    return {
      allowed: true,
      source: "GATING_DISABLED",
      skippedDueToPremium: false,
      target: input.target,
    };
  }

  const subscription = await getAppSubscriptionAccess(input.userId, input.now);
  if (subscription.hasActiveSubscription) {
    return {
      allowed: true,
      source: "PREMIUM",
      skippedDueToPremium: true,
      target: input.target,
    };
  }

  if (await hasRewardedTargetUnlock({ userId: input.userId, target: input.target })) {
    return {
      allowed: true,
      source: "REWARDED",
      skippedDueToPremium: false,
      target: input.target,
    };
  }

  throw new SubscriptionOrCreditsRequiredError();
}

export async function requirePremiumOrRewardedUnlock(input: {
  userId: string;
  platform: RewardedPlatform;
  target: RewardedTargetInput;
  now?: Date;
}): Promise<PremiumOrRewardedAccessDto> {
  return getPremiumOrRewardedAccess(input);
}

export async function unlockRewardedTarget(input: {
  userId: string;
  platform: RewardedPlatform;
  target: RewardedTargetInput;
  now?: Date;
}): Promise<RewardedUnlockResultDto> {
  try {
    const access = await getPremiumOrRewardedAccess(input);
    return {
      targetType: input.target.targetType,
      targetId: input.target.targetId,
      unlocked: true,
      spentCredits: 0,
      balance: 0,
      pendingRefundCredits: 0,
    };
  } catch (error) {
    if (!(error instanceof SubscriptionOrCreditsRequiredError)) {
      throw error;
    }
  }

  const cost = input.target.cost ?? 1;
  const spend = await spendRewardedCredits({
    userId: input.userId,
    target: input.target,
    amount: cost,
    idempotencyKey: buildRewardedSpendIdempotencyKey(input.userId, input.target),
    now: input.now,
  });

  return {
    targetType: input.target.targetType,
    targetId: input.target.targetId,
    unlocked: true,
    spentCredits: spend.spentCredits,
    balance: spend.balance,
    pendingRefundCredits: spend.pendingRefundCredits,
  };
}
