/** One-shot Cloud.ru worker for CHAT VIDEO only. Client WebP photo Jobs are retired. */
import { S3Client } from "@aws-sdk/client-s3";
import { createChat2JobRunner, chat2SafeErrorCategory, chat2SafeErrorStatus } from "./chat2-job-runner.js";
import { createChat2JobCore } from "./chat2-job-core.js";
import { createChat2S3Objects, CHAT2_CLOUD_BUCKET } from "./chat2-s3-objects.js";
import { sharpFeedEngine } from "./sharp-engine.js";

async function main() {
  const env=process.env;
  if(env.CHAT2_JOB_ENABLED!=="true" || env.CHAT2_JOB_KIND!=="video" ||
      env.CHAT2_S3_BUCKET!==CHAT2_CLOUD_BUCKET ||
      env.CHAT2_S3_ENDPOINT!=="https://s3.cloud.ru" ||
      !env.CHAT2_S3_ACCESS_KEY_ID || !env.CHAT2_S3_SECRET_ACCESS_KEY ||
      !env.CHAT2_INTERNAL_BASE_URL || !env.CHAT2_INTERNAL_HMAC_SECRET ||
      Buffer.byteLength(env.CHAT2_INTERNAL_HMAC_SECRET)<32 || !env.CHAT2_JOB_WORK_ROOT)
    throw Error("CHAT2_JOB_ENV_NOT_READY");
  const client=new S3Client({
    endpoint:env.CHAT2_S3_ENDPOINT,region:"ru-central-1",forcePathStyle:true,
 requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED",maxAttempts:2,
    credentials:{accessKeyId:env.CHAT2_S3_ACCESS_KEY_ID,secretAccessKey:env.CHAT2_S3_SECRET_ACCESS_KEY},
  });
  try {
    const core=createChat2JobCore({baseUrl:env.CHAT2_INTERNAL_BASE_URL,
      secret:Buffer.from(env.CHAT2_INTERNAL_HMAC_SECRET,"utf8")});
    const run=createChat2JobRunner({
      core,kind:"video",engine:sharpFeedEngine,workRoot:env.CHAT2_JOB_WORK_ROOT,
      objectsFor:(job)=>createChat2S3Objects(job,client),
      onFailure:failure=>console.error("CHAT2_360_FAILURE",JSON.stringify(failure)),
    });
    const count=await run();
    console.log(count ? "CHAT2_JOB_PROCESSED=1" : "CHAT2_JOB_IDLE=1");
  }finally{client.destroy();}
}
main().catch(error=>{
  console.error("CHAT2_JOB_FAILED",JSON.stringify({category:chat2SafeErrorCategory(error),
    status:chat2SafeErrorStatus(error)}));
  process.exitCode=1;
});
