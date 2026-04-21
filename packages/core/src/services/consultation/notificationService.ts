import { ConsultationEmailStatus, ConsultationEmailType, prisma } from "@gafus/prisma";
import {
  CONSULTATION_MAIL_JOB_ID,
  consultationMailQueue,
} from "@gafus/queues";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("core-consultation-notify");

/**
 * Запись в журнал и постановка письма в очередь (ретраи в воркере).
 */
export async function enqueueConsultationEmail(
  bookingId: string,
  type: ConsultationEmailType,
): Promise<void> {
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
