import { randomUUID } from "node:crypto";
import {
  NPD_RECEIPT_RETRY_DELAYS_MS, getNextNpdReceiptRetryAt, isNpdReceiptErrorRetryable,
} from "./npdRetryPolicy";
/** Core controls fiscalization decisions; Worker supplies the SQL adapter.
 * Minimal structural fields avoid importing Prisma model types into Core. */
export interface NpdPolicyOperation {
  id: string;
  type: "CREATE" | "CANCEL";
  attemptCount: number;
  recoveredLease?: boolean;
  receipt: {
    connectionId: string;
    providerReceiptId: string | null;
    amountKopecks: number;
    serviceName: string;
    operationAt: Date;
    payment: { status: string };
    connection: { deviceId: string; inn: string };
  };
}

/** Durable transitions are guarded by the finance adapter's lease/owner CAS. */
export interface NpdOperationPersistencePort<Db, Op extends NpdPolicyOperation> {
  claim(db: Db, owner: string, now: Date): Promise<{ operation: Op | null; lockAcquired: boolean }>;
  finish(db: Db, op: Op, data: Record<string, unknown>): Promise<unknown>;
  markReconciliation(db: Db, op: Op, code: string, message: string): Promise<unknown>;
  persistIssuedReceipt(db: Db, op: Op, receipt: {
    receiptUuid: string; printUrl: string; jsonUrl: string;
  }): Promise<unknown>;
  persistCanceledReceipt(db: Db, op: Op): Promise<boolean>;
  markReauthorization(db: Db, connectionId: string, code: string, message: string): Promise<unknown>;
}

export const NPD_RECONCILIATION_WINDOW_MS = 5 * 60_000;
const RECONCILIATION_WINDOW_MS = NPD_RECONCILIATION_WINDOW_MS;
export type NpdWorkerResult = { processed: number; skipped: number; lockAcquired: boolean; enabled: boolean };
export interface NpdProviderCallbacks<Db, Op extends NpdPolicyOperation> {
  safeError(error: unknown): { code: string; message: string };
  reconcile(db: Db, op: Op): Promise<boolean>;
  create(db: Db, op: Op): Promise<{ receiptUuid: string; printUrl: string; jsonUrl: string }>;
  cancel(db: Db, op: Op): Promise<void>;
  onCrash(error: unknown, op: Op): void;
}

