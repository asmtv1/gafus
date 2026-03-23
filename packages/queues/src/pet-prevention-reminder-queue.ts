import { Queue } from "bullmq";

import { connection } from "./redis.js";

export const petPreventionReminderQueue = new Queue("pet-prevention-reminder", {
  connection,
});
