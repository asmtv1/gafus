import { ConsultationEmailStatus, prisma } from "@gafus/prisma";
import { sendConsultationEmailFromLog } from "./consultationTransactionalMail";

export type ConsultationMailOutcome = "missing" | "sent" | "already-sent" | "queued" | "failed";
const keyFor = (id: string) => `consultation-${id}`;

/**
 * Read-only provider/outbox evidence followed by an owner+status conditional CAS.
 * This function NEVER sends or re-enqueues mail. Incomplete or UNKNOWN evidence
 * is a queued/manual-review state, not confirmation of inbox delivery.
 */
export async function reconcileConsultationEmailLog(
  emailLogId: string,
): Promise<ConsultationMailOutcome> {
  const log = await prisma.consultationEmailLog.findUnique({ where: { id: emailLogId } });
  if (!log) return "missing";
  if (log.status === ConsultationEmailStatus.SENT) return "already-sent";
  if (log.status === ConsultationEmailStatus.FAILED) return "failed";

  const deliveryKey = keyFor(emailLogId);
  const outbox = await prisma.transactionalMailOutbox.findUnique({
    where: { id: deliveryKey },
    select: { id: true, status: true, acceptedAt: true },
  });
  if (!outbox) return "queued";
  if (outbox.status === "FAILED" || outbox.status === "EXPIRED") {
    // An expired/rejected outbox and a durable provider ACCEPTED attempt
    // contradict each other. Neither FAILED nor SENT is provable here.
    // Leave the consultation PENDING for manual review, never retry provider.
    const attempt = await prisma.transactionalMailAttempt.findUnique({
      where: { id: deliveryKey },
      select: { status: true, providerMessageId: true, acceptedAt: true },
    });
    // UNKNOWN may mean the provider accepted but the result was lost.
    // Neither ACCEPTED nor UNKNOWN is proof of terminal rejection.
    if (attempt?.status === "ACCEPTED" || attempt?.status === "UNKNOWN") {
      const manualReviewCode = attempt.status === "ACCEPTED"
        ? "CONSULTATION_MAIL_ACK_TERMINAL_CONFLICT"
        : "CONSULTATION_MAIL_TERMINAL_UNKNOWN";
      if (log.lastError !== manualReviewCode) {
        await prisma.consultationEmailLog.updateMany({
          where: {
            id: emailLogId,
            status: ConsultationEmailStatus.PENDING,
            lastError: log.lastError,
          },
          data: { lastError: manualReviewCode },
        });
      }
      return "queued";
    }
    const result = await prisma.consultationEmailLog.updateMany({
      where: { id: emailLogId, status: ConsultationEmailStatus.PENDING },
      data: {
        status: ConsultationEmailStatus.FAILED, sentAt: null,
        lastError: outbox.status === "EXPIRED"
          ? "CONSULTATION_MAIL_TERMINAL_EXPIRED"
          : "CONSULTATION_MAIL_TERMINAL_FAILED",
      },
    });
    if (result.count === 1) return "failed";
  } else if (outbox.status === "SENT" &&
      outbox.acceptedAt instanceof Date && Number.isFinite(outbox.acceptedAt.getTime())) {
    const attempt = await prisma.transactionalMailAttempt.findUnique({
      where: { id: deliveryKey },
      select: { status: true, providerMessageId: true, acceptedAt: true },
    });
    if (attempt?.status === "ACCEPTED" && attempt.providerMessageId &&
        attempt.acceptedAt instanceof Date &&
        attempt.acceptedAt.getTime() === outbox.acceptedAt.getTime()) {
      const result = await prisma.consultationEmailLog.updateMany({
        where: { id: emailLogId, status: ConsultationEmailStatus.PENDING },
        data: {
          status: ConsultationEmailStatus.SENT, sentAt: attempt.acceptedAt,
          lastError: null,
        },
      });
      if (result.count === 1) return "sent";
    }
  }
  // On CAS race recheck authoritative log; never overwrite historical SENT.
  const current = await prisma.consultationEmailLog.findUnique({ where: { id: emailLogId } });
  if (!current) return "missing";
  if (current.status === ConsultationEmailStatus.SENT) return "already-sent";
  if (current.status === ConsultationEmailStatus.FAILED) return "failed";
  return "queued";
}

