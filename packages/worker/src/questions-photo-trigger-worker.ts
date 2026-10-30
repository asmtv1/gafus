/** Questions Photo V2 BullMQ wake-ups, never processes bytes in Redis. */
import { Worker,type Job } from "bullmq";
import { connection,QUESTIONS_MEDIA_PROCESSING_QUEUE_NAME,
  type QuestionsMediaJobData } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import { createCloudruQuestionsPhotoPoolDispatcher } from "./cloudru-media-dispatcher.js";
const logger=createWorkerLogger("questions-photo-trigger");
/**
 * A duplicate/stale Redis notification is only a hint. A read of the PG
 * source-of-truth avoids launching an empty Cloud job for READY/FAILED media.
 */
export function createQuestionsPhotoWakeHandler(input:{
  database:Pick<typeof prisma,"questionV2MediaTask">;
  dispatch:ReturnType<typeof createCloudruQuestionsPhotoPoolDispatcher>;
  now?:()=>Date;
}){
  return async(mediaId:string)=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mediaId))
      throw Error("QUESTIONS_V2_WAKE_INVALID_ID");
    const task=await input.database.questionV2MediaTask.findUnique({
      where:{mediaId},
      select:{status:true,attempts:true,nextAttemptAt:true,leaseUntil:true},
    });
    const now=input.now?.()??new Date();
    const due=task && task.attempts<4 &&
      ((task.status==="QUEUED" && task.nextAttemptAt<=now) ||
       (task.status==="PROCESSING" && task.leaseUntil && task.leaseUntil<now));
    if(!due)return {dispatched:0};
    // Active photo leases are an optimization to avoid empty Cloud invocations.
    // The authoritative, cross-instance hard cap is enforced by PG claimOne.
    const active=await input.database.questionV2MediaTask.count({
      where:{status:"PROCESSING",leaseUntil:{gt:now}},
    });
    if(active>=2)return {dispatched:0};
    const answer=await input.dispatch();
    if(answer.dispatched!==1)throw Error("QUESTIONS_V2_JOB_LAUNCH_FAILED");
    return {dispatched:1};
  };
}
export function startQuestionsPhotoTriggerWorker(){
  if(process.env.QUESTIONS_V2_MEDIA_ENABLED!=="true" ||
      process.env.QUESTIONS_V2_PROCESSOR_READY!=="true" ||
      process.env.QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED!=="true" ||
      process.env.QUESTIONS_V2_CLOUD_REFRACTOR_VERIFIED!=="true" ||
      process.env.CLOUDRU_MEDIA_JOBS_ENABLED!=="true")return;
  const handle=createQuestionsPhotoWakeHandler({
    database:prisma,dispatch:createCloudruQuestionsPhotoPoolDispatcher(),
  });
  const worker=new Worker<QuestionsMediaJobData>(QUESTIONS_MEDIA_PROCESSING_QUEUE_NAME,
    async(job:Job<QuestionsMediaJobData>)=>{
      await handle(job.data.mediaId);
    },{connection,concurrency:1,limiter:{max:2,duration:500},
      removeOnComplete:{count:100},removeOnFail:{count:500}});
  worker.on("error",error=>logger.error("Questions Photo V2 wake failed",error));
  worker.on("failed",(_job,error)=>logger.error("Questions Photo V2 job launch failed",error));
  logger.success("Questions Photo V2 trigger enabled");
}
