import { Queue } from "bullmq";
import { connection } from "./redis.js";
/** Redis wakes workers. PostgreSQL grants the exclusive processing lease. */
export const QUESTIONS_MEDIA_PROCESSING_QUEUE_NAME="questions-v2-photo-trigger";
export interface QuestionsMediaJobData { mediaId:string }
export const questionsMediaProcessingQueue=new Queue<QuestionsMediaJobData>(
  QUESTIONS_MEDIA_PROCESSING_QUEUE_NAME,{connection});
export async function enqueueQuestionsPhoto(mediaId:string):Promise<void>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mediaId))
    throw Error("QUESTIONS_V2_INVALID_WAKE");
  await questionsMediaProcessingQueue.add("wake",{mediaId},{
    jobId:"questions-"+mediaId,attempts:5,
    backoff:{type:"exponential",delay:3000},
    removeOnComplete:true,removeOnFail:{count:500},
  });
}
