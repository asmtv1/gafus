/** One photo per Cloud.ru execution. Two independent instances share DB leases. */
import { questionsV2ValidateJob,type QuestionsV2Job } from "@gafus/feed-cloud";
import { processQuestionsV2Photo,type QuestionsV2Objects } from "./questions-v2-processor.js";
import type { QuestionsV2Core } from "./questions-v2-job-core.js";
export type QuestionsV2Claim=QuestionsV2Job & {photoId:string;attemptToken:string;leaseUntil:string};
export function createQuestionsV2JobRunner(input:{
  core:QuestionsV2Core;
  objectsFor(job:QuestionsV2Claim):QuestionsV2Objects & {close?:()=>void};
  now?:()=>number;
  process?:typeof processQuestionsV2Photo;
}){
  const now=input.now??Date.now;
  return async function runOnce():Promise<number>{
    const job=await input.core.claimOne();
    if(!job)return 0;
    questionsV2ValidateJob(job);
    if(!/^[0-9a-f-]{36}$/i.test(job.attemptToken)||
        !Number.isFinite(Date.parse(job.leaseUntil))||
        Date.parse(job.leaseUntil)<=now())
      throw Error("QUESTIONS_V2_INVALID_LEASE");
    const controller=new AbortController();
    let renewing=false,submitting=false;
    const timeout=setTimeout(()=>controller.abort(),225_000);
    const heartbeat=setInterval(()=>{
      if(renewing||controller.signal.aborted)return;
      renewing=true;
      void input.core.renew(job.mediaId,job.attemptToken)
        .then(result=>{if(!result.accepted)controller.abort();})
        .catch(()=>controller.abort()).finally(()=>{renewing=false;});
    },30_000);
    const objects=input.objectsFor(job);
    try{
      const manifest=await (input.process??processQuestionsV2Photo)(job,objects,controller.signal);
      controller.signal.throwIfAborted();
      submitting=true;
      const ack=await input.core.complete(job.mediaId,job.attemptToken,manifest);
      if(!ack.accepted)throw Error("QUESTIONS_V2_COMPLETION_REJECTED");
      return 1;
    }catch(error){
      // After a lost completion ACK, never mark READY as failed or remove
      // its bytes: Core may already have committed the manifest.
      if(!submitting)await input.core.fail(job.mediaId,job.attemptToken,
        "QUESTIONS_V2_PROCESSING_FAILED").catch(()=>undefined);
      throw error;
    }finally{
      clearTimeout(timeout);clearInterval(heartbeat);controller.abort();
      objects.close?.();
    }
  };
}
