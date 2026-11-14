import { requireRewardedWalletPort, type RewardedWalletTx } from "./rewardedWalletPort";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

import {
  REWARDED_CREDITS_PER_REWARD,
  REWARDED_DAILY_LIMIT_TIMEZONE,
  REWARDED_MAX_CREDIT_BALANCE,
} from "./constants";
import {
  RewardedBalanceFullError,
  RewardedCreditsRequiredError,
  RewardedAdsDisabledError,
} from "./errors";
import { resolveRewardedPlatformSettings } from "./settingsService";
import type { ClientAppContext } from "../appFeatureFlags";
import type {
  RewardedCreditsStatusDto,
  RewardedGrantResultDto,
  RewardedPlatform,
  RewardedRefundResultDto,
  RewardedSpendResultDto,
  RewardedTargetInput,
} from "./types";
import { getAppSubscriptionAccess } from "../appSubscription";

function nextMskReset(now: Date): { start: Date; end: Date } {
  const msk = toZonedTime(now, REWARDED_DAILY_LIMIT_TIMEZONE);
  const startMsk = new Date(msk);
  startMsk.setHours(0, 0, 0, 0);
  const endMsk = new Date(startMsk);
  endMsk.setDate(endMsk.getDate() + 1);
  return {
    start: fromZonedTime(startMsk, REWARDED_DAILY_LIMIT_TIMEZONE),
    end: fromZonedTime(endMsk, REWARDED_DAILY_LIMIT_TIMEZONE),
  };
}

function ensureWallet(client: RewardedWalletTx, userId: string) {
  return requireRewardedWalletPort().ensureRewardedWalletRow(userId, client);
}

export async function getRewardedCreditBalance(userId: string): Promise<number> {
  return requireRewardedWalletPort().withLockedRewardedWallet(userId, async (tx) => {
    const wallet = await applyPendingRefundCredits(tx, userId);
    return wallet.balance;
  });
}

async function applyPendingRefundCredits(client: RewardedWalletTx, userId: string) {
  const wallet = await ensureWallet(client, userId);
  const missing = Math.max(0, REWARDED_MAX_CREDIT_BALANCE - wallet.balance);
  const applied = Math.min(missing, wallet.pendingRefundCredits);
  if (applied <= 0) {
    return wallet;
  }
  return requireRewardedWalletPort().updateRewardedWalletRow(client, userId, {
    balance: wallet.balance + applied,
    pendingRefundCredits: wallet.pendingRefundCredits - applied,
  });
}

async function getAdsWatchedToday(
  client: RewardedWalletTx,
  userId: string,
  now: Date,
): Promise<number> {
  const { start, end } = nextMskReset(now);
  return requireRewardedWalletPort().countTodayRewardedAds(client, userId, start, end);
}

async function hasTargetUnlock(
  client: RewardedWalletTx,
  userId: string,
  target: RewardedTargetInput,
): Promise<boolean> {
  const transaction = await requireRewardedWalletPort().hasRewardedTargetSpendRow(client, userId, target);
  return Boolean(transaction);
}

