import { Queue } from "bullmq";
import { connection } from "./redis.js";

/** Refactor Chat2 media-only wake-ups; Core/Prisma leases remain authoritative. */
export const CHAT2_MEDIA_PROCESSING_QUEUE_NAME = "chat2-media-v2-processing-trigger";
export type Chat2MediaProcessingKind = "photo" | "video";
export interface Chat2MediaProcessingJobData {
  mediaId: string;
  kind: Chat2MediaProcessingKind;
}
export const chat2MediaProcessingQueue = new Queue<Chat2MediaProcessingJobData>(
  CHAT2_MEDIA_PROCESSING_QUEUE_NAME, {connection},
);
export async function enqueueChat2MediaProcessing(mediaId:string,kind:Chat2MediaProcessingKind):Promise<void>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mediaId) ||
      (kind!=="photo"&&kind!=="video"))throw Error("CHAT2_INVALID_WAKEUP");
  await chat2MediaProcessingQueue.add("wake",{mediaId,kind},{
    jobId:`chat2-${mediaId}`,attempts:5,
    backoff:{type:"exponential",delay:3000},
    removeOnComplete:true,removeOnFail:{count:500},
  });
}
