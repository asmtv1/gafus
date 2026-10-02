import { Queue } from "bullmq";
import { connection } from "./redis.js";
export const cynologistChatQueue = new Queue("cynologist-chat", { connection });
