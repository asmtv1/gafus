/**
 * SQL boundary for ad-earned credit wallet. This is separate from Gafus points.
 * Core keeps platform/target gates, Moscow daily windows, payout arithmetic,
 * idempotency decisions, reason codes and the maximum-credit policy.
 */
import { prisma, type Prisma } from "@gafus/prisma";

export type RewardedWalletTx = Prisma.TransactionClient;
export type RewardedWalletEntry = Omit<
  Prisma.RewardedCreditTransactionUncheckedCreateInput,
  "metadata"
> & { metadata?: Record<string, unknown> };

export function withLockedRewardedWallet<T>(
  userId: string,
  fn: (tx: RewardedWalletTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe?.(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      `rewarded:${userId}`,
    );
    return fn(tx);
  });
}
export function ensureRewardedWalletRow(userId: string, tx?: RewardedWalletTx) {
  const client = tx ?? prisma;
  return client.rewardedCreditWallet.upsert({
    where: { userId },
    create: { userId, balance: 0, pendingRefundCredits: 0 },
    update: {},
  });
}
export function updateRewardedWalletRow(
  tx: RewardedWalletTx,
  userId: string,
  data: { balance: number; pendingRefundCredits?: number },
) {
  return tx.rewardedCreditWallet.update({
    where: { userId },
    data,
  });
}
export function countTodayRewardedAds(
  tx: RewardedWalletTx,
  userId: string,
  start: Date,
  end: Date,
) {
  return tx.rewardedAdSession.count({
    where: { userId, rewardedAt: { gte: start, lt: end } },
  });
}
export async function hasRewardedTargetSpendRow(
  tx: RewardedWalletTx,
  userId: string,
  target: {
    targetType: Prisma.RewardedCreditTransactionUncheckedCreateInput["targetType"];
    targetId: string;
  },
): Promise<boolean> {
  const row = await tx.rewardedCreditTransaction.findFirst({
    where: {
      userId,
      type: "SPEND",
      targetType: target.targetType,
      targetId: target.targetId,
    },
    select: { id: true },
  });
  return Boolean(row);
}
export function findRewardedTransactionByKey(tx: RewardedWalletTx, idempotencyKey: string) {
  return tx.rewardedCreditTransaction.findUnique({ where: { idempotencyKey } });
}
export function appendRewardedWalletEntry(tx: RewardedWalletTx, entry: RewardedWalletEntry) {
  return tx.rewardedCreditTransaction.create({
    data: {
      ...entry,
      metadata: entry.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
