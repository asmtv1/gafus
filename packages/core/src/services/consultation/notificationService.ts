import type { ConsultationEmailType} from "@gafus/prisma";
import { ConsultationEmailStatus, prisma } from "@gafus/prisma";
import { Prisma } from "@gafus/prisma";
import {
  CONSULTATION_MAIL_JOB_ID,
  consultationMailQueue,
} from "@gafus/queues";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("core-consultation-notify");

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
        await addConsultationMailJob(existing.id);
        logger.info("Восстановлена постановка письма консультации", { bookingId, type });
      } else {
        logger.info("Письмо по консультации уже создано, дубль пропущен", { bookingId, type });
      }
      return "duplicate";
    }
    throw error;
  }

  await addConsultationMailJob(log.id);

  logger.info("enqueueConsultationEmail", { bookingId, type, emailLogId: log.id });
  return "created";
}
