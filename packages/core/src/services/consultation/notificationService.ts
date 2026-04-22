import { ConsultationEmailStatus, ConsultationEmailType, prisma } from "@gafus/prisma";
import {
  CONSULTATION_MAIL_JOB_ID,
  consultationMailQueue,
} from "@gafus/queues";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("core-consultation-notify");

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

/**
 * Запись в журнал и постановка письма в очередь (ретраи в воркере).
 */
export async function enqueueConsultationEmail(
  bookingId: string,
  type: ConsultationEmailType,
): Promise<void> {
  const to = await resolveConsultationEmailRecipient(bookingId, type);
  if (!to) {
    logger.warn("Нет email у получателя, письмо не создано", { bookingId, type });
    return;
  }
  const log = await prisma.consultationEmailLog.create({
    data: {
      bookingId,
      type,
      status: ConsultationEmailStatus.PENDING,
      attempts: 0,
    },
  });

  await consultationMailQueue.add(
    "send",
    { emailLogId: log.id },
    {
      jobId: CONSULTATION_MAIL_JOB_ID(log.id),
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );

  logger.info("enqueueConsultationEmail", { bookingId, type, emailLogId: log.id });
}
