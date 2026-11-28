import type { GafusLedgerMetadata } from "@gafus/types";
import type { GafusLedgerRowsPort } from "./gafusLedgerPort";
import { GafusError } from "./errors";
import type { GafusTx } from "./types";

export type GafusBalanceMutationInput = {
  userId: string;
  amount: number;
  idempotencyKey: string;
  kind?: "EARN" | "SPEND" | "ADMIN_CREDIT" | "ADMIN_DEBIT" | "LEGACY_IMPORT";
  rewardKind?: "POST_PUBLISHED" | "QUESTION_CREATED" | "ANSWER_CREATED" | "POST_REACTION_MILESTONE" | "BEST_ANSWER";
  sourceEntityType?: string;
  sourceEntityId?: string;
  targetType?: "COURSE_STEP" | "MINI_GUIDE" | "ARTICLE";
  targetKey?: string;
  settingsRevision?: number;
  metadata?: GafusLedgerMetadata;
};

/** Instance-local ledger operations; caller supplies the exact locked SQL adapter. */
export function createGafusWalletService(rows: GafusLedgerRowsPort) {
  if (!rows) throw new Error("GAFUS_LEDGER_DEPENDENCIES_REQUIRED");
  // Caller must acquire lockGafusUser(tx, userId) in the same transaction.
  async function ensureGafusWalletTx(tx: GafusTx, userId: string) {
    return rows.ensureWalletRow(tx,userId);
  }

  async function changeGafusBalanceTx(
    tx: GafusTx,
    input: GafusBalanceMutationInput,
  ): Promise<{ transactionId: string; balance: number; replay: boolean }> {
    if (!Number.isSafeInteger(input.amount) || input.amount === 0) {
      throw new GafusError("GAFUS_INVALID_AMOUNT", "Amount must be a nonzero integer");
    }
    const delta = input.amount;
    const kind = input.kind ?? (delta > 0 ? "EARN" : "SPEND");
    const positiveKind = kind === "EARN" || kind === "ADMIN_CREDIT" || kind === "LEGACY_IMPORT";
    if (positiveKind !== (delta > 0) || Math.abs(delta) > 2_147_483_647) {
      throw new GafusError("GAFUS_INVALID_AMOUNT", "Invalid signed ledger operation");
    }
    if (!input.idempotencyKey || input.idempotencyKey.length > 512) {
      throw new GafusError("GAFUS_IDEMPOTENCY_CONFLICT", "Invalid idempotency key");
    }
    const prior = await rows.findLedgerEntry(tx,input.idempotencyKey);
    if (prior) {
      if (prior.userId !== input.userId || prior.delta !== delta
        || prior.kind !== kind || prior.targetKey !== (input.targetKey ?? null)) {
        throw new GafusError("GAFUS_IDEMPOTENCY_CONFLICT", "Key already used for another operation");
      }
      return { transactionId: prior.id, balance: prior.balanceAfter, replay: true };
    }
    const wallet = await ensureGafusWalletTx(tx, input.userId);
    if (delta < 0 && wallet.balance < -delta) {
      throw new GafusError("GAFUS_INSUFFICIENT_BALANCE", "Not enough Gafus");
    }
    const balanceAfter = wallet.balance + delta;
    if (!Number.isSafeInteger(balanceAfter) || balanceAfter < 0 || balanceAfter > 2_147_483_647) {
      throw new GafusError("GAFUS_INVALID_AMOUNT", "Invalid resulting balance");
    }
    const updated = await rows.updateWalletBalanceRow(tx,input.userId,delta);
    if (updated.count !== 1) {
      throw new GafusError("GAFUS_INSUFFICIENT_BALANCE", "Not enough Gafus");
    }
    const entry = await rows.appendLedgerEntry(tx,{
        userId: input.userId, kind, delta,
        balanceBefore: wallet.balance, balanceAfter,
        idempotencyKey: input.idempotencyKey,
        rewardKind: input.rewardKind,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        targetType: input.targetType,
        targetKey: input.targetKey,
        settingsRevision: input.settingsRevision,
        metadata: input.metadata,
    });
    return { transactionId: entry.id, balance: balanceAfter, replay: false };
  }

  async function getGafusBalance(userId: string): Promise<number> {
    const row = await rows.readWalletBalanceRow(userId);
    return row?.balance ?? 0;
  }

  async function listGafusTransactions(input: {
    userId: string;
    cursor?: string;
    limit?: number;
  }) {
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const history = await rows.readWalletLedgerRows(input.userId,input.cursor,limit);
    return {
      items: history.slice(0, limit),
      nextCursor: history.length > limit ? history[limit - 1]?.id ?? null : null,
    };
  }
  return { ensureGafusWalletTx, changeGafusBalanceTx, getGafusBalance, listGafusTransactions };
}
export type GafusWalletService = ReturnType<typeof createGafusWalletService>;
