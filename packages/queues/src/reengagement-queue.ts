import { Queue } from "bullmq";

import { connection } from "./redis.js";

// Очередь для re-engagement уведомлений
export const reengagementQueue = new Queue("reengagement", { connection });
