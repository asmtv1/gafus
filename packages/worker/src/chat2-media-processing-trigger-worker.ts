import {Worker,type Job} from "bullmq";
import {connection,CHAT2_MEDIA_PROCESSING_QUEUE_NAME,
  type Chat2MediaProcessingJobData} from "@gafus/queues";
import {createWorkerLogger} from "@gafus/logger";
import {createCloudruChatPoolDispatcher} from "./cloudru-media-dispatcher.js";

const logger=createWorkerLogger("chat2-media-processing-trigger");
/** Only activate after BOTH chat pools, isolated Core and storage are verified.
 * Mirrors Feed: bounded serial launch requests, 2 independent jobs per kind.
 */
export function startChat2MediaProcessingTriggerWorker():void{
  if(process.env.CLOUDRU_MEDIA_JOBS_ENABLED!=="true" ||
     process.env.CHAT2_PROCESSOR_READY!=="true" ||
     process.env.CHAT2_V2_CORE_ENABLED!=="true" ||
     process.env.CHAT2_V2_MEDIA_ENABLED!=="true")return;
  let video:ReturnType<typeof createCloudruChatPoolDispatcher>;
  try{video=createCloudruChatPoolDispatcher("video");}
  catch{logger.error("Chat2 Cloud pool unavailable",Error("CHAT2_DISPATCH_CONFIG"));return;}
  const worker=new Worker<Chat2MediaProcessingJobData>(
    CHAT2_MEDIA_PROCESSING_QUEUE_NAME,
    async(job:Job<Chat2MediaProcessingJobData>)=>{
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.data.mediaId))
        throw Error("CHAT2_INVALID_WAKE_ID");
      if(job.data.kind!=="video")throw Error("CHAT2_RETIRED_PHOTO_WAKE");
      const result=await video();
      if(result.dispatched!==1)throw Error("CHAT2_WAKE_NOT_DISPATCHED");
    },
    {connection,concurrency:1,limiter:{max:1,duration:500},
      removeOnComplete:{count:100},removeOnFail:{count:500}},
  );
  worker.on("failed",(_job,error)=>logger.error("Chat2 media wake failed",error));
  worker.on("error",error=>logger.error("Chat2 media wake worker error",error));
  logger.success("Chat2 media immediate wake worker started");
}