export async function getRewardedCreditsStatus(input: {
  userId: string;
  platform: RewardedPlatform;
  target?: RewardedTargetInput;
  clientContext?: ClientAppContext;
  now?: Date;
}): Promise<RewardedCreditsStatusDto> {
  const now = input.now ?? new Date();
  return requireRewardedWalletPort().withLockedRewardedWallet(input.userId, async (tx) => {
    const wallet = await applyPendingRefundCredits(tx, input.userId);
    const platformSettings = await resolveRewardedPlatformSettings(
      input.platform,
      input.clientContext,
    );
    const adsWatchedToday = await getAdsWatchedToday(tx, input.userId, now);
    const nextGrantCredits = Math.min(
      REWARDED_CREDITS_PER_REWARD,
      Math.max(0, REWARDED_MAX_CREDIT_BALANCE - wallet.balance),
    );

    let canWatchAdReason: RewardedCreditsStatusDto["canWatchAdReason"] = "OK";
    if (!platformSettings.platformEnabled) {
      canWatchAdReason = "PLATFORM_DISABLED";
    } else if (adsWatchedToday >= platformSettings.dailyAdLimit) {
      canWatchAdReason = "DAILY_LIMIT_REACHED";
    } else if (wallet.balance >= REWARDED_MAX_CREDIT_BALANCE) {
      canWatchAdReason = "BALANCE_FULL";
    }

    const targetUnlocked = input.target
      ? await hasTargetUnlock(tx, input.userId, input.target)
      : false;
    const targetCost = input.target?.cost ?? 1;
    const target = input.target
      ? {
          targetType: input.target.targetType,
          targetId: input.target.targetId,
          cost: targetCost,
          unlocked: targetUnlocked,
          canUnlockWithCurrentBalance: targetUnlocked || wallet.balance >= targetCost,
          missingCredits: targetUnlocked ? 0 : Math.max(0, targetCost - wallet.balance),
        }
      : undefined;

    return {
      wallet: {
        balance: wallet.balance,
        pendingRefundCredits: wallet.pendingRefundCredits,
        maxBalance: REWARDED_MAX_CREDIT_BALANCE,
        creditsPerReward: REWARDED_CREDITS_PER_REWARD,
      },
      today: {
        adsWatchedToday,
        dailyAdLimit: platformSettings.dailyAdLimit,
        limitResetAt: nextMskReset(now).end.toISOString(),
      },
      settings: {
        platformEnabled: platformSettings.platformEnabled,
        testMode: platformSettings.testMode,
      },
      canWatchAd: canWatchAdReason === "OK",
      canWatchAdReason,
      nextGrantCredits,
      target,
    };
  });
}

export async function grantRewardedCreditsToWallet(input: {
  userId: string;
  sessionId: string;
  platform: RewardedPlatform;
  now?: Date;
}): Promise<RewardedGrantResultDto> {
  const now = input.now ?? new Date();
  return requireRewardedWalletPort().withLockedRewardedWallet(input.userId, async (tx) => {
    const existing = await requireRewardedWalletPort().findRewardedTransactionByKey(tx, `rewarded:earn:${input.sessionId}`);
    if (existing) {
      const wallet = await applyPendingRefundCredits(tx, input.userId);
      const platformSettings = await resolveRewardedPlatformSettings(input.platform);
      return {
        transactionId: existing.id,
        grantedCredits: 0,
        balance: wallet.balance,
        pendingRefundCredits: wallet.pendingRefundCredits,
        maxBalance: REWARDED_MAX_CREDIT_BALANCE,
        adsWatchedToday: await getAdsWatchedToday(tx, input.userId, now),
        dailyAdLimit: platformSettings.dailyAdLimit,
        canWatchAd: wallet.balance < REWARDED_MAX_CREDIT_BALANCE,
        replay: true,
      };
    }

    const wallet = await applyPendingRefundCredits(tx, input.userId);
    if (wallet.balance >= REWARDED_MAX_CREDIT_BALANCE) {
      throw new RewardedBalanceFullError();
    }

    const grantedCredits = Math.min(
      REWARDED_CREDITS_PER_REWARD,
      REWARDED_MAX_CREDIT_BALANCE - wallet.balance,
    );
    const updated = await requireRewardedWalletPort().updateRewardedWalletRow(tx, input.userId, {
      balance: wallet.balance + grantedCredits,
    });
    const transaction = await requireRewardedWalletPort().appendRewardedWalletEntry(tx, {
      userId: input.userId,
      type: "EARN",
      amount: grantedCredits,
      balanceBefore: wallet.balance,
      balanceAfter: updated.balance,
      provider: "YANDEX",
      sessionId: input.sessionId,
      idempotencyKey: `rewarded:earn:${input.sessionId}`,
    });
    const platformSettings = await resolveRewardedPlatformSettings(input.platform);

    return {
      transactionId: transaction.id,
      grantedCredits,
      balance: updated.balance,
      pendingRefundCredits: updated.pendingRefundCredits,
      maxBalance: REWARDED_MAX_CREDIT_BALANCE,
      adsWatchedToday: await getAdsWatchedToday(tx, input.userId, now),
      dailyAdLimit: platformSettings.dailyAdLimit,
      canWatchAd: updated.balance < REWARDED_MAX_CREDIT_BALANCE,
      replay: false,
    };
  });
}

