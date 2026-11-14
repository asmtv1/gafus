import type { GafusLedgerMetadata } from "@gafus/types";
import { requireGafusLedgerRowsPort } from "./gafusLedgerPort";
import { GafusError } from "./errors";
import type { GafusTx } from "./types";

// Caller must acquire lockGafusUser(tx, userId) in the same transaction.
export async function ensureGafusWalletTx(tx: GafusTx, userId: string) {
  return requireGafusLedgerRowsPort().ensureWalletRow(tx,userId);
}

type MutationInput = {
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

export async function changeGafusBalanceTx(
  tx: GafusTx,
  input: MutationInput,
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
  const prior = await requireGafusLedgerRowsPort().findLedgerEntry(tx,input.idempotencyKey);
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
  const updated = await requireGafusLedgerRowsPort().updateWalletBalanceRow(tx,input.userId,delta);
  if (updated.count !== 1) {
    throw new GafusError("GAFUS_INSUFFICIENT_BALANCE", "Not enough Gafus");
  }
  const entry = await requireGafusLedgerRowsPort().appendLedgerEntry(tx,{
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

export async function getGafusBalance(userId: string): Promise<number> {
  const row = await requireGafusLedgerRowsPort().readWalletBalanceRow(userId);
  return row?.balance ?? 0;
}

export async function listGafusTransactions(input: {
  userId: string;
  cursor?: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const rows = await requireGafusLedgerRowsPort().readWalletLedgerRows(input.userId,input.cursor,limit);
  return {
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1]?.id ?? null : null,
  };
}
