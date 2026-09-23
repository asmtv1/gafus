import { randomUUID } from "node:crypto";

import { decryptRefreshToken, encryptRefreshToken, NpdGateway, NpdGatewayError } from "@gafus/npd";
import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";

const logger = createWorkerLogger("npd-worker");
const NPD_LOCK_KEY = 671_203_419;
const LEASE_MS = 90_000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
const RECONCILIATION_WINDOW_MS = 5 * 60_000;

type Operation = any;
type Db = typeof prisma & Record<string, any>;

export type NpdWorkerResult = { processed: number; skipped: number; lockAcquired: boolean; enabled: boolean };

function enabled() {
  return process.env.NPD_PROCESSING_ENABLED === "true";
}

function safeError(error: unknown) {
  if (error instanceof NpdGatewayError) return { code: error.code, message: error.message.slice(0, 512) };
  return { code: "INTERNAL", message: "NPD operation failed" };
}

function retryAt(attemptCount: number, now: Date) {
  const base = RETRY_DELAYS_MS[Math.min(Math.max(attemptCount - 1, 0), RETRY_DELAYS_MS.length - 1)];
  // Deterministic bounded jitter avoids a herd while keeping tests and incident timelines readable.
  const jitter = Math.floor(base * ((attemptCount * 37) % 11) / 100);
  return new Date(now.getTime() + base + jitter);
}

function isRetryable(code: string) {
  return code === "RATE_LIMITED" || code === "TIMEOUT" || code === "NETWORK";
}

async function claimOne(db: Db, owner: string, now: Date): Promise<{ operation: Operation | null; lockAcquired: boolean }> {
  return db.$transaction(async (tx: any) => {
  // Transaction-scoped advisory lock serializes the short candidate selection
  // only. It is released automatically with this transaction, so a Prisma pool
  // connection cannot retain a session-level lock after the tick completes.
  const lock = await tx.$queryRawUnsafe(`SELECT pg_try_advisory_xact_lock(${NPD_LOCK_KEY}) AS locked`) as Array<{ locked: boolean }>;
  if (!lock?.[0]?.locked) return { operation: null, lockAcquired: false };
  const candidate = await tx.npdReceiptOperation.findFirst({
    where: {
      OR: [
        { status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: now } },
        { status: "PROCESSING", leaseExpiresAt: { lt: now } },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    select: { id: true, status: true },
  });
  if (!candidate) return { operation: null, lockAcquired: true };
  // This is an atomic compare-and-set claim. It is safe across replicas even
  // without relying on the advisory lock (the lock only reduces polling work).
  const claimed = await tx.npdReceiptOperation.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: now } },
        { status: "PROCESSING", leaseExpiresAt: { lt: now } },
      ],
    },
    data: { status: "PROCESSING", leaseOwner: owner, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), lastAttemptAt: now, attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return { operation: null, lockAcquired: true };
  const operation = await tx.npdReceiptOperation.findUnique({
    where: { id: candidate.id },
    include: { receipt: { include: { connection: true, payment: { select: { status: true } } } } },
  });
  return { operation: operation ? { ...operation, recoveredLease: candidate.status === "PROCESSING" } : null, lockAcquired: true };
  });
}

async function finish(db: Db, op: Operation, data: Record<string, unknown>) {
  await db.npdReceiptOperation.updateMany({ where: { id: op.id, status: "PROCESSING", leaseOwner: op.leaseOwner }, data: { ...data, leaseOwner: null, leaseExpiresAt: null } });
}

