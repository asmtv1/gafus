/** New-owned original Hono upload/cancel -> exact one Core delete lease -> existing Feed S3 worker, no foreign queue drain. */
import { randomBytes, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import bcrypt from "bcryptjs";
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@gafus/prisma";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor", SCRATCH=ROOT+"/.local-pg-scratch/nonprod-s3";
const BUCKET="gafus-refactor-feed-test", API="http://127.0.0.1:3001/api/v1";
const PREFIX=`ag1_scoped_feed_retired_${randomBytes(7).toString("hex")}`;
const image=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGM4ECBHEmIY1RAwquHAcNUAADAxLhDqcDqfAAAAAElFTkSuQmCC","base64");
const asObj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
function assert(v:unknown,why:string):asserts v{if(!v)throw Error("ASSERT_"+why);}
function pass(s:string){console.warn("AG1_SCOPED_FEED_DELETE_REAL_"+s+"=PASS");}
let userId="",username="",postId="",uploadId="",sourceKey="",token="",s3:S3Client|undefined;
let phase="preflight",actualDone=false;
async function http(path:string,method:string,body?:unknown){
 const r=await fetch(API+path,{method,headers:{Authorization:"Bearer "+token,...(body===undefined?{}:{"Content-Type":"application/json"})},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 return {status:r.status,data:asObj(await r.json())};
}
async function main(){
 assert(process.env.AG1_SCOPED_OWN_FEED_DELETE_WORK==="1","EXPLICIT_WORK_FIXTURE_ONLY");
 assert(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd()).startsWith(ROOT+"/")&&
  realpathSync(tmpdir())===SCRATCH,"PHYSICAL_PROJECT_TMP_ONLY");
 const url=new URL(process.env.DATABASE_URL??"");
 assert(url.hostname==="127.0.0.1"&&url.port==="55921"&&url.pathname==="/gafus_refactor_real_work_20261024"&&
  url.username==="gafus_refactor_local_real","WORK_DATABASE_ONLY");
 Object.assign(process.env,{NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",
 GAFUS_ISOLATED_NONPROD_S3:"enabled",GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9000",
 GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:"gafus-refactor-documents-test",
 GAFUS_ISOLATED_S3_QUESTIONS_BUCKET:"gafus-refactor-questions-test",
 GAFUS_ISOLATED_S3_GALLERY_BUCKET:"gafus-refactor-gallery-test",
 GAFUS_ISOLATED_S3_FEED_BUCKET:BUCKET,
 FEED_ENABLED:"true",FEED_PROCESSOR_READY:"true",CLOUDRU_MEDIA_JOBS_ENABLED:"false",
 FEED_MEDIA_FALLBACK_ENABLED:"false",GALLERY_MEDIA_FALLBACK_ENABLED:"false"});
 const config=isolatedNonprodS3Config("feed");
 assert(config?.bucket===BUCKET&&config.endpoint==="http://127.0.0.1:9000","NONPROD_FEED_ONLY");
 s3=new S3Client({endpoint:config.endpoint,region:"us-east-1",forcePathStyle:true,
 credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},maxAttempts:1});
 assert((await fetch("http://127.0.0.1:3001/ready")).status===200,"ORIGINAL_HONO_READY");
 username=PREFIX+"_owner";
 const password=randomBytes(24).toString("base64url");
 const user=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),role:"USER",
 passwordSetAt:new Date(),registrationPending:false}});
 userId=user.id;
 const login=await fetch(API+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},
 body:JSON.stringify({username,password}),signal:AbortSignal.timeout(12000)});
 const value=asObj(await login.json());token=asObj(value.data).accessToken as string;
 assert(login.status===200&&typeof token==="string"&&token.length>30,"GENUINE_JWT_LOGIN");
 phase="original-hono-photo-reserve";
 const created=await http("/feed/posts","POST",{clientRequestId:randomUUID()});
 assert(created.status===200,"GENUINE_HONO_DRAFT");
 postId=asObj(created.data.data).id as string;assert(typeof postId==="string","POST_ID");
 const reserved=await http(`/feed/posts/${postId}/uploads`,"POST",{
  filename:"ag1-cleanup-own-only.png",kind:"photo",declaredMime:"image/png",
  declaredBytes:image.length,clientRequestId:randomUUID()});
 assert(reserved.status===200,"GENUINE_HONO_RESERVE");
 const r=asObj(reserved.data.data);uploadId=r.uploadId as string;
 assert(typeof uploadId==="string","UPLOAD_ID");
 const u=await prisma.feedUpload.findUnique({where:{id:uploadId}});
 assert(u?.ownerId===userId&&u.postId===postId&&u.status==="reserved","REAL_OWN_UPLOAD_SQL");
 sourceKey=u.sourceKey;
 assert(sourceKey.startsWith(`posts/${userId}/${postId}/incoming/${uploadId}/`),"OWN_BUCKET_SOURCE_PREFIX");
 const form=new FormData();for(const [k,v] of Object.entries(r.postFields as Record<string,string>))form.append(k,v);
 form.append("file",new File([image],"ag1-cleanup-own-only.png",{type:"image/png"}));
 assert(typeof r.postUrl==="string"&&new URL(r.postUrl).origin==="http://127.0.0.1:9000","LOCAL_SIGNED_FORM");
 const sent=await fetch(r.postUrl,{method:"POST",body:form,signal:AbortSignal.timeout(12000)});
 assert(sent.status===204,"ACTUAL_PRIVATE_MINIO_POST204");
 const head=await s3.send(new HeadObjectCommand({Bucket:BUCKET,Key:sourceKey}));
 assert(head.ContentLength===image.length&&head.ContentType==="image/png","REAL_MINIO_PHOTO_SOURCE_BYTES");
 pass("ORIGINAL_HONO_RESERVED_PHOTO_SIGNED_S3_POST_AND_WORK_SQL");
 phase="original-hono-retire-upload";
 const cancelled=await http(`/feed/uploads/${uploadId}`,"DELETE");
 assert(cancelled.status===200&&asObj(cancelled.data.data).status==="cancelled","ORIGINAL_HONO_UPLOAD_CANCELLED");
 const jobs=await prisma.feedStorageJob.findMany({where:{uploadId,ownerId:userId,kind:"delete_keys"}});
 assert(jobs.length===1&&jobs[0]?.status==="pending"&&jobs[0].sourceKeys.length===1&&
 jobs[0].sourceKeys[0]===sourceKey&&jobs[0].postId===postId,"ORIGINAL_WORK_SQL_DURABLE_OWN_DELETE_JOB");
 const job=jobs[0];
 pass("ORIGINAL_HONO_DELETE_CREATES_EXACT_OWN_RETIRED_QUEUE_JOB");
 phase="exact-core-job-claim";
 const module=await import("../../../../packages/core/src/services/feed/"+"jobs.ts");
 const coreJobs=module.createFeedStorageJobs({db:prisma});
 const wrong=await coreJobs.claim(1,"photo",{jobId:job.id,ownerId:"not_this_actor",kind:"delete_keys"});
 assert(wrong.length===0&&
  (await prisma.feedStorageJob.findUnique({where:{id:job.id}}))?.status==="pending","WRONG_OWNER_CANNOT_CLAIM_OWN_JOB");
 const claim=await coreJobs.claim(1,"photo",{jobId:job.id,ownerId:userId,kind:"delete_keys"});
 assert(claim.length===1&&claim[0]?.id===job.id&&claim[0].ownerId===userId&&
 claim[0].sourceKeys.length===1&&claim[0].sourceKeys[0]===sourceKey,"EXACT_OWN_JOB_CLAIM_ONLY");
 pass("EXACT_ATOMIC_SOURCE_CLAIM_OWNER_JOB_KIND_NO_FOREIGN_DRAIN");
 phase="actual-original-s3-worker";
 const [workerModule,objModule,sharpModule]=await Promise.all([
  import("../../../feed-cloud/src/"+"worker.ts"),
  import("../../../feed-cloud/src/"+"objects.ts"),
  import("../../../feed-cloud/src/"+"sharp-engine.ts"),
 ]);
 const bridge={claimJobs:(n:number,t?:"photo"|"video")=>coreJobs.claim(n,t),
  completeJob:(id:string,attempt:string,output?:Parameters<typeof coreJobs.complete>[2])=>coreJobs.complete(id,attempt,output),
  failJob:(id:string,attempt:string,code?:string)=>coreJobs.fail(id,attempt,code),
  renewJob:(id:string,attempt:string)=>coreJobs.renew(id,attempt),
  maintenance:async()=>{throw Error("GLOBAL_MAINTENANCE_NOT_PERMITTED");}};
 const worker=workerModule.createFeedCloudWorker({core:bridge,
  objects:objModule.createFeedCloudObjects(),engine:sharpModule.sharpFeedEngine});
 const result=await worker.process(claim[0]!);
 assert(asObj(result).accepted===true,"ORIGINAL_WORKER_COMPLETION_ACCEPTED");
 const committed=await prisma.feedStorageJob.findUnique({where:{id:job.id}});
 assert(committed?.status==="completed"&&committed.attemptToken===null,"PHYSICAL_DURABLE_JOB_COMPLETED");
 try{await s3.send(new HeadObjectCommand({Bucket:BUCKET,Key:sourceKey}));throw Error("S3_DELETE_NOT_VISIBLE");}
 catch(e){assert((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"PHYSICAL_S3_HEAD404_AFTER_EXISTING_WORKER");}
 assert((await prisma.feedUpload.findUnique({where:{id:uploadId}}))?.status==="cancelled","NO_UPLOAD_RESURRECTION");
 actualDone=true;
 pass("EXISTING_FEED_CLOUD_DELETE_S3_HEAD404_SQL_COMPLETED_CANCELLED_REMAINS");
}
async function cleanup(){
 if(sourceKey&&s3&&userId&&postId&&uploadId){
  if(!sourceKey.startsWith(`posts/${userId}/${postId}/incoming/${uploadId}/`)){
   console.error("AG1_SCOPED_FEED_CLEANUP_REJECT_FOREIGN_KEY");process.exitCode=1;
  } else if(!actualDone){
   // Only after an acceptance failure; never include historical prefixes.
   await s3.send(new DeleteObjectCommand({Bucket:BUCKET,Key:sourceKey})).catch(()=>{process.exitCode=1;});
  }
 }
 if(userId){
  await prisma.feedStorageJob.deleteMany({where:{ownerId:userId}});
  const u=await prisma.user.findUnique({where:{id:userId},select:{username:true}});
  if(u?.username===username&&username.startsWith(PREFIX))await prisma.user.delete({where:{id:userId}});
 }
}
void(async()=>{try{await main();}
 catch(e){process.exitCode=1;console.error("AG1_SCOPED_FEED_REAL_FAILED_PHASE="+phase+" CODE="+(e instanceof Error&&e.message.startsWith("ASSERT_")?e.message:"REDACTED"));}
 finally{try{await cleanup();if(userId)pass("SYNTHETIC_OWN_SQL_S3_CLEANUP");}catch{process.exitCode=1;console.error("AG1_SCOPED_FEED_RECOVERY_REVIEW_REQUIRED");}
 s3?.destroy();await prisma.$disconnect();}})();
