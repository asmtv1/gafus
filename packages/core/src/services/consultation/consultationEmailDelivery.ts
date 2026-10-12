import { ConsultationEmailStatus, prisma } from "@gafus/prisma";
import { sendConsultationEmailFromLog } from "./consultationTransactionalMail";

/** BullMQ adapters forward a log ID; core owns delivery decisions and persistence. */
export async function processConsultationEmailLog(emailLogId: string): Promise<"missing" | "sent" | "already-sent"> {
  const log = await prisma.consultationEmailLog.findUnique({
    where: { id: emailLogId },
  });
  if (!log) return "missing";
  if (log.status === ConsultationEmailStatus.SENT) return "already-sent";

  try {
    await sendConsultationEmailFromLog(emailLogId, log.type);
    await prisma.consultationEmailLog.update({
      where: { id: emailLogId },
      data: {
        status: ConsultationEmailStatus.SENT,
        sentAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    return "sent";
  } catch (reason) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    await prisma.consultationEmailLog.update({
      where: { id: emailLogId },
      data: {
        status: ConsultationEmailStatus.FAILED,
        attempts: { increment: 1 },
        lastError: error.message.slice(0, 2000),
      },
    });
    throw error;
  }
}
