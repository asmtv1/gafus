import type { ConsultationEmailType} from "@gafus/prisma";
import { ConsultationEmailStatus, prisma } from "@gafus/prisma";
import { Prisma } from "@gafus/prisma";
import {
  CONSULTATION_MAIL_JOB_ID,
  consultationMailQueue,
} from "@gafus/queues";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("server-consultation-email-outbox");

function isUniqueEmailLogViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target) && target.includes("bookingId") && target.includes("type");
}

function isTrainerRecipientType(type: ConsultationEmailType): boolean {
  return (
    type === "TRAINER_CONFIRM_REQUEST" ||
    type === "TRAINER_BOOKING_CONFIRMED" ||
    type === "TRAINER_BOOKING_CANCELLED_BY_USER" ||
    type === "TRAINER_CONSULTATION_REMINDER_30M"
  );
}

/** Email получателя; без письма в очередь не ставим (пуши идут отдельно). */
export async function resolveConsultationEmailRecipient(
  bookingId: string,
  type: ConsultationEmailType,
): Promise<string | null> {
  const b = await prisma.consultationBooking.findUnique({
    where: { id: bookingId },
    include: {
      client: { select: { email: true } },
      cynologist: { include: { user: { select: { email: true } } } },
    },
  });
  if (!b) {
    return null;
  }
  if (isTrainerRecipientType(type)) {
    return b.cynologist.user?.email?.trim() || null;
  }
  return b.client?.email?.trim() || null;
}

/** Record intent in the SAME transaction as the booking transition. No
 * provider or Redis operation may occur here. Existing unique (bookingId,type)
 * also protects mixed-version producers and repeated transitions. */
export async function stageConsultationEmailIntents(
  tx: Pick<Prisma.TransactionClient, "consultationBooking" | "consultationEmailLog">,
  bookingId: string,
  types: readonly ConsultationEmailType[],
): Promise<void> {
  const booking = await tx.consultationBooking.findUnique({
    where: { id: bookingId },
    select: {
      client: { select: { email: true } },
      cynologist: { select: { user: { select: { email: true } } } },
    },
  });
  if (!booking) throw new Error("CONSULTATION_EMAIL_BOOKING_MISSING");
  const data = [...new Set(types)].filter(type =>
    Boolean((isTrainerRecipientType(type) ? booking.cynologist.user.email : booking.client.email)?.trim())
  ).map(type => ({ bookingId, type, status: ConsultationEmailStatus.PENDING, attempts: 0 }));
  if (data.length) await tx.consultationEmailLog.createMany({ data, skipDuplicates: true });
}

/** Stable identity for initial enqueue and an interrupted producer's replay. */
function addConsultationMailJob(emailLogId: string): Promise<unknown> {
  return consultationMailQueue.add(
    "send",
    { emailLogId },
    {
      jobId: CONSULTATION_MAIL_JOB_ID(emailLogId),
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );
}

/**
 * Запись в журнал и постановка письма в очередь (ретраи в воркере).
 */
export async function enqueueConsultationEmail(
  bookingId: string,
  type: ConsultationEmailType,
  enqueue: (emailLogId:string)=>Promise<unknown> = addConsultationMailJob,
): Promise<"created" | "duplicate" | "no_recipient"> {
  const to = await resolveConsultationEmailRecipient(bookingId, type);
  if (!to) {
    logger.warn("Нет email у получателя, письмо не создано", { bookingId, type });
    return "no_recipient";
  }
  let log: { id: string };
  try {
    log = await prisma.consultationEmailLog.create({
      data: {
        bookingId,
        type,
        status: ConsultationEmailStatus.PENDING,
        attempts: 0,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueEmailLogViolation(error)) {
      // A previous producer may have created the DB log then lost Queue.add.
      // Recover ONLY never-attempted PENDING records under the same BullMQ
      // jobId. After the first delivery attempt ACK can be ambiguous; leave
      // those records to the existing worker/outbox reconciliation path.
      const existing = await prisma.consultationEmailLog.findUnique({
        where: { bookingId_type: { bookingId, type } },
        select: { id: true, status: true, attempts: true },
      });
      if (existing?.status === ConsultationEmailStatus.PENDING && existing.attempts === 0) {
        await enqueue(existing.id);
        logger.info("Восстановлена постановка письма консультации", { bookingId, type });
      } else {
        logger.info("Письмо по консультации уже создано, дубль пропущен", { bookingId, type });
      }
      return "duplicate";
    }
    throw error;
  }

  await enqueue(log.id);

  logger.info("enqueueConsultationEmail", { bookingId, type, emailLogId: log.id });
  return "created";
}

/** Repair the DB-log -> Redis gap even if the original HTTP request is never
 * replayed. We only submit never-attempted rows using the original BullMQ id.
 * A CAS on updatedAt rotates the bounded batch and prevents parallel cron
 * processes from repeatedly dispatching the same row. It is NOT a provider
 * send claim; provider ACK/UNKNOWN handling remains in mail delivery.
 */
export async function recoverUnstartedConsultationEmails(
  options: { now?: Date; limit?: number; enqueue?: (emailLogId: string) => Promise<unknown> } = {},
): Promise<{ checked: number; queued: number; failed: number }> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 50)));
  const enqueue = options.enqueue ?? addConsultationMailJob;
  const rows = await prisma.consultationEmailLog.findMany({
    where: {
      status: ConsultationEmailStatus.PENDING,
      attempts: 0,
      updatedAt: { lte: new Date(now.getTime() - 60_000) },
    },
    select: { id: true, updatedAt: true },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  let queued = 0;
  let failed = 0;
  for (const row of rows) {
    const claim = await prisma.consultationEmailLog.updateMany({
      where: { id: row.id, status: ConsultationEmailStatus.PENDING, attempts: 0, updatedAt: row.updatedAt },
      data: { updatedAt: now },
    });
    if (claim.count !== 1) continue;
    try {
      await enqueue(row.id);
      queued++;
    } catch {
      // A lost Queue.add ACK is not an email failure. A later scan can
      // safely re-add the same job id; never mark provider delivery here.
      failed++;
    }
  }
  return { checked: rows.length, queued, failed };
}
