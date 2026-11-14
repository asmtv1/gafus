import { prisma, type Prisma } from "@gafus/prisma";

const NPD_LOCK_KEY = 671_203_419;
const LEASE_MS = 90_000;
export type NpdClaimedOperation = Prisma.NpdReceiptOperationGetPayload<{
  include: { receipt: { include: {
    connection: true;
    payment: { select: { status: true } };
  } } };
}> & { recoveredLease?: boolean };
type Operation = NpdClaimedOperation;
export type NpdReceiptWorkerDb = typeof prisma;
type Db = NpdReceiptWorkerDb;
export function getNpdWorkerDatabase(): Db { return prisma as Db; }

export async function claimNpdReceiptOperation(db: Db, owner: string, now: Date): Promise<{ operation: Operation | null; lockAcquired: boolean }> {
  return db.$transaction(async (tx) => {
  // Transaction-scoped advisory lock serializes the short candidate selection
  // only. It is released automatically with this transaction, so a Prisma pool
  // connection cannot retain a session-level lock after the tick completes.
  const lock = await tx.$queryRawUnsafe(`SELECT pg_try_advisory_xact_lock(${NPD_LOCK_KEY}) AS locked`) as { locked: boolean }[];
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

export async function finishNpdReceiptOperation(db: Db, op: Operation, data: Record<string, unknown>) {
  await db.npdReceiptOperation.updateMany({ where: { id: op.id, status: "PROCESSING", leaseOwner: op.leaseOwner }, data: { ...data, leaseOwner: null, leaseExpiresAt: null } });
}



export async function markNpdReceiptReconciliation(db: Db, op: Operation, code: string, message: string) {
  await db.$transaction(async (tx) => {
    const owned = await tx.npdReceiptOperation.updateMany({ where: { id: op.id, status: "PROCESSING", leaseOwner: op.leaseOwner }, data: { status: "RECONCILIATION_REQUIRED", completedAt: new Date(), lastErrorCode: code, lastErrorRedacted: message, leaseOwner: null, leaseExpiresAt: null } });
    if (owned.count !== 1) return;
    await tx.npdReceipt.update({ where: { id: op.receiptId }, data: { status: "RECONCILIATION_REQUIRED" } });
  });
}

export async function persistNpdIssuedReceipt(db: Db, op: Operation, issued: { receiptUuid: string; printUrl: string; jsonUrl: string }) {
  await db.$transaction(async (tx) => {
    // Lock the receipt before observing refund state. If a refund is in the
    // other transaction, one side waits: the subsequent read always sees the
    // committed intent instead of overwriting CANCEL_PENDING with ISSUED.
    await tx.$queryRawUnsafe("SELECT id FROM \"NpdReceipt\" WHERE id = $1 FOR UPDATE", op.receiptId);
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



/** Store refreshed encrypted token without exposing the provider transport in core. */
export async function persistNpdRefreshedConnection(db: Db, connectionId: string, encrypted: {
  cipher: Uint8Array; iv: Uint8Array; tag: Uint8Array; keyVersion: number;
}): Promise<void> {
  await db.npdConnection.update({
    where: { id: connectionId },
    data: {
      refreshTokenCipher: encrypted.cipher, refreshTokenIv: encrypted.iv,
      refreshTokenTag: encrypted.tag, refreshTokenKeyVersion: encrypted.keyVersion,
      lastRefreshedAt: new Date(), lastAuthorizedAt: new Date(),
      lastErrorCode: null, lastErrorRedacted: null,
    },
  });
}

export async function markNpdConnectionReauthorizationRequired(
  db: Db, connectionId: string, code: string, message: string,
): Promise<void> {
  await db.npdConnection.update({
    where: { id: connectionId },
    data: { status: "REAUTH_REQUIRED", lastErrorCode: code, lastErrorRedacted: message },
  });
}

/** Compare-and-set ownership before updating fiscal receipt state. */
export async function persistNpdCanceledReceipt(db: Db, op: Operation): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const claimed = await tx.npdReceiptOperation.updateMany({
      where: { id: op.id, status: "PROCESSING", leaseOwner: op.leaseOwner },
      data: { status: "SUCCEEDED", completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
    });
    if (claimed.count !== 1) return false;
    await tx.npdReceipt.update({
      where: { id: op.receiptId },
      data: { status: "CANCELED", canceledAt: new Date(), cancellationReason: "Возврат средств" },
    });
    await tx.npdConnection.update({
      where: { id: op.receipt.connectionId },
      data: { lastSuccessfulOperationAt: new Date() },
    });
    return true;
  });
}
