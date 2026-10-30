/** Questions-only Docker image for the existing Cloud Job, allowing two executions. */
import { createQuestionsV2JobCore } from "./questions-v2-job-core.js";
import { createQuestionsV2JobRunner } from "./questions-v2-job-runner.js";
import { createQuestionsV2S3Objects } from "./questions-v2-s3-objects.js";
async function main(){
  const e=process.env;
  if(e.QUESTIONS_V2_JOB_ENABLED!=="true" ||
      e.QUESTIONS_V2_MEDIA_ENABLED!=="true" ||
      e.QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED!=="true" ||
      !e.QUESTIONS_V2_INTERNAL_BASE_URL ||
      !e.QUESTIONS_V2_INTERNAL_HMAC_SECRET ||
      Buffer.byteLength(e.QUESTIONS_V2_INTERNAL_HMAC_SECRET)<32)
    throw Error("QUESTIONS_V2_JOB_CONFIG_NOT_VERIFIED");
  const core=createQuestionsV2JobCore({
    baseUrl:e.QUESTIONS_V2_INTERNAL_BASE_URL,
    secret:Buffer.from(e.QUESTIONS_V2_INTERNAL_HMAC_SECRET),
  });
  const run=createQuestionsV2JobRunner({core,objectsFor:createQuestionsV2S3Objects});
  const count=await run();
  console.log(count?"QUESTIONS_V2_PHOTO_PROCESSED=1":"QUESTIONS_V2_PHOTO_IDLE=1");
}
main().catch(()=>{console.error("QUESTIONS_V2_PHOTO_JOB_FAILED");process.exitCode=1;});
