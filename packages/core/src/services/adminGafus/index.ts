import { withGafusAdminRows, type GafusAdminRows, type GafusAdminRowsPort } from "./adminRowsPort";
export type { GafusAdminRowsPort } from "./adminRowsPort";
import { getGafusSettingsTx, DEFAULT_GAFUS_SETTINGS } from "../gafus/settingsService";
import type { GafusLockPort } from "../gafus/locking";
import type { GafusWalletService } from "../gafus/walletService";
import { GafusError } from "../gafus/errors";
import type { GafusSettingsConfig } from "../gafus/types";

/** Per-application transaction dependency. Historic single-argument exports are
 * retained for clients using the legacy boot shim; the production HTTP routes
 * ALWAYS supply an explicit port. No global registry is read in that path. */
function withAdminRows<T>(port: GafusAdminRowsPort | undefined,
  operation: (rows: GafusAdminRows) => Promise<T>,
  options?: { maxWait: number; timeout: number },
): Promise<T> {
  return withGafusAdminRows(operation, options, port);
}

type MutableSetting = Exclude<keyof GafusSettingsConfig, "revision">;
const keys: readonly MutableSetting[] = [
  "economyEnabled",
  "earningEnabled",
  "spendingEnabled",
  "postReward",
  "questionReward",
  "answerReward",
  "activityLimit",
  "activityWindowSeconds",
  "reactionThreshold",
  "reactionReward",
  "bestAnswerReward",
  "courseStepCost",
  "miniGuideCost",
  "accessDurationSeconds",
] as const;

async function requireAdminTx(tx: GafusAdminRows, actorId: string) {
  const actor = await tx.actorRole(actorId);
  if (actor?.role !== "ADMIN") throw new Error("FORBIDDEN");
}

function validateSettings(settings: GafusSettingsConfig) {
  for (const key of keys) {
    const value = settings[key];
    if (typeof DEFAULT_GAFUS_SETTINGS[key] === "boolean") {
      if (typeof value !== "boolean") throw new Error(`INVALID_SETTING:${key}`);
    } else if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`INVALID_SETTING:${key}`);
    }
  }
  if (
    settings.reactionThreshold < 1 ||
    settings.courseStepCost < 1 ||
    settings.miniGuideCost < 1 ||
    settings.activityWindowSeconds < 1 ||
    settings.accessDurationSeconds < 1
  ) {
    throw new Error("INVALID_SETTING:positive_values");
  }
  if (
    settings.activityLimit > 100 ||
    settings.accessDurationSeconds > 90 * 86400 ||
    settings.reactionThreshold > 1_000_000
  ) {
    throw new Error("INVALID_SETTING:outside_limits");
  }
}

