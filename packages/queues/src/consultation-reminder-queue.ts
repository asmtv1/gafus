import { Job, Queue } from "bullmq";

import { connection } from "./redis.js";

export const consultationReminderQueue = new Queue("consultation-reminder", {
  connection,
});

export const CONSULTATION_REMINDER_JOB_ID = (bookingId: string): string => `consultation-remind:${bookingId}`;

export async function removeConsultationReminderJob(bookingId: string): Promise<void> {
  try {
    const job = await Job.fromId(consultationReminderQueue, CONSULTATION_REMINDER_JOB_ID(bookingId));
    await job?.remove();
  } catch {
    // нет job — ок
  }
}