export async function spendRewardedCredits(input: {
  userId: string;
  target: RewardedTargetInput;
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  now?: Date;
}): Promise<RewardedSpendResultDto> {
  // Legacy wallet remains an audit artifact; forbid double-spending after cutover.
  if (process.env.GAFUS_LEGACY_REWARDED_DISABLED === "true") throw new RewardedAdsDisabledError();
  const subscription = await getAppSubscriptionAccess(input.userId, input.now);
  if (subscription.hasActiveSubscription) {
    const wallet = await requireRewardedWalletPort().ensureRewardedWalletRow(input.userId);
    return {
      transactionId: null,
      spentCredits: 0,
      balance: wallet.balance,
      pendingRefundCredits: wallet.pendingRefundCredits,
      skippedDueToPremium: true,
      replay: false,
    };
  }

  return requireRewardedWalletPort().withLockedRewardedWallet(input.userId, async (tx) => {
    const existing = await requireRewardedWalletPort().findRewardedTransactionByKey(tx, input.idempotencyKey);
    if (existing) {
      const wallet = await applyPendingRefundCredits(tx, input.userId);
      return {
        transactionId: existing.id,
        spentCredits: 0,
        balance: wallet.balance,
        pendingRefundCredits: wallet.pendingRefundCredits,
        skippedDueToPremium: false,
        replay: true,
      };
    }

    const wallet = await applyPendingRefundCredits(tx, input.userId);
    if (wallet.balance < input.amount) {
      throw new RewardedCreditsRequiredError();
    }
    const afterSpend = await requireRewardedWalletPort().updateRewardedWalletRow(tx, input.userId, {
      balance: wallet.balance - input.amount,
    });
    const transaction = await requireRewardedWalletPort().appendRewardedWalletEntry(tx, {
      userId: input.userId,
      type: "SPEND",
      amount: input.amount,
      balanceBefore: wallet.balance,
      balanceAfter: afterSpend.balance,
      targetType: input.target.targetType,
      targetId: input.target.targetId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });
    const finalWallet = await applyPendingRefundCredits(tx, input.userId);

    return {
      transactionId: transaction.id,
      spentCredits: input.amount,
      balance: finalWallet.balance,
      pendingRefundCredits: finalWallet.pendingRefundCredits,
      skippedDueToPremium: false,
      replay: false,
    };
  });
}

export async function refundRewardedCredits(input: {
  userId: string;
  originalSpendId?: string;
  target: RewardedTargetInput;
  amount: number;
  reason: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  now?: Date;
}): Promise<RewardedRefundResultDto> {
  return requireRewardedWalletPort().withLockedRewardedWallet(input.userId, async (tx) => {
    const existing = await requireRewardedWalletPort().findRewardedTransactionByKey(tx, input.idempotencyKey);
    if (existing) {
      const wallet = await applyPendingRefundCredits(tx, input.userId);
      return {
        transactionId: existing.id,
        refundedCredits: 0,
        balance: wallet.balance,
        pendingRefundCredits: wallet.pendingRefundCredits,
        replay: true,
      };
    }

    const wallet = await ensureWallet(tx, input.userId);
    const availableSpace = Math.max(0, REWARDED_MAX_CREDIT_BALANCE - wallet.balance);
    const toBalance = Math.min(availableSpace, input.amount);
    const overflow = input.amount - toBalance;
    const updated = await requireRewardedWalletPort().updateRewardedWalletRow(tx, input.userId, {
      balance: wallet.balance + toBalance,
      pendingRefundCredits: wallet.pendingRefundCredits + overflow,
    });
    const transaction = await requireRewardedWalletPort().appendRewardedWalletEntry(tx, {
      userId: input.userId,
      type: "REFUND",
      amount: input.amount,
      balanceBefore: wallet.balance,
      balanceAfter: updated.balance,
      targetType: input.target.targetType,
      targetId: input.target.targetId,
      idempotencyKey: input.idempotencyKey,
      refundedTransactionId: input.originalSpendId,
      refundReason: input.reason,
      metadata: input.metadata,
    });

    return {
      transactionId: transaction.id,
      refundedCredits: input.amount,
      balance: updated.balance,
      pendingRefundCredits: updated.pendingRefundCredits,
      replay: false,
    };
  });
}