async function requireGateway(db: Db, op: Operation) {
  const connection = op.receipt.connection;
  if (!connection?.fiscalizationStartedAt || connection.status !== "ACTIVE") {
    throw new NpdGatewayError("UNAVAILABLE", "NPD connection is not active");
  }
  const refreshToken = decryptRefreshToken({ cipher: connection.refreshTokenCipher, iv: connection.refreshTokenIv, tag: connection.refreshTokenTag, keyVersion: connection.refreshTokenKeyVersion });
  const gateway = new NpdGateway({ deviceId: connection.deviceId, timeoutMs: Number(process.env.NPD_REQUEST_TIMEOUT_MS ?? 10_000) });
  const tokens = await gateway.refresh(refreshToken);
  const profile = await gateway.getProfile();
  if (profile.inn !== connection.inn) throw new NpdGatewayError("UNAUTHORIZED", "NPD profile INN mismatch");
  const encrypted = encryptRefreshToken(tokens.refreshToken);
  await db.npdConnection.update({ where: { id: connection.id }, data: { refreshTokenCipher: encrypted.cipher, refreshTokenIv: encrypted.iv, refreshTokenTag: encrypted.tag, refreshTokenKeyVersion: encrypted.keyVersion, lastRefreshedAt: new Date(), lastAuthorizedAt: new Date(), lastErrorCode: null, lastErrorRedacted: null } });
  return gateway;
}

async function markReconciliation(db: Db, op: Operation, code: string, message: string) {
  await db.$transaction(async (tx: any) => {
    const owned = await tx.npdReceiptOperation.updateMany({ where: { id: op.id, status: "PROCESSING", leaseOwner: op.leaseOwner }, data: { status: "RECONCILIATION_REQUIRED", completedAt: new Date(), lastErrorCode: code, lastErrorRedacted: message, leaseOwner: null, leaseExpiresAt: null } });
    if (owned.count !== 1) return;
    await tx.npdReceipt.update({ where: { id: op.receiptId }, data: { status: "RECONCILIATION_REQUIRED" } });
  });
}

async function persistIssuedReceipt(db: Db, op: Operation, issued: { receiptUuid: string; printUrl: string; jsonUrl: string }) {
  await db.$transaction(async (tx: any) => {
    // Lock the receipt before observing refund state. If a refund is in the
    // other transaction, one side waits: the subsequent read always sees the
    // committed intent instead of overwriting CANCEL_PENDING with ISSUED.
    await tx.$queryRawUnsafe(`SELECT id FROM "NpdReceipt" WHERE id = $1 FOR UPDATE`, op.receiptId);
    const stillOwned = await tx.npdReceiptOperation.updateMany({ where: { id: op.id, status: "PROCESSING", leaseOwner: op.leaseOwner }, data: { status: "SUCCEEDED", completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, lastErrorCode: null, lastErrorRedacted: null } });
    if (stillOwned.count !== 1) return;
    const current = await tx.npdReceipt.findUnique({ where: { id: op.receiptId }, include: { payment: { select: { status: true } } } });
    const refunded = current?.payment.status === "REFUNDED" || current?.status === "CANCEL_PENDING";
    await tx.npdReceipt.update({ where: { id: op.receiptId }, data: refunded ? { status: "CANCEL_PENDING", providerReceiptId: issued.receiptUuid, printUrl: issued.printUrl, jsonUrl: issued.jsonUrl, issuedAt: new Date() } : { status: "ISSUED", providerReceiptId: issued.receiptUuid, printUrl: issued.printUrl, jsonUrl: issued.jsonUrl, issuedAt: new Date() } });
    if (refunded) await tx.npdReceiptOperation.upsert({ where: { receiptId_type: { receiptId: op.receiptId, type: "CANCEL" } }, create: { receiptId: op.receiptId, type: "CANCEL", status: "PENDING" }, update: {} });
    else if (op.receipt.buyerEmail) await tx.npdReceiptEmailDelivery.upsert({ where: { receiptId: op.receiptId }, create: { receiptId: op.receiptId, recipientEmail: op.receipt.buyerEmail, status: "PENDING" }, update: {} });
    await tx.npdConnection.update({ where: { id: op.receipt.connectionId }, data: { lastSuccessfulOperationAt: new Date() } });
  });
}

