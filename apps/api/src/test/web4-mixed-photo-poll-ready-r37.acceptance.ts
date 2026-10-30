/** WEB4 opt-in mixed photo+poll only: own Hono3501, WORK PG, private MinIO9500, existing Sharp worker. Never production. */
import { randomBytes, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import bcrypt from "bcryptjs";
import { DeleteObjectCommand, HeadObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@gafus/prisma";
import { createFeedStorageJobs } from "@gafus/core/services/feed";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const SCRATCH=`${ROOT}/.local-pg-scratch/web4-nonprod-s3`;
const BUCKET="gafus-refactor-web4-feed-test", API="http://127.0.0.1:3501/api/v1";
const PREFIX=`web4_r37_mixed_feed_${randomBytes(8).toString("hex")}`;
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGM4ECBHEmIY1RAwquHAcNUAADAxLhDqcDqfAAAAAElFTkSuQmCC","base64");
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
function ensure(v:unknown,name:string):asserts v{if(!v)throw Error("ASSERT_"+name);}
function pass(v:string){console.warn(`WEB4_MIXED_READY_R37_${v}=PASS`);}
interface Actor { id:string; username:string; token:string }
let owner:Actor|undefined,foreign:Actor|undefined;
let postId="",uploadId="",mediaId="",phase="preflight",s3:S3Client|undefined;
const ownKeys=new Set<string>();
async function api(path:string,method:string,token:string,payload?:unknown){
 const r=await fetch(API+path,{method,headers:{Authorization:`Bearer ${token}`,...(payload===undefined?{}:{"Content-Type":"application/json"})},
 ...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(20000)});
 return {status:r.status,data:obj(await r.json())};
}
async function actor(label:string):Promise<Actor>{
 const username=PREFIX+"_"+label,password=randomBytes(24).toString("base64url");
 const u=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),passwordSetAt:new Date(),role:"USER",registrationPending:false}});
 const r=await fetch(API+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password}),signal:AbortSignal.timeout(12000)});
 const response=obj(await r.json());const token=obj(response.data).accessToken;
 ensure(r.status===200&&typeof token==="string"&&token.length>30,"ACTUAL_SIGNED_LOGIN");
 return {id:u.id,username,token};
}
async function postForm(url:string,fields:Record<string,string>){
 const form=new FormData();for(const [k,v] of Object.entries(fields))form.append(k,v);
 form.append("file",new File([png],"synthetic.png",{type:"image/png"}));
 const result=await fetch(url,{method:"POST",body:form,signal:AbortSignal.timeout(15000)});
 ensure(result.status===204,"LOCAL_MINIO_SIGNED_POST204");
}
async function main(){
 ensure(process.env.WEB4_MIXED_READY_R37_WORK_HTTP==="1","EXPLICIT_ACCEPTANCE_ONLY");
 const cwd=realpathSync(process.cwd());ensure(realpathSync(ROOT)===ROOT&&(cwd===ROOT||cwd.startsWith(ROOT+"/")),"PHYSICAL_ROOT_ONLY");
 const db=new URL(process.env.DATABASE_URL??"");
 ensure(db.hostname==="127.0.0.1"&&db.port==="55921"&&db.pathname==="/gafus_refactor_real_work_20261024"&&db.username==="gafus_refactor_local_real","RESTRICTED_WORK_DB_ONLY");
 Object.assign(process.env,{NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",
 GAFUS_WEB4_ISOLATED_MEDIA:"1",API_PORT:"3501",
 GAFUS_ISOLATED_NONPROD_S3:"enabled",GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9500",
 GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:"gafus-refactor-documents-test",GAFUS_ISOLATED_S3_GALLERY_BUCKET:"gafus-refactor-gallery-test",
 GAFUS_ISOLATED_S3_FEED_BUCKET:BUCKET,FEED_ENABLED:"true",FEED_PROCESSOR_READY:"true",
 CLOUDRU_MEDIA_JOBS_ENABLED:"false",GALLERY_MEDIA_FALLBACK_ENABLED:"false",FEED_MEDIA_FALLBACK_ENABLED:"false",
 TMPDIR:SCRATCH+"/"});
 ensure(realpathSync(tmpdir())===SCRATCH&&realpathSync(SCRATCH)===SCRATCH,"PROJECT_SCOPED_WORKER_TMPDIR");
 const config=isolatedNonprodS3Config("feed");
 ensure(config?.endpoint==="http://127.0.0.1:9500"&&config.bucket===BUCKET,"PRIVATE_ISOLATED_S3_ONLY");
 s3=new S3Client({endpoint:config.endpoint,region:"us-east-1",forcePathStyle:true,credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},maxAttempts:1,requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"});
 ensure((await fetch("http://127.0.0.1:3501/health",{signal:AbortSignal.timeout(3500)})).status===200,"ORIGINAL_HONO_HEALTH");
 owner=await actor("owner");foreign=await actor("foreign");
 pass("GENUINE_TWO_JWT_ACTORS_WORK_SQL_LOCAL_MINIO");
 phase="source-upload";
 const created=await api("/feed/posts","POST",owner.token,{clientRequestId:randomUUID()});
 ensure(created.status===200&&created.data.success===true,"ORIGINAL_HONO_DRAFT_CREATED");
 postId=obj(created.data.data).id as string;ensure(typeof postId==="string","POST_ID");
 const reserved=await api(`/feed/posts/${postId}/uploads`,"POST",owner.token,{filename:"synthetic.png",kind:"photo",declaredMime:"image/png",declaredBytes:png.length,clientRequestId:randomUUID()});
 ensure(reserved.status===200&&reserved.data.success===true,"ORIGINAL_HONO_UPLOAD_RESERVED");
 const upload=obj(reserved.data.data);uploadId=upload.uploadId as string;mediaId=upload.mediaId as string;
 ensure(typeof uploadId==="string"&&typeof mediaId==="string","UPLOAD_MEDIA_IDS");
 const sql=await prisma.feedUpload.findUnique({where:{id:uploadId}});
 ensure(sql?.ownerId===owner.id&&sql.status==="reserved"&&sql.declaredBytes===png.length,"SOURCE_RESERVED_SQL");
 ownKeys.add(sql.sourceKey);
 ensure(typeof upload.postUrl==="string"&&new URL(upload.postUrl).origin==="http://127.0.0.1:9500","PRIVATE_SIGNED_POST_URL");
 await postForm(upload.postUrl,upload.postFields as Record<string,string>);
 const head=await s3.send(new HeadObjectCommand({Bucket:BUCKET,Key:sql.sourceKey}));
 ensure(head.ContentLength===png.length,"ACTUAL_MINIO_SOURCE_HEAD");
 const confirm=await api(`/feed/uploads/${uploadId}/complete`,"POST",owner.token,{});
 ensure(confirm.status===200&&obj(confirm.data.data).status==="uploaded","ORIGINAL_HONO_UPLOADED");
 const revision=await api(`/feed/posts/${postId}/revisions`,"PUT",owner.token,{clientRequestId:randomUUID(),expectedVersion:0,text:"AG1 real feed photo READY test",attachmentIds:[mediaId]});
 ensure(revision.status===200,"ORIGINAL_HONO_REVISION");
 // Unlike AG1 photo-only acceptance, this covers the actual mixed post+poll
 // revision and worker-driven activation of that immutable poll.
 const question="WEB4 R37 real mixed photo + poll with ready worker";
 const poll=await api(`/feed/posts/${postId}/poll`,"PUT",owner.token,{
  expectedVersion:1,question,options:[{text:"Короткие занятия",isCorrect:false},
    {text:"Длинные тренировки",isCorrect:false}],allowMultiple:false,
  isQuiz:false,isAnonymous:false,hideResults:false,shuffleOptions:false,
  explanation:null,endDate:null,
 });
 ensure(poll.status===200&&poll.data.success===true,"ORIGINAL_HONO_MIXED_POLL_SAVED");
 pass("MIXED_PHOTO_POLL_HONO_SQL_PENDING_READY_FOR_WORKER");
 const publish=await api(`/feed/posts/${postId}/publish`,"POST",owner.token,{clientRequestId:randomUUID()});
 ensure(publish.status===200,"ORIGINAL_HONO_PUBLISH_PENDING");
 ensure((await prisma.feedPost.findUnique({where:{id:postId}}))?.status==="pending","UNPROCESSED_NOT_PUBLISHED");
 ensure((await api(`/feed/posts/${postId}`,"GET",foreign.token)).status===404,"UNPROCESSED_FOREIGN404");
 pass("ORIGINAL_HONO_SOURCE_S3_POST_SQL_UPLOADED_REVISION_PENDING_PRIVATE");
 phase="existing-worker";
 const now=new Date();
 const due=await prisma.feedStorageJob.findMany({where:{OR:[{status:"pending",availableAt:{lte:now}},{status:"processing",leaseUntil:{lt:now}}]},select:{id:true,ownerId:true,kind:true,uploadId:true}});
 ensure(due.length===1&&due[0]?.ownerId===owner.id&&due[0]?.uploadId===uploadId&&due[0]?.kind==="publish_photo","NO_FOREIGN_DUE_JOB_BEFORE_CLAIM");
 const jobs=createFeedStorageJobs({db:prisma});
 const claimed=await jobs.claim(1,"photo");
 ensure(claimed.length===1&&claimed[0]?.ownerId===owner.id&&claimed[0]?.uploadId===uploadId&&claimed[0]?.kind==="publish_photo","CLAIM_ONLY_OWN_PHOTO_JOB");
 const core={
  claimJobs:(n:number,t?:"photo"|"video")=>jobs.claim(n,t),
  completeJob:(id:string,token:string,output?:Parameters<typeof jobs.complete>[2])=>jobs.complete(id,token,output),
  failJob:(id:string,token:string,code?:string)=>jobs.fail(id,token,code),
  renewJob:(id:string,token:string)=>jobs.renew(id,token),
  maintenance:async(_n:number):Promise<unknown>=>{throw Error("UNRELATED_WORKER_MAINTENANCE_NOT_AUTHORIZED");},
 };
 // Import *existing* Cloud worker at execution only. No real queue/dispatch/HTTP
 // transport: Core's original durable job + physical S3 port are used directly.
 const cloud=await import("../../../feed-cloud/src/"+"worker.ts");
 const objectModule=await import("../../../feed-cloud/src/"+"objects.ts");
 const engine=await import("../../../feed-cloud/src/"+"sharp-engine.ts");
 const worker=cloud.createFeedCloudWorker({core,objects:objectModule.createFeedCloudObjects(),engine:engine.sharpFeedEngine});
 await worker.process(claimed[0]!);
 const media=await prisma.feedMediaAsset.findUnique({where:{id:mediaId}});
 const uploaded=await prisma.feedUpload.findUnique({where:{id:uploadId}});
 const post=await prisma.feedPost.findUnique({where:{id:postId}});
 const completed=await prisma.feedStorageJob.findUnique({where:{id:claimed[0]!.id}});
 console.warn("WEB4_MIXED_READY_R37_SQL_STATES="+JSON.stringify({media:media?.status,upload:uploaded?.status,post:post?.status,job:completed?.status}));
 ensure(media?.status==="ready"&&uploaded?.status==="ready"&&post?.status==="published"&&post.activeRevisionId&&completed?.status==="completed","REAL_FEED_WORKER_SQL_PUBLISHED_READY");
 ensure(media.thumbKey&&media.fullKey&&media.thumbKey.startsWith(`posts/${owner.id}/${postId}/attachments/${mediaId}/`)&&media.fullKey.startsWith(`posts/${owner.id}/${postId}/attachments/${mediaId}/`),"OWNER_BOUND_VARIANT_KEYS");
 for(const key of [media.thumbKey,media.fullKey]){
  ownKeys.add(key);
  const meta=await s3.send(new HeadObjectCommand({Bucket:BUCKET,Key:key}));
  ensure(meta.ContentType==="image/webp"&&Number(meta.ContentLength)>0,"ACTUAL_S3_FINAL_WEBP_HEAD");
  const data=await s3.send(new GetObjectCommand({Bucket:BUCKET,Key:key}));
  ensure(Buffer.from(await data.Body!.transformToByteArray()).subarray(0,4).toString("ascii")==="RIFF","ACTUAL_S3_FINAL_WEBP_BYTES");
  ensure((await fetch(`http://127.0.0.1:9500/${BUCKET}/${key}`)).status===403,"FINAL_WEBP_ANONYMOUS403");
 }
 pass("EXISTING_SHARP_FEED_CLOUD_WORKER_S3_VARIANTS_SQL_READY_POST_PUBLISHED");
 phase="published-http";
 const visible=await api(`/feed/posts/${postId}`,"GET",foreign.token);
 ensure(visible.status===200&&visible.data.success===true,"ORIGINAL_HONO_FOREIGN_PUBLISHED200");
 const publishedPoll=await api(`/feed/posts/${postId}/poll`,"GET",foreign.token);
 const pollDto=obj(publishedPoll.data.data);
 ensure(publishedPoll.status===200&&pollDto.question===question&&
   Array.isArray(pollDto.options)&&pollDto.options.length===2,
   "ORIGINAL_HONO_MIXED_POLL_PUBLISHED_FOREIGN_READ");
 pass("ORIGINAL_HONO_MIXED_READY_PHOTO_POLL_PUBLIC_READ");
 const dto=obj(visible.data.data);
 ensure(dto.id===postId,"ORIGINAL_HONO_PUBLIC_POST_ID");
 const attachments=dto.attachments;
 ensure(Array.isArray(attachments)&&attachments.length===1,"READY_MEDIA_ATTACHED_PUBLIC");
 const att=obj(attachments[0]);
 ensure(typeof att.thumbUrl==="string"&&typeof att.fullUrl==="string","ORIGINAL_HONO_SIGNED_MEDIA_URLS");
 for(const url of [att.thumbUrl,att.fullUrl]){
  ensure(new URL(url as string).origin==="http://127.0.0.1:9500","PRIVATE_LOCAL_MEDIA_URL");
  const fetched=await fetch(url as string,{signal:AbortSignal.timeout(8000)});
  ensure(fetched.status===200&&Buffer.from(await fetched.arrayBuffer()).subarray(0,4).toString("ascii")==="RIFF","ORIGINAL_HONO_PUBLISHED_WEBP_HTTP_BYTES");
 }
 pass("ORIGINAL_HONO_FOREIGN_PUBLISHED_READY_SIGNED_MINIO_WEBP_GET");
}
async function cleanup(){
 if(owner){
  const uploads=await prisma.feedUpload.findMany({where:{ownerId:owner.id},select:{sourceKey:true}});
  const media=await prisma.feedMediaAsset.findMany({where:{ownerId:owner.id},select:{thumbKey:true,fullKey:true,posterKey:true,playlistKey:true,videoSegmentKeys:true}});
  for(const row of uploads)ownKeys.add(row.sourceKey);
  for(const row of media)for(const key of [row.thumbKey,row.fullKey,row.posterKey,row.playlistKey,...row.videoSegmentKeys])if(key)ownKeys.add(key);
 }
 if(s3&&owner&&postId){
  for(const key of ownKeys){
   if(!key.startsWith(`posts/${owner.id}/${postId}/`)){
    console.error("WEB4_MIXED_READY_R37_CLEANUP_NONOWN_KEY_REFUSED");process.exitCode=1;continue;
   }
   try{await s3.send(new DeleteObjectCommand({Bucket:BUCKET,Key:key}));
    try{await s3.send(new HeadObjectCommand({Bucket:BUCKET,Key:key}));throw Error("DELETE_NOT_VISIBLE");}
    catch(e){ensure((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"S3_OWN_DELETE_HEAD404");}
   }catch{console.error("WEB4_MIXED_READY_R37_S3_CLEANUP_REVIEW_REQUIRED");process.exitCode=1;}
  }
 }
 if(owner)await prisma.feedStorageJob.deleteMany({where:{ownerId:owner.id}});
 for(const user of [owner,foreign])if(user){
  const row=await prisma.user.findUnique({where:{id:user.id},select:{username:true}});
  if(row?.username===user.username&&user.username.startsWith(PREFIX))await prisma.user.delete({where:{id:user.id}});
 }
}
void(async()=>{try{await main();}catch(e){process.exitCode=1;
 console.error(`WEB4_MIXED_READY_R37_FAILED phase=${phase} code=${e instanceof Error&&e.message.startsWith("ASSERT_")?e.message:"REDACTED"}`);
}finally{try{await cleanup();if(owner)pass("OWN_PRIVATE_S3_AND_SQL_CLEANUP");}
 catch{process.exitCode=1;console.error("WEB4_MIXED_READY_R37_SQL_CLEANUP_REVIEW_REQUIRED");}
 s3?.destroy();await prisma.$disconnect();}})();
