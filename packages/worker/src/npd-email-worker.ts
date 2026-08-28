import { randomUUID } from "node:crypto";
import { renderNpdReceiptEmail, sendTransactionalMail } from "@gafus/mailer";
import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";

const logger = createWorkerLogger("npd-email-worker");
const LEASE_MS = 90_000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
type Db = typeof prisma & Record<string, any>;
type Delivery = any;

export type NpdEmailWorkerResult = { processed: number; sent: number; skipped: number; failed: number; enabled: boolean };

function enabled() { return process.env.NPD_RECEIPT_EMAIL_ENABLED !== "false"; }

function retryAt(attemptCount: number, now: Date) {
  const base = RETRY_DELAYS_MS[Math.min(Math.max(attemptCount - 1, 0), RETRY_DELAYS_MS.length - 1)];
  return new Date(now.getTime() + base + Math.floor(base * ((attemptCount * 37) % 11) / 100));
}

function validPrintUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

async function claimOne(db: Db, owner: string, now: Date): Promise<Delivery | null> {
  const candidate = await db.npdReceiptEmailDelivery.findFirst({
    where: { OR: [
      { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
      { status: "PROCESSING", leaseExpiresAt: { lt: now } },
    ] },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!candidate) return null;
  const claimed = await db.npdReceiptEmailDelivery.updateMany({
    where: { id: candidate.id, OR: [
      { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
      { status: "PROCESSING", leaseExpiresAt: { lt: now } },
    ] },
    data: { status: "PROCESSING", leaseOwner: owner, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), lastAttemptAt: now, attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return null;
  return db.npdReceiptEmailDelivery.findUnique({ where: { id: candidate.id }, include: { receipt: true } });
}

async function finish(db: Db, delivery: Delivery, data: Record<string, unknown>) {
  await db.npdReceiptEmailDelivery.updateMany({ where: { id: delivery.id, status: "PROCESSING", leaseOwner: delivery.leaseOwner }, data: { ...data, leaseOwner: null, leaseExpiresAt: null } });
}

async function processOne(db: Db, delivery: Delivery): Promise<"sent" | "skipped" | "failed"> {
  const receipt = delivery.receipt;
  if (!receipt || receipt.status !== "ISSUED" || !receipt.providerReceiptId || !validPrintUrl(receipt.printUrl) || !delivery.recipientEmail) {
    await finish(db, delivery, { status: "SKIPPED", lastErrorCode: "RECEIPT_NOT_DELIVERABLE", lastErrorRedacted: "Receipt is not issued or has no confirmed print URL" });
    return "skipped";
  }
  try {
    const mail = renderNpdReceiptEmail({ serviceName: receipt.serviceName, amountKopecks: receipt.amountKopecks, operationAt: receipt.operationAt, printUrl: receipt.printUrl });
    await sendTransactionalMail({ to: delivery.recipientEmail, subject: mail.subject, text: mail.text, html: mail.html });
    await finish(db, delivery, { status: "SENT", sentAt: new Date(), nextAttemptAt: null, lastErrorCode: null, lastErrorRedacted: null });
    return "sent";
  } catch (error) {
    await finish(db, delivery, { status: "FAILED", nextAttemptAt: retryAt(delivery.attemptCount, new Date()), lastErrorCode: "SMTP_FAILURE", lastErrorRedacted: "Transactional receipt email delivery failed" });
    // SMTP/provider errors can echo recipient addresses or message contents; keep logs metadata-only.
    logger.warn("NPD receipt email delivery failed", { deliveryId: delivery.id });
    return "failed";
  }
}

export async function processDueNpdReceiptEmailDeliveries(params: { batchSize?: number; db?: Db } = {}): Promise<NpdEmailWorkerResult> {
  const db = params.db ?? (prisma as Db);
  if (!enabled()) return { processed: 0, sent: 0, skipped: 0, failed: 0, enabled: false };
  const owner = `npd-email:${process.pid}:${randomUUID()}`;
  let processed = 0, sent = 0, skipped = 0, failed = 0;
  for (let i = 0; i < (params.batchSize ?? Number(process.env.NPD_RECEIPT_EMAIL_BATCH_SIZE ?? 20)); i += 1) {
    const delivery = await claimOne(db, owner, new Date());
    if (!delivery) break;
    const result = await processOne(db, delivery);
    processed += 1;
    if (result === "sent") sent += 1;
    if (result === "skipped") skipped += 1;
    if (result === "failed") failed += 1;
  }
  return { processed, sent, skipped, failed, enabled: true };
}