/**
 * A timed-out create is never sent a second time. We only bind it when the
 * history has exactly one receipt that proves it came from this device and
 * matches every immutable receipt field. Zero or multiple matches stay in
 * review; this is intentionally more conservative than a retry.
 */
async function reconcileAmbiguousCreate(db: Db, op: Operation): Promise<boolean> {
  const gateway = await requireGateway(db, op);
  const receipts = await gateway.listRecentReceipts({ from: new Date(op.receipt.operationAt.getTime() - RECONCILIATION_WINDOW_MS) });
  const matches = reconciliationMatches(op, receipts);
  if (matches.length !== 1) return false;
  const verified = await gateway.getReceipt(op.receipt.connection.inn, matches[0].receiptUuid);
  if (verified.cancelled) return false;
  await persistIssuedReceipt(db, op, verified);
  return true;
}

export function reconciliationMatches(op: Operation, receipts: Array<{ receiptUuid: string; cancelled: boolean; sourceDeviceId?: string; amountKopecks: number; serviceNames: string[]; operationAt: Date }>) {
  return receipts.filter((receipt) =>
    !receipt.cancelled
    && receipt.sourceDeviceId === op.receipt.connection.deviceId
    && receipt.amountKopecks === op.receipt.amountKopecks
    && receipt.serviceNames.length === 1
    && receipt.serviceNames[0] === op.receipt.serviceName
    && Math.abs(receipt.operationAt.getTime() - op.receipt.operationAt.getTime()) <= RECONCILIATION_WINDOW_MS,
  );
}

async function executeCreate(db: Db, op: Operation) {
  // The previous owner may have died after the provider accepted the write.
  // Even a refunded payment must be reconciled here: its receipt may need cancelling.
  if (op.recoveredLease) {
    try { if (await reconcileAmbiguousCreate(db, op)) return; }
    catch { /* Fail closed; never turn an unknown provider write into a retry. */ }
    return markReconciliation(db, op, "AMBIGUOUS_WRITE", "Expired CREATE lease requires reconciliation");
  }
  if (op.receipt.payment.status === "REFUNDED") {
    await finish(db, op, { status: "NOT_REQUIRED", completedAt: new Date() });
    return;
  }
  try {
    const gateway = await requireGateway(db, op);
    const issued = await gateway.createReceipt({ inn: op.receipt.connection.inn, operationAt: op.receipt.operationAt, paymentType: "WIRE", buyer: { incomeType: "FROM_INDIVIDUAL" }, services: [{ name: op.receipt.serviceName, amount: `${Math.floor(op.receipt.amountKopecks / 100)}.${String(op.receipt.amountKopecks % 100).padStart(2, "0")}`, quantity: 1 }] });
    await persistIssuedReceipt(db, op, issued);
  } catch (error) {
    const safe = safeError(error);
    if (safe.code === "AMBIGUOUS_WRITE") {
      try { if (await reconcileAmbiguousCreate(db, op)) return; }
      catch (reconciliationError) {
        const reconciliation = safeError(reconciliationError);
        return markReconciliation(db, op, reconciliation.code, reconciliation.message);
      }
      return markReconciliation(db, op, safe.code, safe.message);
    }
    if (safe.code === "UNAVAILABLE") return markReconciliation(db, op, safe.code, safe.message);
    if (safe.code === "UNAUTHORIZED") {
      await db.npdConnection.update({ where: { id: op.receipt.connectionId }, data: { status: "REAUTH_REQUIRED", lastErrorCode: safe.code, lastErrorRedacted: safe.message } });
      return finish(db, op, { status: "RETRY", nextAttemptAt: null, lastErrorCode: safe.code, lastErrorRedacted: safe.message });
    }
    if (isRetryable(safe.code) && op.attemptCount < RETRY_DELAYS_MS.length) return finish(db, op, { status: "RETRY", nextAttemptAt: retryAt(op.attemptCount, new Date()), lastErrorCode: safe.code, lastErrorRedacted: safe.message });
    await finish(db, op, { status: "FAILED", completedAt: new Date(), lastErrorCode: safe.code, lastErrorRedacted: safe.message });
  }
}

