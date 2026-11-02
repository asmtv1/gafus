/** Durable PG wake-up recovery when Redis or an earlier launch was lost. */
import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { createCloudruQuestionsPhotoPoolDispatcher } from "./cloudru-media-dispatcher.js";
export function createQuestionsPhotoRecoveryTick(input:{
  database:Pick<typeof prisma,"questionV2MediaTask">;
  dispatch:ReturnType<typeof createCloudruQuestionsPhotoPoolDispatcher>;
  cleanup:()=>Promise<unknown>;
  onCleanupError?:(error:unknown)=>void;
  now?:()=>Date;
}){
  let running=false;
  return async()=>{
    if(running)return {skipped:true,dispatched:0};
    running=true;
    try{
      // Cleanup and processing are independent recovery paths. An unavailable
      // HMAC cleanup endpoint must not strand already-uploaded photos forever.
      try { await input.cleanup(); }
      catch(error){ input.onCleanupError?.(error); }
      const date=input.now?.()??new Date();
      const count=await input.database.questionV2MediaTask.count({
        where:{attempts:{lt:4},OR:[
          {status:"QUEUED",nextAttemptAt:{lte:date}},
          {status:"PROCESSING",leaseUntil:{lt:date}},
        ]},
      });
      // Do not pay for an empty Cloud execution when both PG image leases
      // are occupied. This is an optimization, not a distributed Cloud-exec cap.
      const active=await input.database.questionV2MediaTask.count({
        where:{status:"PROCESSING",leaseUntil:{gt:date}},
      });
      let dispatched=0;
      for(let i=0;i<Math.min(count,Math.max(0,2-active));i++){
        const result=await input.dispatch();
        if(result.dispatched!==1)throw Error("QUESTIONS_V2_RECOVERY_LAUNCH_FAILED");
        dispatched++;
      }
      return {dispatched};
    }finally{running=false;}
  };
}
const recoveryLogger=createWorkerLogger("questions-photo-recovery");
let tick:ReturnType<typeof createQuestionsPhotoRecoveryTick>|undefined;
export async function runQuestionsPhotoRecoveryTick(){
  if(process.env.QUESTIONS_V2_MEDIA_ENABLED!=="true" ||
      process.env.QUESTIONS_V2_PROCESSOR_READY!=="true")return;
  if(process.env.CLOUDRU_MEDIA_JOBS_ENABLED!=="true" ||
      process.env.QUESTIONS_V2_CLOUD_REFRACTOR_VERIFIED!=="true")return;
  tick??=createQuestionsPhotoRecoveryTick({
    database:prisma,dispatch:createCloudruQuestionsPhotoPoolDispatcher(),
    cleanup:questionsPhotoCleanupInternal,
    onCleanupError:error=>recoveryLogger.error("Questions V2 cleanup failed; processing recovery continues",
      error instanceof Error?error:new Error(String(error))),
  });
  await tick();
}

/** Use the same strict internal HMAC protocol as the two Cloud Jobs.
 * The API alone performs S3 deletions, preserving lease and cleanup tokens. */
export async function questionsPhotoCleanupInternal(){
  const root=process.env.QUESTIONS_V2_INTERNAL_BASE_URL;
  const secret=process.env.QUESTIONS_V2_INTERNAL_HMAC_SECRET;
  if(!root||!secret||Buffer.byteLength(secret)<32)
    throw Error("QUESTIONS_V2_RECOVERY_AUTH_NOT_CONFIGURED");
  const address=new URL(root);
  const local=process.env.GAFUS_LOCAL_ISOLATED_API==="1" &&
    ["127.0.0.1","localhost"].includes(address.hostname) &&
    address.protocol==="http:" && address.port==="3001";
  const forbidden=new Set(["gafus.ru","api.gafus.ru","www.gafus.ru",
    "gafus.app","api.gafus.app","www.gafus.app"]);
  // Production release activation explicitly pins the Questions V2 HMAC API
  // to api.gafus.ru. The old blanket ban on *.gafus.ru made cron cleanup
  // throw *before* attempting queued-job recovery, leaving jobs at 0 attempts.
  // Accept only this exact production host in the production Worker. All
  // other gafus.ru/gafus.app hosts remain forbidden, as does any HTTP origin.
  const productionApi=process.env.NODE_ENV==="production" &&
    process.env.GAFUS_LOCAL_ISOLATED_API!=="1" &&
    address.hostname==="api.gafus.ru";
  const verifiedCloud=address.protocol==="https:" && !address.port &&
    process.env.QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED==="true" &&
    process.env.QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME===address.hostname &&
    (productionApi || (!forbidden.has(address.hostname) &&
      !address.hostname.endsWith(".gafus.ru") &&
      !address.hostname.endsWith(".gafus.app")));
  if(!(local || verifiedCloud) ||
      address.pathname!=="/" || address.search || address.hash ||
      address.username || address.password)
    throw Error("QUESTIONS_V2_RECOVERY_UNSAFE_ORIGIN");
  const path="/internal/questions/media/jobs/cleanup";
  const payload=JSON.stringify({batchSize:1});
  const stamp=Math.floor(Date.now()/1000).toString();
  const nonce=randomUUID();
  const digest=createHash("sha256").update(payload).digest("hex");
  const sig=createHmac("sha256",secret)
    .update(["POST",path,stamp,nonce,digest].join("\n")).digest("hex");
  // Worker and Hono API share a private Docker network in production. The
  // verified public origin identifies the trusted HMAC audience, but the
  // transport must not depend on external DNS/TLS hairpin connectivity.
  const target=productionApi ? "http://api:3001" : address.origin;
  const res=await fetch(target+path,{
    method:"POST",redirect:"error",body:payload,signal:AbortSignal.timeout(15_000),
    headers:{"content-type":"application/json","x-questions-timestamp":stamp,
      "x-questions-nonce":nonce,"x-questions-signature":sig},
  });
  if(!res.ok){await res.body?.cancel();throw Error("QUESTIONS_V2_RECOVERY_HTTP_"+res.status);}
  await res.body?.cancel();
}
