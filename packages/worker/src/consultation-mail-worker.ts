import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { processConsultationEmailLog } from "@gafus/core/services/consultation";
import type { Job } from "bullmq";
import { Worker } from "bullmq";

const logger = createWorkerLogger("consultation-mail-worker");

interface MailJobData {
  emailLogId: string;
}

export function startConsultationMailWorker(): void {
  // Only coalesce overlapping deliveries in this worker process. This is
  // not a distributed lock and cannot guarantee provider exactly-once ACK.
  const inFlight = new Map<string, Promise<"missing" | "sent" | "already-sent" | "queued" | "failed">>();
  const worker = new Worker<MailJobData>(
    "consultation-mail",
    async (job: Job<MailJobData>) => {
      const { emailLogId } = job.data;
      let delivery = inFlight.get(emailLogId);
      if (!delivery) {
        delivery = processConsultationEmailLog(emailLogId);
        inFlight.set(emailLogId, delivery);
      }
      try {
        const outcome = await delivery;
        if (outcome === "missing") logger.warn("email log missing", { emailLogId });
      } finally {
        if (inFlight.get(emailLogId) === delivery) inFlight.delete(emailLogId);
      }
    },
    {
      connection,
      concurrency: 2,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );
  worker.on("error", () => {
    // Transport/Redis errors may carry credentials in their message or stack.
    logger.error("consultation-mail worker error", new Error("CONSULTATION_MAIL_WORKER_ERROR"));
  });
  logger.success("consultation-mail worker запущен");
}
