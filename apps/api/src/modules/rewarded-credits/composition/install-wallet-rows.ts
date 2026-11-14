/** SQL owner for legacy rewarded-ad credits (distinct from Gafus).
 * The existing PostgreSQL advisory xact lock, keyed reward receipts,
 * updates, and deferred refunds stay in gafus-server. The same transaction
 * is passed from withLockedRewardedWallet through all Core callbacks.
 */
import { registerRewardedWalletPort, type RewardedWalletPort } from "@gafus/core/services/rewardedCredits";
import type { RewardedWalletTx } from "@gafus/core/services/rewardedCredits";
import {
  withLockedRewardedWallet,
  ensureRewardedWalletRow,
  updateRewardedWalletRow,
  countTodayRewardedAds,
  hasRewardedTargetSpendRow,
  findRewardedTransactionByKey,
  appendRewardedWalletEntry,
  type RewardedWalletTx as SqlRewardedWalletTx,
} from "@gafus/gafus-server/rewarded-wallet-rows";

const sqlTx = (tx: RewardedWalletTx): SqlRewardedWalletTx =>
  tx as unknown as SqlRewardedWalletTx;
const rewardedWalletRows: RewardedWalletPort = {
  withLockedRewardedWallet: (userId, action) =>
    withLockedRewardedWallet(userId, tx => action(tx as unknown as RewardedWalletTx)),
  ensureRewardedWalletRow: (userId, tx) =>
    ensureRewardedWalletRow(userId, tx ? sqlTx(tx) : undefined),
  updateRewardedWalletRow: (tx, userId, data) =>
    updateRewardedWalletRow(sqlTx(tx), userId, data),
  countTodayRewardedAds: (tx, userId, start, end) =>
    countTodayRewardedAds(sqlTx(tx), userId, start, end),
  hasRewardedTargetSpendRow: (tx, userId, target) =>
    hasRewardedTargetSpendRow(sqlTx(tx), userId, target),
  findRewardedTransactionByKey: (tx, key) =>
    findRewardedTransactionByKey(sqlTx(tx), key),
  appendRewardedWalletEntry: (tx, entry) =>
    appendRewardedWalletEntry(sqlTx(tx), entry),
};
registerRewardedWalletPort(rewardedWalletRows);
