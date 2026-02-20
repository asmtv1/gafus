import { Queue } from "bullmq";

import { connection } from "./redis.js";

export const consentLogCleanupQueue = new Queue("consent-log-cleanup", {
  connection,
});
