import { Job, Queue } from "bullmq";

import { connection } from "./redis.js";

export const consultationSlaQueue = new Queue("consultation-sla", {
  connection,
});

export const CONSULTATION_SLA_JOB_ID = (bookingId: string): string => `sla:${bookingId}`;

/** Удаляет отложенную SLA-задачу по bookingId (для вызова из @gafus/core без прямого импорта bullmq). */
export async function removeConsultationSlaJob(bookingId: string): Promise<void> {
  const job = await Job.fromId(consultationSlaQueue, CONSULTATION_SLA_JOB_ID(bookingId));
  await job?.remove();
}