async function recordEnqueueOnce(emailLogId: string): Promise<void> {
  await prisma.consultationEmailLog.updateMany({
    where: { id: emailLogId, status: ConsultationEmailStatus.PENDING, attempts: 0 },
    data: { attempts: { increment: 1 }, lastError: null },
  });
}

/** BullMQ dispatch returns queued as handled; never claims acceptance on enqueue. */
export async function processConsultationEmailLog(
  emailLogId: string,
): Promise<ConsultationMailOutcome> {
  const log = await prisma.consultationEmailLog.findUnique({ where: { id: emailLogId } });
  if (!log) return "missing";
  if (log.status === ConsultationEmailStatus.SENT) return "already-sent";
  if (log.status === ConsultationEmailStatus.FAILED) return "failed";

  // Never send again when the durable outbox already owns the delivery,
  // or a previous provider attempt has UNKNOWN/ACCEPTED persistence.
  const deliveryKey = keyFor(emailLogId);
  const existing = await prisma.transactionalMailOutbox.findUnique({
    where: { id: deliveryKey },
    select: { id: true },
  });
  if (existing) {
    await recordEnqueueOnce(emailLogId);
    return reconcileConsultationEmailLog(emailLogId);
  }
  const attempt = await prisma.transactionalMailAttempt.findUnique({
    where: { id: deliveryKey },
    select: { status: true, providerMessageId: true, acceptedAt: true },
  });
  if (attempt?.status === "ACCEPTED" && attempt.providerMessageId &&
      attempt.acceptedAt instanceof Date) {
    const saved = await prisma.consultationEmailLog.updateMany({
      where: { id: emailLogId, status: ConsultationEmailStatus.PENDING },
      data: {
        status: ConsultationEmailStatus.SENT, sentAt: attempt.acceptedAt, lastError: null,
      },
    });
    if (saved.count === 1) return "sent";
    return reconcileConsultationEmailLog(emailLogId);
  }
  if (attempt || log.status === ConsultationEmailStatus.PENDING && log.attempts > 0) {
    // UNKNOWN or accepted-but-uncommitted; no blind provider replay.
    return "queued";
  }

  let accepted = false;
  try {
    const result = await sendConsultationEmailFromLog(emailLogId, log.type);
    if (result.kind === "QUEUED") {
      await recordEnqueueOnce(emailLogId);
      return "queued";
    }
    accepted = true;
    const saved = await prisma.consultationEmailLog.updateMany({
      where: { id: emailLogId, status: ConsultationEmailStatus.PENDING },
      data: {
        status: ConsultationEmailStatus.SENT, sentAt: result.acceptedAt,
        lastError: null, attempts: { increment: 1 },
      },
    });
    if (saved.count === 1) return "sent";
    return reconcileConsultationEmailLog(emailLogId);
  } catch {
    // A persisted outbox or UNKNOWN/ACCEPTED attempt means the provider result
    // is not proven FAILED. Never rewrite it or re-enter the provider on retry.
    const deferred = await prisma.transactionalMailOutbox.findUnique({
      where: { id: deliveryKey }, select: { id: true },
    });
    const recorded = await prisma.transactionalMailAttempt.findUnique({
      where: { id: deliveryKey }, select: { status: true },
    });
    if (deferred) return reconcileConsultationEmailLog(emailLogId);
    // Even when no attempt row is visible, a provider-side ACK may be lost
    // between network and DB. Preserve PENDING and stop automatic resends.
    if (recorded || accepted) {
      await recordEnqueueOnce(emailLogId);
      return "queued";
    }
    await prisma.consultationEmailLog.updateMany({
      where: { id: emailLogId, status: ConsultationEmailStatus.PENDING, attempts: 0 },
      data: { attempts: { increment: 1 }, lastError: "CONSULTATION_MAIL_ACCEPTANCE_UNKNOWN" },
    });
    return "queued";
  }
}
