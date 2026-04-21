import { Queue } from "bullmq";

import { connection } from "./redis.js";

export const consultationSlaQueue = new Queue("consultation-sla", {
  connection,
});

export const CONSULTATION_SLA_JOB_ID = (bookingId: string): string => `sla:${bookingId}`;