/** Admin-only settings: revision, audit and snapshot commit together. */
export async function updateGafusSettingsAdmin(input: {
  actorId: string;
  expectedRevision: number;
  patch: Partial<Omit<GafusSettingsConfig, "revision">>;
  reason: string;
}, rowsPort?: GafusAdminRowsPort) {
  if (input.reason.trim().length < 5) throw new Error("REASON_REQUIRED");
  const unsupported = Object.keys(input.patch).filter(
    (key) => !keys.includes(key as MutableSetting),
  );
  if (unsupported.length) throw new Error("INVALID_SETTINGS_KEYS");
  return withAdminRows(rowsPort,
    async (tx) => {
      await requireAdminTx(tx, input.actorId);
      await tx.lockSettings();
      const previous = await getGafusSettingsTx(tx.rawTx);
      if (previous.revision !== input.expectedRevision)
        throw new Error("SETTINGS_REVISION_CONFLICT");
      const next = { ...previous, ...input.patch, revision: previous.revision + 1 };
      validateSettings(next);

      await tx.upsertSettings(next, input.actorId);
      await tx.appendSettingsRevision(next.revision, input.actorId, next);
      await tx.appendAudit({
        actorId: input.actorId,
        action: "SETTINGS_UPDATED",
        reason: input.reason.trim(),
        before: previous,
        after: next,
      });
      return next;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

/** Positive and negative manual wallet changes are ledgered and never produce debt. */
export async function adjustGafusBalanceAdmin(input: {
  actorId: string;
  userId: string;
  delta: number;
  requestId: string;
  reason: string;
}, wallet: Pick<GafusWalletService, "changeGafusBalanceTx">, lock: Pick<GafusLockPort, "lockGafusUser">, rowsPort?: GafusAdminRowsPort) {
  if (!input.reason.trim() || input.reason.trim().length < 5) throw new Error("REASON_REQUIRED");
  if (!Number.isSafeInteger(input.delta) || Math.abs(input.delta) > 10000 || input.delta === 0) {
    throw new GafusError("GAFUS_INVALID_AMOUNT", "Invalid admin balance adjustment");
  }
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(input.requestId)) throw new Error("INVALID_REQUEST_ID");
  return withAdminRows(rowsPort,
    async (tx) => {
      await requireAdminTx(tx, input.actorId);
      await lock.lockGafusUser(tx.rawTx, input.userId);
      const key = `gafus:admin:${input.actorId}:${input.requestId}`;
      const existing = await tx.findTransactionByKey(key);
      if (existing) {
        // A retry is the same business operation only when its audit reason matches.
        // Never silently accept a reused requestId with different audit evidence.
        if (
          existing.userId !== input.userId ||
          existing.delta !== input.delta ||
          existing.adminActorId !== input.actorId ||
          existing.reason !== input.reason.trim()
        )
          throw new Error("REQUEST_CONFLICT");
        return { transactionId: existing.id, balance: existing.balanceAfter, replay: true };
      }
      const walletRow = await tx.walletBalance(input.userId);
      const before = walletRow?.balance ?? 0;
      if (input.delta < 0 && before < -input.delta)
        throw new GafusError("GAFUS_INSUFFICIENT_BALANCE", "Insufficient funds");
      const transaction = await wallet.changeGafusBalanceTx(tx.rawTx, {
        userId: input.userId,
        amount: input.delta,
        kind: input.delta > 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT",
        idempotencyKey: key,
      });
      await tx.annotateTransaction(transaction.transactionId, input.actorId, input.reason.trim());
      await tx.appendAudit({
        actorId: input.actorId,
        targetUserId: input.userId,
        action: "WALLET_ADJUSTMENT",
        reason: input.reason.trim(),
        transactionId: transaction.transactionId,
        before: { balance: before },
        after: { balance: transaction.balance, delta: input.delta },
      });
      return transaction;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

export async function getGafusAdminDashboard(actorId: string, rowsPort?: GafusAdminRowsPort) {
  return withAdminRows(rowsPort,async (tx) => {
    await requireAdminTx(tx, actorId);
    const [settings, balances, transactions, fraudOpen] = await Promise.all([
      getGafusSettingsTx(tx.rawTx),
      tx.walletTotals(),
      tx.ledgerTotals(),
      tx.countOpenFraud(),
    ]);
    return {
      settings,
      wallets: { count: balances._count._all, outstanding: balances._sum.balance ?? 0 },
      transactions,
      fraudOpen,
    };
  });
}
export async function listGafusFraudSignalsAdmin(input: {
  actorId: string;
  status?: "OPEN" | "RESOLVED" | "DISMISSED";
}, rowsPort?: GafusAdminRowsPort) {
  return withAdminRows(rowsPort,async (tx) => {
    await requireAdminTx(tx, input.actorId);
    return tx.listFraudSignals(input.status);
  });
}

/**
 * Soft signal review. Confirmed fraud recovers at most the balance on hand:
 * no negative balances, no speculative debt, and no duplicate adjustments.
 */
export async function reviewGafusFraudSignalAdmin(input: {
  actorId: string;
  signalId: string;
  action: "DISMISS" | "CONFIRM";
  requestedReversal?: number;
  reason: string;
}, wallet: Pick<GafusWalletService, "changeGafusBalanceTx">, lock: Pick<GafusLockPort, "lockGafusUser">, rowsPort?: GafusAdminRowsPort) {
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 1000) throw new Error("REASON_REQUIRED");
  if (
    input.action === "CONFIRM" &&
    (!Number.isSafeInteger(input.requestedReversal) ||
      (input.requestedReversal ?? 0) < 0 ||
      (input.requestedReversal ?? 0) > 10000)
  ) {
    throw new Error("INVALID_REVERSAL");
  }
  return withAdminRows(rowsPort,
    async (tx) => {
      await requireAdminTx(tx, input.actorId);
      const signal = await tx.findFraudSignal(input.signalId);
      if (!signal) throw new Error("FRAUD_SIGNAL_NOT_FOUND");
      await lock.lockGafusUser(tx.rawTx, signal.userId);
      const current = await tx.findFraudSignal(input.signalId);
      if (current?.status !== "OPEN") throw new Error("FRAUD_SIGNAL_ALREADY_REVIEWED");
      const requested = input.action === "CONFIRM" ? (input.requestedReversal ?? 0) : 0;
      const walletRow = await tx.walletBalance(signal.userId);
      const balance = walletRow?.balance ?? 0;
      const recovered = Math.min(balance, requested);
      let transactionId: string | null = null;
      if (recovered > 0) {
        const spent = await wallet.changeGafusBalanceTx(tx.rawTx, {
          userId: signal.userId,
          amount: -recovered,
          kind: "ADMIN_DEBIT",
          idempotencyKey: `gafus:fraud:${signal.id}`,
        });
        transactionId = spent.transactionId;
        await tx.annotateTransaction(spent.transactionId, input.actorId, reason);
      }
      const nextStatus = input.action === "CONFIRM" ? "RESOLVED" : "DISMISSED";
      const result = await tx.updateOpenFraudSignal(signal.id, nextStatus, input.actorId);
      if (result.count !== 1) throw new Error("FRAUD_SIGNAL_ALREADY_REVIEWED");
      await tx.appendAudit({
        actorId: input.actorId,
        targetUserId: signal.userId,
        action: input.action === "CONFIRM" ? "FRAUD_CONFIRMED" : "FRAUD_DISMISSED",
        reason,
        transactionId,
        before: {
          signalId: signal.id,
          status: signal.status,
          balance,
        },
        after: {
          signalId: signal.id,
          status: nextStatus,
          requestedFraudReversal: requested,
          recovered,
          unrecovered: requested - recovered,
        },
      });
      return {
        signalId: signal.id,
        status: nextStatus,
        requested,
        recovered,
        unrecovered: requested - recovered,
      };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}
