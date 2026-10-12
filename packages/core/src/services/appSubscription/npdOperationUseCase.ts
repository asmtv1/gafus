import { randomUUID } from "node:crypto";
import {
  NPD_RECEIPT_RETRY_DELAYS_MS, getNextNpdReceiptRetryAt, isNpdReceiptErrorRetryable,
} from "./npdRetryPolicy";
import {
  claimNpdReceiptOperation as claimOne,
  finishNpdReceiptOperation as finish,
  markNpdReceiptReconciliation as markReconciliation,
  persistNpdIssuedReceipt as persistIssuedReceipt,
  persistNpdCanceledReceipt,
  markNpdConnectionReauthorizationRequired,
  type NpdReceiptWorkerDb as Db,
  type NpdClaimedOperation as Operation,
} from "./npdOperationPersistence";

export const NPD_RECONCILIATION_WINDOW_MS = 5 * 60_000;
const RECONCILIATION_WINDOW_MS = NPD_RECONCILIATION_WINDOW_MS;
export type NpdWorkerResult = { processed: number; skipped: number; lockAcquired: boolean; enabled: boolean };
export interface NpdProviderCallbacks {
  safeError(error: unknown): { code: string; message: string };
  reconcile(db: Db, op: Operation): Promise<boolean>;
  create(db: Db, op: Operation): Promise<{ receiptUuid: string; printUrl: string; jsonUrl: string }>;
  cancel(db: Db, op: Operation): Promise<void>;
  onCrash(error: unknown, op: Operation): void;
}

/** Immutable fiscal receipt matching criteria live in core. */
export function reconciliationMatches(op: Operation, receipts: { receiptUuid: string; cancelled: boolean; sourceDeviceId?: string; amountKopecks: number; serviceNames: string[]; operationAt: Date }[]) {
  return receipts.filter((receipt) =>
    !receipt.cancelled
    && receipt.sourceDeviceId === op.receipt.connection.deviceId
    && receipt.amountKopecks === op.receipt.amountKopecks
    && receipt.serviceNames.length === 1
    && receipt.serviceNames[0] === op.receipt.serviceName
    && Math.abs(receipt.operationAt.getTime() - op.receipt.operationAt.getTime()) <= RECONCILIATION_WINDOW_MS,
  );
}

/** Build provider-independent content of the individual fiscal receipt. */
export function buildNpdCreateReceiptPayload(op: Operation) {
  return {
    inn: op.receipt.connection.inn as string,
    operationAt: op.receipt.operationAt as Date,
    paymentType: "WIRE" as const,
    buyer: { incomeType: "FROM_INDIVIDUAL" as const },
    services: [{
      name: op.receipt.serviceName as string,
      amount: `${Math.floor(op.receipt.amountKopecks / 100)}.${String(op.receipt.amountKopecks % 100).padStart(2, "0")}`,
      quantity: 1,
    }],
  };
}

async function executeCreate(db: Db, op: Operation, io: NpdProviderCallbacks) {
  // The previous owner may have died after the provider accepted the write.
  // Even a refunded payment must be reconciled here: its receipt may need cancelling.
  if (op.recoveredLease) {
    try { if (await io.reconcile(db, op)) return; }
    catch { /* Fail closed; never turn an unknown provider write into a retry. */ }
    return markReconciliation(db, op, "AMBIGUOUS_WRITE", "Expired CREATE lease requires reconciliation");
  }
  if (op.receipt.payment.status === "REFUNDED") {
    await finish(db, op, { status: "NOT_REQUIRED", completedAt: new Date() });
    return;
  }
  try {
    const issued = await io.create(db, op);
    await persistIssuedReceipt(db, op, issued);
  } catch (error) {
    const safe = io.safeError(error);
    if (safe.code === "AMBIGUOUS_WRITE") {
      try { if (await io.reconcile(db, op)) return; }
      catch (reconciliationError) {
        const reconciliation = io.safeError(reconciliationError);
        return markReconciliation(db, op, reconciliation.code, reconciliation.message);
      }
      return markReconciliation(db, op, safe.code, safe.message);
    }
    if (safe.code === "UNAVAILABLE") return markReconciliation(db, op, safe.code, safe.message);
    if (safe.code === "UNAUTHORIZED") {
      await markNpdConnectionReauthorizationRequired(db, op.receipt.connectionId, safe.code, safe.message);
      return finish(db, op, { status: "RETRY", nextAttemptAt: null, lastErrorCode: safe.code, lastErrorRedacted: safe.message });
    }
    if (isNpdReceiptErrorRetryable(safe.code) && op.attemptCount < NPD_RECEIPT_RETRY_DELAYS_MS.length) return finish(db, op, { status: "RETRY", nextAttemptAt: getNextNpdReceiptRetryAt(op.attemptCount, new Date()), lastErrorCode: safe.code, lastErrorRedacted: safe.message });
    await finish(db, op, { status: "FAILED", completedAt: new Date(), lastErrorCode: safe.code, lastErrorRedacted: safe.message });
  }
}

async function executeCancel(db: Db, op: Operation, io: NpdProviderCallbacks) {
  if (!op.receipt.providerReceiptId) return markReconciliation(db, op, "MISSING_RECEIPT_ID", "Cancellation requires a confirmed receipt");
  try {
    await io.cancel(db, op);
    await persistNpdCanceledReceipt(db, op);
  } catch (error) {
    const safe = io.safeError(error);
    if (safe.code === "AMBIGUOUS_WRITE" || safe.code === "UNAVAILABLE") return markReconciliation(db, op, safe.code, safe.message);
    if (safe.code === "UNAUTHORIZED") { await markNpdConnectionReauthorizationRequired(db, op.receipt.connectionId, safe.code, safe.message); return finish(db, op, { status: "RETRY", nextAttemptAt: null, lastErrorCode: safe.code, lastErrorRedacted: safe.message }); }
    if (isNpdReceiptErrorRetryable(safe.code) && op.attemptCount < NPD_RECEIPT_RETRY_DELAYS_MS.length) return finish(db, op, { status: "RETRY", nextAttemptAt: getNextNpdReceiptRetryAt(op.attemptCount, new Date()), lastErrorCode: safe.code, lastErrorRedacted: safe.message });
    await finish(db, op, { status: "FAILED", completedAt: new Date(), lastErrorCode: safe.code, lastErrorRedacted: safe.message });
  }
}


export async function processDueNpdReceiptOperationsCore(
  db: Db,
  io: NpdProviderCallbacks,
  params: { batchSize: number; enabled: boolean },
): Promise<NpdWorkerResult> {
  if (!params.enabled) return { processed: 0, skipped: 0, lockAcquired: false, enabled: false };
  let processed = 0; let skipped = 0; const owner = `npd:${process.pid}:${randomUUID()}`;
  try {
    for (let i = 0; i < params.batchSize; i += 1) {
      const claim = await claimOne(db, owner, new Date());
      if (!claim.lockAcquired) return { processed, skipped, lockAcquired: false, enabled: true };
      const op = claim.operation;
      if (!op) break;
      try { if (op.type === "CREATE") await executeCreate(db, op, io); else await executeCancel(db, op, io); processed += 1; }
      catch (error) { skipped += 1; io.onCrash(error, op); await finish(db, op, { status: "RETRY", nextAttemptAt: getNextNpdReceiptRetryAt(op.attemptCount, new Date()), lastErrorCode: "INTERNAL", lastErrorRedacted: "NPD operation crashed" }).catch(() => undefined); }
    }
    return { processed, skipped, lockAcquired: true, enabled: true };
  } finally { /* individual claims release pg_advisory_xact_lock atomically */ }
}