async function executeCancel(db: Db, op: Operation) {
  if (!op.receipt.providerReceiptId) return markReconciliation(db, op, "MISSING_RECEIPT_ID", "Cancellation requires a confirmed receipt");
  try {
    const gateway = await requireGateway(db, op);
    const existing = await gateway.getReceipt(op.receipt.connection.inn, op.receipt.providerReceiptId);
    if (!existing.cancelled) await gateway.cancelReceipt({ receiptUuid: op.receipt.providerReceiptId, reason: "REFUND", comment: "Возврат средств" });
    const confirmed = await gateway.getReceipt(op.receipt.connection.inn, op.receipt.providerReceiptId);
    if (!confirmed.cancelled) throw new NpdGatewayError("AMBIGUOUS_WRITE", "NPD cancellation was not confirmed");
    await db.$transaction(async (tx: any) => {
      await tx.npdReceiptOperation.updateMany({ where: { id: op.id, status: "PROCESSING", leaseOwner: op.leaseOwner }, data: { status: "SUCCEEDED", completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null } });
      await tx.npdReceipt.update({ where: { id: op.receiptId }, data: { status: "CANCELED", canceledAt: new Date(), cancellationReason: "Возврат средств" } });
      await tx.npdConnection.update({ where: { id: op.receipt.connectionId }, data: { lastSuccessfulOperationAt: new Date() } });
    });
  } catch (error) {
    const safe = safeError(error);
    if (safe.code === "AMBIGUOUS_WRITE" || safe.code === "UNAVAILABLE") return markReconciliation(db, op, safe.code, safe.message);
    if (safe.code === "UNAUTHORIZED") { await db.npdConnection.update({ where: { id: op.receipt.connectionId }, data: { status: "REAUTH_REQUIRED", lastErrorCode: safe.code, lastErrorRedacted: safe.message } }); return finish(db, op, { status: "RETRY", nextAttemptAt: null, lastErrorCode: safe.code, lastErrorRedacted: safe.message }); }
    if (isRetryable(safe.code) && op.attemptCount < RETRY_DELAYS_MS.length) return finish(db, op, { status: "RETRY", nextAttemptAt: retryAt(op.attemptCount, new Date()), lastErrorCode: safe.code, lastErrorRedacted: safe.message });
    await finish(db, op, { status: "FAILED", completedAt: new Date(), lastErrorCode: safe.code, lastErrorRedacted: safe.message });
  }
}

export async function processDueNpdReceiptOperations(params: { batchSize?: number; db?: Db } = {}): Promise<NpdWorkerResult> {
  const db = params.db ?? (prisma as Db);
  if (!enabled()) return { processed: 0, skipped: 0, lockAcquired: false, enabled: false };
  let processed = 0; let skipped = 0; const owner = `npd:${process.pid}:${randomUUID()}`;
  try {
    for (let i = 0; i < (params.batchSize ?? Number(process.env.NPD_BATCH_SIZE ?? 20)); i += 1) {
      const claim = await claimOne(db, owner, new Date());
      if (!claim.lockAcquired) return { processed, skipped, lockAcquired: false, enabled: true };
      const op = claim.operation;
      if (!op) break;
      try { if (op.type === "CREATE") await executeCreate(db, op); else await executeCancel(db, op); processed += 1; }
      catch (error) { skipped += 1; logger.error("NPD operation crashed", error as Error, { operationId: op.id, type: op.type }); await finish(db, op, { status: "RETRY", nextAttemptAt: retryAt(op.attemptCount, new Date()), lastErrorCode: "INTERNAL", lastErrorRedacted: "NPD operation crashed" }).catch(() => undefined); }
    }
    return { processed, skipped, lockAcquired: true, enabled: true };
  } finally { /* individual claims release pg_advisory_xact_lock atomically */ }
}
