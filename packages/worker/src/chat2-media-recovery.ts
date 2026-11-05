import {prisma} from "@gafus/prisma";
import {createCloudruChatPoolDispatcher} from "./cloudru-media-dispatcher.js";

/** Feed-style recovery: poll only durable due rows, launch up to two jobs per
 * kind if enough work exists. Never spin empty Cloud Jobs every minute.
 * In-memory dispatchers keep their alternating round-robin index per kind.
 */
export function createChat2MediaRecoveryTick(input:{
  database: Pick<typeof prisma,"chat2V2MediaTask">;
  video:ReturnType<typeof createCloudruChatPoolDispatcher>;
  now?:()=>Date;
}) {
  let running=false;
  return async()=>{
    if(running)return {skipped:true,dispatched:0};
    running=true;
    try{
      const now=input.now?.()??new Date();
      const grouped=await input.database.chat2V2MediaTask.groupBy({
        by:["sourceMime"],
        where:{attempts:{lt:4},sourceMime:{startsWith:"video/"},OR:[
          {status:"QUEUED",nextAttemptAt:{lte:now}},
          {status:"PROCESSING",leaseUntil:{lt:now}},
          {status:"READY",nextAttemptAt:{lte:now},
            OR:[{attemptToken:null},{leaseUntil:{lt:now}}],
            manifest:{path:["renditions"],array_contains:[{quality:720}]},
            NOT:{manifest:{path:["renditions"],array_contains:[{quality:360}]}}},
        ]},
        _count:{_all:true},
      });
      let videos=0;
      for(const item of grouped){
        if(item.sourceMime.startsWith("video/"))videos+=item._count._all;
      }
      let dispatched=0;
      for(let i=0;i<Math.min(2,videos);i++){
        const result=await input.video();
        if(result.dispatched!==1)throw Error("CHAT2_VIDEO_RECOVERY_DISPATCH_FAILED");
        dispatched++;
      }
      return {dispatched};
    }finally{running=false;}
  };
}

let recovery:ReturnType<typeof createChat2MediaRecoveryTick>|undefined;
export async function runChat2MediaRecoveryTick():Promise<void>{
  if(process.env.CLOUDRU_MEDIA_JOBS_ENABLED!=="true" ||
     process.env.CHAT2_PROCESSOR_READY!=="true" ||
     process.env.CHAT2_V2_MEDIA_ENABLED!=="true" ||
     process.env.CHAT2_V2_CORE_ENABLED!=="true")return;
  recovery??=createChat2MediaRecoveryTick({database:prisma,
    video:createCloudruChatPoolDispatcher("video")});
  await recovery();
}
