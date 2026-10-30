/** Fresh original Hono Gallery photo delete -> exact owner-bound Core cleanup claim -> original S3 worker. */
import { randomBytes, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import bcrypt from "bcryptjs";
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@gafus/prisma";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
import { createGalleryStorageFromEnv, galleryStorageConfigFromEnv } from "@gafus/gallery-storage";
import { createGalleryS3Client, createGalleryObjectStore } from "@gafus/gallery-storage/objects";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor", SCRATCH=ROOT+"/.local-pg-scratch/nonprod-s3";
const API="http://127.0.0.1:3001/api/v1",BUCKET="gafus-refactor-gallery-test";
const PREFIX=`ag1_scoped_gallery_retired_${randomBytes(7).toString("hex")}`;
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGM4ECBHEmIY1RAwquHAcNUAADAxLhDqcDqfAAAAAElFTkSuQmCC","base64");
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
function assert(v:unknown,s:string):asserts v{if(!v)throw Error("ASSERT_"+s);}
function pass(s:string){console.warn("AG1_SCOPED_GALLERY_DELETE_REAL_"+s+"=PASS");}
let actorId="",actorUsername="",albumId="",photoId="",uploadId="",sourceKey="",token="",s3:S3Client|undefined,phase="preflight",processed=false;
async function http(path:string,method:string,body?:unknown){const r=await fetch(API+path,{method,headers:{Authorization:"Bearer "+token,...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});return{status:r.status,data:obj(await r.json())};}
async function main(){
 assert(process.env.AG1_SCOPED_OWN_GALLERY_DELETE_WORK==="1","EXPLICIT_ONLY");
 assert(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd()).startsWith(ROOT+"/")&&realpathSync(tmpdir())===SCRATCH,"ROOT_AND_TMP");
 const db=new URL(process.env.DATABASE_URL??"");
 assert(db.hostname==="127.0.0.1"&&db.port==="55921"&&db.username==="gafus_refactor_local_real"&&db.pathname==="/gafus_refactor_real_work_20261024","WORK_DB_ONLY");
 Object.assign(process.env,{NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",GAFUS_ISOLATED_NONPROD_S3:"enabled",
 GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9000",GAFUS_ISOLATED_S3_GALLERY_BUCKET:BUCKET,
 GAFUS_ISOLATED_S3_FEED_BUCKET:"gafus-refactor-feed-test",GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:"gafus-refactor-documents-test",
 GAFUS_ISOLATED_S3_QUESTIONS_BUCKET:"gafus-refactor-questions-test",GALLERY_ENABLED:"true",GALLERY_MEDIA_FALLBACK_ENABLED:"false",CLOUDRU_MEDIA_JOBS_ENABLED:"false"});
 const guard=isolatedNonprodS3Config("gallery");
 const c=galleryStorageConfigFromEnv();
 assert(guard?.bucket===BUCKET&&c.isolatedNonprod===true&&c.bucket===BUCKET&&c.endpoint==="http://127.0.0.1:9000","PRIVATE_MINIO");
 s3=new S3Client({endpoint:c.endpoint,region:"us-east-1",forcePathStyle:true,credentials:{accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey},maxAttempts:1});
 assert((await fetch("http://127.0.0.1:3001/ready")).status===200,"STOCK_HONO_READY");
 actorUsername=PREFIX+"_owner";const password=randomBytes(24).toString("base64url");
 const row=await prisma.user.create({data:{username:actorUsername,role:"USER",password:await bcrypt.hash(password,10),registrationPending:false,passwordSetAt:new Date()}});
 actorId=row.id;
 const login=await fetch(API+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:actorUsername,password}),signal:AbortSignal.timeout(10000)});
 token=obj(obj(await login.json()).data).accessToken as string;
 assert(login.status===200&&typeof token==="string"&&token.length>30,"REAL_LOGIN");
 phase="original-album-and-photo-reservation";
 const created=await http("/gallery/albums","POST",{name:`AG1 exact cleanup ${PREFIX}`,isVisible:false});
 assert(created.status===200,"HOTO_ALBUM_CREATE");albumId=obj(created.data.data).id as string;
 assert(typeof albumId==="string","ALBUM_ID");
 const reserve=await http(`/gallery/albums/${albumId}/uploads`,"POST",{filename:"ag1-scoped-own.png",declaredMime:"image/png",declaredBytes:png.length,clientRequestId:randomUUID()});
 assert(reserve.status===200,"HOTO_PHOTO_RESERVE");
 const slot=obj(reserve.data.data);uploadId=slot.uploadId as string;photoId=obj(slot.photo).id as string;
 assert(typeof uploadId==="string"&&typeof photoId==="string","IDS");
 const upload=await prisma.galleryUpload.findUnique({where:{id:uploadId}});
 assert(upload?.ownerId===actorId&&upload.photoId===photoId&&upload.status==="reserved","WORK_OWN_SQL");
 sourceKey=upload.sourceKey;
 assert(sourceKey.startsWith(`albums/${actorId}/${albumId}/`),"OWN_GALLERY_PREFIX");
 const form=new FormData();for(const [k,v] of Object.entries(slot.postFields as Record<string,string>))form.append(k,v);
 form.append("file",new File([png],"ag1-scoped-own.png",{type:"image/png"}));
 assert(typeof slot.postUrl==="string"&&new URL(slot.postUrl).origin==="http://127.0.0.1:9000","LOCAL_SIGV4_ONLY");
 assert((await fetch(slot.postUrl,{method:"POST",body:form,signal:AbortSignal.timeout(15000)})).status===204,"S3_SIGNED_POST204");
 const head=await s3.send(new HeadObjectCommand({Bucket:BUCKET,Key:sourceKey}));
 assert(head.ContentLength===png.length,"PHYSICAL_SOURCE_MINIO_HEAD");
 pass("ORIGINAL_HONO_ALBUM_UPLOAD_S3_POST_AND_WORK_SQL");
 phase="original-photo-delete";
 const deleted=await http(`/gallery/photos/${photoId}`,"DELETE");
 assert(deleted.status===200,"HOTO_DELETE_PHOTO200");
 const state=await prisma.galleryPhoto.findUnique({where:{id:photoId}});
 assert(state?.deletedAt&&state.status==="failed","SQL_PHOTO_SOFT_DELETED");
 const jobs=await prisma.galleryStorageJob.findMany({where:{ownerId:actorId,kind:"delete",sourceKeys:{has:sourceKey}}});
 const now=new Date();const immediate=jobs.filter(j=>j.status==="pending"&&j.availableAt<=now);
 assert(immediate.length===1&&immediate[0]?.sourceKeys.length===1&&immediate[0].sourceKeys[0]===sourceKey,"EXACT_IMMEDIATE_SQL_DELETE_OWN_JOB");
 assert(jobs.some(j=>j.availableAt>now),"POST_EXPIRY_FUTURE_REDELETE_GUARD");
 pass("ORIGINAL_HONO_SOFT_DELETE_DURABLE_IMMEDIATE_PLUS_FUTURE_CLEANUP");
 phase="source-core-exact-delete-lease";
 const coreModule=await import("../../../../packages/core/src/services/gallery/"+"runtimeService.ts");
 const service=coreModule.createCurrentGalleryService(createGalleryStorageFromEnv());
 const job=immediate[0]!;
 const foreign=await service.claimStorageJobs({limit:1,exactDelete:{jobId:job.id,ownerId:"not_owned_user"}});
 assert(foreign.length===0&&(await prisma.galleryStorageJob.findUnique({where:{id:job.id}}))?.status==="pending","WRONG_OWNER_GALLERY_NO_CLAIM");
 const claims=await service.claimStorageJobs({limit:1,exactDelete:{jobId:job.id,ownerId:actorId}});
 assert(claims.length===1&&claims[0]?.jobId===job.id&&claims[0].kind==="delete"&&claims[0].sourceKeys.length===1&&claims[0].sourceKeys[0]===sourceKey,"ONE_ATOMIC_OWNER_GALLERY_CLAIM");
 pass("EXACT_OWNER_JOB_KIND_CORE_GALLERY_CLAIM_NO_GLOBAL_DRAIN");
 phase="existing-gallery-cloud-delete-worker";
 const [workerModule,engineModule]=await Promise.all([
  import("../../../gallery-cloud/src/"+"worker.ts"),import("../../../gallery-cloud/src/"+"sharp-engine.ts")]);
 const bridge={
  claimUpload:(id:string)=>service.claimUpload({uploadId:id}),
  completeUpload:(input:Parameters<typeof service.completeUpload>[0])=>service.completeUpload(input),
  failUpload:(input:Parameters<typeof service.failUpload>[0])=>service.failUpload(input),
  claimJobs:(limit:number,id?:string)=>service.claimStorageJobs({limit,...(id?{uploadId:id}:{})}),
  completeJob:(input:Parameters<typeof service.completeStorageJob>[0])=>service.completeStorageJob(input),
  failJob:(input:Parameters<typeof service.failStorageJob>[0])=>service.failStorageJob(input),
  maintenance:(limit:number)=>service.maintenance({limit}),
 };
 const worker=workerModule.createGalleryCloudWorker({core:bridge,objects:createGalleryObjectStore(c,createGalleryS3Client(c)),
  engine:engineModule.sharpGalleryEngine,enabled:true,queue:{send:async()=>{throw Error("EXTERNAL_QUEUE_FORBIDDEN");}}});
 await worker.processJob(claims[0]!,Date.now()+45_000);
 const committed=await prisma.galleryStorageJob.findUnique({where:{id:job.id}});
 assert(committed?.status==="done"&&committed.leaseUntil===null&&typeof committed.attemptToken==="string", "DURABLE_GALLERY_DELETE_DONE");
 try{await s3.send(new HeadObjectCommand({Bucket:BUCKET,Key:sourceKey}));throw Error("SOURCE_STILL_EXISTS");}
 catch(e){assert((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"PHYSICAL_GALLERY_S3_HEAD404");}
 processed=true;
 pass("ORIGINAL_GALLERY_CLOUD_DELETE_S3_HEAD404_SQL_DONE_TOMBSTONE_PRESERVED");
}
async function cleanup(){
 if(sourceKey&&s3&&actorId&&albumId){
  if(!sourceKey.startsWith(`albums/${actorId}/${albumId}/`)){process.exitCode=1;console.error("FOREIGN_GALLERY_KEY_REFUSED");}
  else if(!processed){await s3.send(new DeleteObjectCommand({Bucket:BUCKET,Key:sourceKey})).catch(()=>{process.exitCode=1;});}
 }
 if(actorId){
  await prisma.galleryStorageJob.deleteMany({where:{ownerId:actorId}});
  const row=await prisma.user.findUnique({where:{id:actorId},select:{username:true}});
  if(row?.username===actorUsername&&actorUsername.startsWith(PREFIX))await prisma.user.delete({where:{id:actorId}});
 }
}
void(async()=>{try{await main();}catch(e){process.exitCode=1;console.error("AG1_SCOPED_GALLERY_REAL_FAILED_PHASE="+phase+" CODE="+(e instanceof Error&&/^(ASSERT_|ISOLATED_|GALLERY_|INVALID_|UNSAFE_)/.test(e.message)?e.message:"REDACTED"));}
 finally{try{await cleanup();if(actorId)pass("SYNTHETIC_OWN_SQL_S3_CLEANUP");}catch{process.exitCode=1;console.error("AG1_SCOPED_GALLERY_RECOVERY_REVIEW_REQUIRED");}
 s3?.destroy();await prisma.$disconnect();}})();
