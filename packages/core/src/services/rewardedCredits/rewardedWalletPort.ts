import type { RewardedTargetInput } from "./types";

/** Legacy rewarded-ad credit wallet SQL port; NOT the Gafus points wallet.
 * Persistence owns PostgreSQL advisory xact lock and the unique receipt key.
 * Core owns premium/disabled gates, Moscow reset, money arithmetic, replay,
 * balance cap and postponed refunds. All rows use the SAME locked transaction.
 */
declare const rewardedWalletTxBrand: unique symbol;
export type RewardedWalletTx = { readonly [rewardedWalletTxBrand]: true };

export type RewardedWalletSnapshot = {
  balance: number;
  pendingRefundCredits: number;
};
export type RewardedWalletEntry = {
  userId: string;
  type: "EARN" | "SPEND" | "REFUND" | "ADJUSTMENT";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  idempotencyKey: string;
  targetType?: RewardedTargetInput["targetType"];
  targetId?: string;
  provider?: "YANDEX";
  sessionId?: string;
  refundedTransactionId?: string;
  refundReason?: string;
  metadata?: Record<string, unknown>;
};

export interface RewardedWalletPort {
  withLockedRewardedWallet<T>(
    userId: string, fn: (tx: RewardedWalletTx) => Promise<T>,
  ): Promise<T>;
  ensureRewardedWalletRow(
    userId: string, tx?: RewardedWalletTx,
  ): Promise<RewardedWalletSnapshot>;
  updateRewardedWalletRow(
    tx: RewardedWalletTx, userId: string,
    data: { balance: number; pendingRefundCredits?: number },
  ): Promise<RewardedWalletSnapshot>;
  countTodayRewardedAds(
    tx: RewardedWalletTx, userId: string, start: Date, end: Date,
  ): Promise<number>;
  hasRewardedTargetSpendRow(
    tx: RewardedWalletTx, userId: string, target: RewardedTargetInput,
  ): Promise<boolean>;
  findRewardedTransactionByKey(
    tx: RewardedWalletTx, idempotencyKey: string,
  ): Promise<{ id: string } | null>;
  appendRewardedWalletEntry(
    tx: RewardedWalletTx, entry: RewardedWalletEntry,
  ): Promise<{ id: string }>;
}
