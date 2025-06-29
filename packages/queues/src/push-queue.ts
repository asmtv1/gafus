import { Queue } from "bullmq";
import { connection } from "@queues/redis";

// Название очереди — «push»
export const pushQueue = new Queue("push", { connection });
// Отвечает за повторные попытки, автоматическую перезапись «застрявших» задач и т.п.