/** Immutable fiscal receipt matching criteria live in core. */
export function reconciliationMatches(op: Pick<NpdPolicyOperation, "receipt">, receipts: { receiptUuid: string; cancelled: boolean; sourceDeviceId?: string; amountKopecks: number; serviceNames: string[]; operationAt: Date }[]) {
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
export function buildNpdCreateReceiptPayload(op: Pick<NpdPolicyOperation, "receipt">) {
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

async function executeCreate<Db, Op extends NpdPolicyOperation>(
  db: Db, op: Op, io: NpdProviderCallbacks<Db, Op>, persistence: NpdOperationPersistencePort<Db, Op>,
) {
  // The previous owner may have died after the provider accepted the write.
  // Even a refunded payment must be reconciled here: its receipt may need cancelling.
  if (op.recoveredLease) {
    try { if (await io.reconcile(db, op)) return; }
    catch { /* Fail closed; never turn an unknown provider write into a retry. */ }
    return persistence.markReconciliation(db, op, "AMBIGUOUS_WRITE", "Expired CREATE lease requires reconciliation");
  }
  if (op.receipt.payment.status === "REFUNDED") {
    await persistence.finish(db, op, { status: "NOT_REQUIRED", completedAt: new Date() });
    return;
  }
  try {
    const issued = await io.create(db, op);
    await persistence.persistIssuedReceipt(db, op, issued);
  } catch (error) {
    const safe = io.safeError(error);
    if (safe.code === "AMBIGUOUS_WRITE") {
      try { if (await io.reconcile(db, op)) return; }
      catch (reconciliationError) {
        const reconciliation = io.safeError(reconciliationError);
        return persistence.markReconciliation(db, op, reconciliation.code, reconciliation.message);
      }
      return persistence.markReconciliation(db, op, safe.code, safe.message);
    }
    if (safe.code === "UNAVAILABLE") return persistence.markReconciliation(db, op, safe.code, safe.message);
    if (safe.code === "UNAUTHORIZED") {
      await persistence.markReauthorization(db, op.receipt.connectionId, safe.code, safe.message);
      return persistence.finish(db, op, { status: "RETRY", nextAttemptAt: null, lastErrorCode: safe.code, lastErrorRedacted: safe.message });
    }
    if (isNpdReceiptErrorRetryable(safe.code) && op.attemptCount < NPD_RECEIPT_RETRY_DELAYS_MS.length) return persistence.finish(db, op, { status: "RETRY", nextAttemptAt: getNextNpdReceiptRetryAt(op.attemptCount, new Date()), lastErrorCode: safe.code, lastErrorRedacted: safe.message });
    await persistence.finish(db, op, { status: "FAILED", completedAt: new Date(), lastErrorCode: safe.code, lastErrorRedacted: safe.message });
  }
}

async function executeCancel<Db, Op extends NpdPolicyOperation>(
  db: Db, op: Op, io: NpdProviderCallbacks<Db, Op>, persistence: NpdOperationPersistencePort<Db, Op>,
) {
  if (!op.receipt.providerReceiptId) return persistence.markReconciliation(db, op, "MISSING_RECEIPT_ID", "Cancellation requires a confirmed receipt");
  try {
    await io.cancel(db, op);
    await persistence.persistCanceledReceipt(db, op);
  } catch (error) {
    const safe = io.safeError(error);
    if (safe.code === "AMBIGUOUS_WRITE" || safe.code === "UNAVAILABLE") return persistence.markReconciliation(db, op, safe.code, safe.message);
    if (safe.code === "UNAUTHORIZED") { await persistence.markReauthorization(db, op.receipt.connectionId, safe.code, safe.message); return persistence.finish(db, op, { status: "RETRY", nextAttemptAt: null, lastErrorCode: safe.code, lastErrorRedacted: safe.message }); }
    if (isNpdReceiptErrorRetryable(safe.code) && op.attemptCount < NPD_RECEIPT_RETRY_DELAYS_MS.length) return persistence.finish(db, op, { status: "RETRY", nextAttemptAt: getNextNpdReceiptRetryAt(op.attemptCount, new Date()), lastErrorCode: safe.code, lastErrorRedacted: safe.message });
    await persistence.finish(db, op, { status: "FAILED", completedAt: new Date(), lastErrorCode: safe.code, lastErrorRedacted: safe.message });
  }
}


export async function processDueNpdReceiptOperationsCore<Db, Op extends NpdPolicyOperation>(
  db: Db,
  io: NpdProviderCallbacks<Db, Op>,
  params: { batchSize: number; enabled: boolean },
  persistence: NpdOperationPersistencePort<Db, Op>,
): Promise<NpdWorkerResult> {
  if (!persistence || typeof persistence.claim !== "function")
    throw new Error("NPD_PERSISTENCE_PORT_REQUIRED");
  if (!params.enabled) return { processed: 0, skipped: 0, lockAcquired: false, enabled: false };
  let processed = 0; let skipped = 0; const owner = `npd:${process.pid}:${randomUUID()}`;
  try {
    for (let i = 0; i < params.batchSize; i += 1) {
      const claim = await persistence.claim(db, owner, new Date());
      if (!claim.lockAcquired) return { processed, skipped, lockAcquired: false, enabled: true };
      const op = claim.operation;
      if (!op) break;
      try { if (op.type === "CREATE") await executeCreate(db, op, io, persistence); else await executeCancel(db, op, io, persistence); processed += 1; }
      catch (error) { skipped += 1; io.onCrash(error, op); await persistence.finish(db, op, { status: "RETRY", nextAttemptAt: getNextNpdReceiptRetryAt(op.attemptCount, new Date()), lastErrorCode: "INTERNAL", lastErrorRedacted: "NPD operation crashed" }).catch(() => undefined); }
    }
    return { processed, skipped, lockAcquired: true, enabled: true };
  } finally { /* individual claims release pg_advisory_xact_lock atomically */ }
}
