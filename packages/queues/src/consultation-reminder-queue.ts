import { Job, Queue } from "bullmq";

import { connection } from "./redis.js";

export const consultationReminderQueue = new Queue("consultation-reminder", {
  connection,
});

export type ConsultationReminderKind = "30m" | "start";

export const CONSULTATION_REMINDER_JOB_ID = (
  bookingId: string,
  kind: ConsultationReminderKind,
): string => `consultation-remind:${bookingId}:${kind}`;

export async function removeConsultationReminderJob(bookingId: string): Promise<void> {
  for (const jobId of [
    CONSULTATION_REMINDER_JOB_ID(bookingId, "30m"),
    CONSULTATION_REMINDER_JOB_ID(bookingId, "start"),
    `consultation-remind:${bookingId}`,
  ]) {
    try {
      const job = await Job.fromId(consultationReminderQueue, jobId);
      await job?.remove();
    } catch {
      // нет job — ок
    }
  }
}
