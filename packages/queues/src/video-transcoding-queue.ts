import { Queue } from "bullmq";

import { connection } from "./redis.js";

/**
 * Очередь для транскодирования видео в HLS формат
 */
export const videoTranscodingQueue = new Queue("video-transcoding", { connection });
