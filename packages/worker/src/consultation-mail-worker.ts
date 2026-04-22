import { ConsultationEmailStatus } from "@gafus/prisma";
import { prisma } from "@gafus/prisma";
import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { sendConsultationEmailFromLog } from "@gafus/core/services/consultation";
import type { Job } from "bullmq";
import { Worker } from "bullmq";

const logger = createWorkerLogger("consultation-mail-worker");

interface MailJobData {
  emailLogId: string;
}

export function startConsultationMailWorker(): void {
  const worker = new Worker<MailJobData>(
    "consultation-mail",
    async (job: Job<MailJobData>) => {
      const { emailLogId } = job.data;
      const log = await prisma.consultationEmailLog.findUnique({
        where: { id: emailLogId },
      });
      if (!log) {
        logger.warn("email log missing", { emailLogId });
        return;
      }
      if (log.status === ConsultationEmailStatus.SENT) {
        return;
      }

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
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        await prisma.consultationEmailLog.update({
          where: { id: emailLogId },
          data: {
            status: ConsultationEmailStatus.FAILED,
            attempts: { increment: 1 },
            lastError: err.message.slice(0, 2000),
          },
        });
        throw err;
      }
    },
    {
      connection,
      concurrency: 2,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );
  worker.on("error", (err) => {
    logger.error("consultation-mail worker error", err);
  });
  logger.success("consultation-mail worker запущен");
}
