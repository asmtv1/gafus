import { Queue } from "bullmq";

import { connection } from "./redis.js";

export const consultationMailQueue = new Queue("consultation-mail", {
  connection,
});

export const CONSULTATION_MAIL_JOB_ID = (emailLogId: string): string => `mail:${emailLogId}`;
