/** Original registered Hono -> WORK PG -> local MinIO -> existing Sharp gallery-cloud worker -> original Hono READY. */
import { realpathSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@gafus/prisma";
import { galleryStorageConfigFromEnv, createGalleryStorageFromEnv } from "@gafus/gallery-storage";
import { createGalleryS3Client, createGalleryObjectStore } from "@gafus/gallery-storage/objects";
import { createCurrentGalleryService } from "@gafus/core/services/gallery";
import { createGalleryService } from "../../../../packages/core/src/services/gallery/service";

const root="/Users/asmtv1/Desktop/gafus-refactor";
const base="http://127.0.0.1:3001/api/v1";
// Mount the real registered Hono app in-process with its own explicit isolated
// Gallery S3 flags. The existing external :3001 runner may have Gallery disabled;
// its settings and processes must never be modified just for this acceptance.
let honoRequest:(url:string,init:RequestInit)=>Promise<Response>=async()=>{
 throw Error("ISOLATED_HONO_NOT_MOUNTED");
};
const bucket="gafus-refactor-gallery-test";
const prefix=`gallery_refactor_move_${randomBytes(7).toString("hex")}`;
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGM4ECBHEmIY1RAwquHAcNUAADAxLhDqcDqfAAAAAElFTkSuQmCC","base64");
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
function assert(ok:unknown,code:string):asserts ok{if(!ok)throw Error("ASSERT_"+code);}
function pass(name:string){console.warn("GALLERY_REFACTOR_MOVE_REAL_"+name+"=PASS");}
interface Actor{id:string;username:string;token:string}
let owner:Actor|undefined,other:Actor|undefined,albumId="",targetAlbumId="",uploadId="",photoId="",client:S3Client|undefined;
let phase="preflight";
const exactOwnKeys=new Set<string>();
async function api(path:string,method:string,token:string,body?:unknown){
 const response=await honoRequest(base+path,{method,headers:{Authorization:`Bearer ${token}`,
 ...(body===undefined?{}:{"Content-Type":"application/json"})},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 return {status:response.status,data:obj(await response.json())};
}
async function createActor(suffix:string):Promise<Actor>{
 const username=prefix+"_"+suffix,password=randomBytes(24).toString("base64url");
 const user=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),role:"USER",
 passwordSetAt:new Date(),registrationPending:false}});
 const login=await honoRequest(base+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},
 body:JSON.stringify({username,password}),signal:AbortSignal.timeout(12000)});
 const response=obj(await login.json()),token=obj(response.data).accessToken;
 assert(login.status===200&&typeof token==="string","GENUINE_TWO_ACTOR_LOGIN");
 return {id:user.id,username,token};
}
async function postSigned(url:string,fields:Record<string,string>){
 const form=new FormData();for(const [k,v] of Object.entries(fields))form.append(k,v);
 form.append("file",new File([png],"fixture.png",{type:"image/png"}));
 const result=await fetch(url,{method:"POST",body:form,signal:AbortSignal.timeout(15000)});
 assert(result.status===204,"REAL_MINIO_POST204");
}
async function main(){
 assert(process.env.GALLERY_FIVE_MOVE_WORK_HTTP==="1","EXPLICIT_WORKER_ACCEPTANCE");
 assert(realpathSync(root)===root && (realpathSync(process.cwd())===root ||
 realpathSync(process.cwd()).startsWith(root+"/")),"PHYSICAL_SCOPE");
 const db=new URL(process.env.DATABASE_URL??"");
 assert(db.hostname==="127.0.0.1"&&db.port==="55921"&&db.username==="gafus_refactor_local_real"&&
 db.pathname==="/gafus_refactor_real_work_20261024","RESTRICTED_WORK_DB");
 Object.assign(process.env,{NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",
 GAFUS_ISOLATED_NONPROD_S3:"enabled",GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9000",
 GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:"gafus-refactor-documents-test",
 GAFUS_ISOLATED_S3_GALLERY_BUCKET:bucket,GAFUS_ISOLATED_S3_FEED_BUCKET:"gafus-refactor-feed-test",
 GALLERY_ENABLED:"true",CLOUDRU_MEDIA_JOBS_ENABLED:"false",GALLERY_MEDIA_FALLBACK_ENABLED:"false"});
 const c=galleryStorageConfigFromEnv();
 assert(c.isolatedNonprod===true&&c.enabled&&c.bucket===bucket&&c.endpoint==="http://127.0.0.1:9000","NONPROD_GALLERY_ONLY");
 client=createGalleryS3Client(c);
 // Start no listener and no asynchronous job runner. Mounted route is the
 // original Hono router + middleware + Gallery server + Core, not mocked.
 const {app}=await import("../app");
 honoRequest=(url,init)=>Promise.resolve(app.request(url,init));
 owner=await createActor("owner");other=await createActor("foreign");
 pass("ORIGINAL_HONO_PRIVATE_MINIO_TWO_ACTORS_WORK_DB");
 const album=await api("/gallery/albums","POST",owner.token,{name:`AG1 ready ${prefix}`,isVisible:false});
 assert(album.status===200,"ALBUM_POST");
 albumId=obj(album.data.data).id as string;assert(typeof albumId==="string","ALBUM_ID");
 const reserved=await api(`/gallery/albums/${albumId}/uploads`,"POST",owner.token,
 {filename:"fixture.png",declaredMime:"image/png",declaredBytes:png.length,clientRequestId:randomUUID()});
 assert(reserved.status===200,"UPLOAD_RESERVE_POST");
 const slot=obj(reserved.data.data);
 uploadId=slot.uploadId as string;photoId=obj(slot.photo).id as string;
 assert(typeof uploadId==="string"&&typeof photoId==="string","SIGNED_SLOT_IDS");
 const row=await prisma.galleryUpload.findUnique({where:{id:uploadId}});
 assert(row?.ownerId===owner.id&&row.status==="reserved","RESERVED_OWNER_SQL");
 exactOwnKeys.add(row.sourceKey);
 assert(typeof slot.postUrl==="string"&&new URL(slot.postUrl).origin==="http://127.0.0.1:9000","S3_POST_LOOPBACK");
 await postSigned(slot.postUrl,slot.postFields as Record<string,string>);
 const confirm=await api(`/gallery/uploads/${uploadId}/complete`,"POST",owner.token,{});
 assert(confirm.status===200&&obj(confirm.data.data).status==="uploaded","HOMO_CONFIRMED_UPLOADED");
 pass("ACTUAL_ORIGINAL_HONO_UPLOAD_SQL_AND_PRIVATE_MINIO_BYTES");
 phase="real_cloud_worker";
 // Execute the existing gallery-cloud Sharp pipeline and existing Core claim /
 // callback / publish state machine. No cloud queue or external Jobs transport.
 const service=createCurrentGalleryService(createGalleryStorageFromEnv());
 const core={
  claimUpload:(id:string)=>service.claimUpload({uploadId:id}),
  completeUpload:(input:Parameters<typeof service.completeUpload>[0])=>service.completeUpload(input),
  failUpload:(input:Parameters<typeof service.failUpload>[0])=>service.failUpload(input),
  claimJobs:(limit:number,id?:string)=>service.claimStorageJobs({limit,...(id?{uploadId:id}:{})}),
  completeJob:(input:Parameters<typeof service.completeStorageJob>[0])=>service.completeStorageJob(input),
  failJob:(input:Parameters<typeof service.failStorageJob>[0])=>service.failStorageJob(input),
  maintenance:(limit:number)=>service.maintenance({limit}),
 };
 // Resolve separate Cloud application sources only at runtime. Keep API
 // TypeScript's compile graph independent; check gallery-cloud's own typecheck.
 const cloud=await import("../../../gallery-cloud/src/"+"worker.ts");
 const image=await import("../../../gallery-cloud/src/"+"sharp-engine.ts");
 const worker=cloud.createGalleryCloudWorker({core,objects:createGalleryObjectStore(c,client),
  engine:image.sharpGalleryEngine,enabled:true,
  queue:{send:async()=>{throw Error("EXTERNAL_QUEUE_NOT_PERMITTED");}},
 });
 await worker.processUpload(uploadId,Date.now()+50_000);
 const photo=await prisma.galleryPhoto.findUnique({where:{id:photoId}});
 const upload=await prisma.galleryUpload.findUnique({where:{id:uploadId}});
 const statuses=await prisma.galleryStorageJob.findMany({where:{ownerId:owner.id},select:{kind:true,status:true,errorCode:true}});
 console.warn("AG1_GALLERY_READY_SAFE_STATES="+JSON.stringify({photo:photo?.status,upload:upload?.status,uploadError:upload?.errorCode,jobs:statuses}));
 assert(photo?.ownerId===owner.id&&photo.status==="ready"&&
  upload?.status==="ready","SHARP_WORKER_CORE_SQL_READY");
 assert(photo.thumbKey&&photo.fullKey&&upload.stagedThumbKey&&upload.stagedFullKey,"FOUR_PRIVATE_VARIANT_KEYS");
 for(const key of [photo.thumbKey,photo.fullKey,upload.stagedThumbKey,upload.stagedFullKey]){
  assert(key.startsWith(`albums/${owner.id}/${albumId}/`),"KEY_PHYSICALLY_OWNER_BOUND");
  exactOwnKeys.add(key);
  const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
  assert(head.ContentType==="image/webp"&&Number(head.ContentLength)>0,"ACTUAL_WEBP_VARIANT_S3_HEAD");
  const source=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  const bytes=Buffer.from(await source.Body!.transformToByteArray());
  assert(bytes.length>0&&bytes.subarray(0,4).toString("ascii")==="RIFF","ACTUAL_WEBP_BYTES");
  assert((await fetch(`http://127.0.0.1:9000/${bucket}/${key}`)).status===403,"ANONYMOUS_READY_OBJECT403");
 }
 pass("EXISTING_SHARP_GALLERY_CLOUD_WORKER_CORE_PUBLISH_WORK_SQL_READY_PRIVATE_WEBP_S3");
 phase="hono_read_ready";
 const ownerPhoto=await api(`/gallery/photos/${photoId}`,"GET",owner.token);
 const body=obj(ownerPhoto.data.data);
 assert(ownerPhoto.status===200&&body.status==="ready"&&
  typeof body.thumbUrl==="string"&&typeof body.fullUrl==="string","ORIGINAL_HONO_OWNER_READY_PHOTO_URLS");
 for(const url of [body.thumbUrl,body.fullUrl]){
  assert(new URL(url as string).origin==="http://127.0.0.1:9000","READY_SIGNED_LOCAL_ONLY");
  const download=await fetch(url as string,{signal:AbortSignal.timeout(5000)});
  assert(download.status===200,"ACTUAL_READY_SIGNED_GET200");
  assert(Buffer.from(await download.arrayBuffer()).subarray(0,4).toString("ascii")==="RIFF","READY_HTTP_WEBP_BYTES");
 }
 const foreignPhoto=await api(`/gallery/photos/${photoId}`,"GET",other.token);
 assert(foreignPhoto.status===404,"PRIVATE_READY_FOREIGN404");
 const caption=await api(`/gallery/photos/${photoId}`,"PATCH",owner.token,{caption:"Isolated GAFUS Gallery validated"});
 assert(caption.status===200&&obj(caption.data.data).caption==="Isolated GAFUS Gallery validated","PHOTO_CAPTION_HONO_SQL");
 const cover=await api(`/gallery/albums/${albumId}/cover`,"PUT",owner.token,{photoId});
 assert(cover.status===200,"READY_COVER_HTTP200");
 assert((await prisma.galleryAlbum.findUnique({where:{id:albumId}}))?.coverPhotoId===photoId,"READY_COVER_SQL");
 pass("ORIGINAL_HONO_READY_WEBP_SIGNED_LOCAL_GET_PRIVATE_FOREIGN_COVER_SQL");
 phase="move_original_hono";
 phase="create_target_album";
 const target=await api("/gallery/albums","POST",owner.token,{name:`Gallery destination ${prefix}`,isVisible:true});
 assert(target.status===200,"TARGET_ALBUM_CREATE_HONO");
 targetAlbumId=obj(target.data.data).id as string;
 assert(typeof targetAlbumId==="string"&&targetAlbumId!==albumId,"TARGET_ALBUM_ID");
 phase="update_target_album";
 const modified=await api(`/gallery/albums/${targetAlbumId}`,"PATCH",owner.token,
  {name:"Moved photographs",description:"Verified destination",isVisible:false});
 assert(modified.status===200&&obj(modified.data.data).isVisible===false,"TARGET_ALBUM_EDIT_HONO");
 phase="foreign_target_denial";
 assert((await api(`/gallery/albums/${targetAlbumId}`,"GET",other.token)).status===404,"HIDDEN_DESTINATION_FOREIGN_DENIED");
 phase="old_photo_sql";
 const oldPhoto=await prisma.galleryPhoto.findUniqueOrThrow({where:{id:photoId}});
 const originalKeys=[oldPhoto.thumbKey!,oldPhoto.fullKey!];
 phase="post_move_registered_hono";
 const moved=await api(`/gallery/photos/${photoId}/move`,"POST",owner.token,
  {albumId:targetAlbumId,clientRequestId:randomUUID()});
 assert(moved.status===200&&typeof obj(moved.data.data).jobId==="string","REAL_MOVE_HTTP_JOB");
 const moveId=obj(moved.data.data).jobId as string;
 const moving=await prisma.galleryPhoto.findUniqueOrThrow({where:{id:photoId}});
 assert(moving.status==="moving"&&moving.albumId===albumId,"MOVE_KEEPS_OLD_PHYSICAL_PHOTO");
 phase="exact_move_claim";
 // Exact-move selector is new Refactor SOURCE logic. The stock Hono/Cloud
 // dist remains unchanged while other agents are building; use the identical
 // source Core worker only for this precisely owner-scoped move claim.
 const moveSourceService=createGalleryService({db:prisma,storage:createGalleryStorageFromEnv()});
 const moveClaims=await moveSourceService.claimStorageJobs({limit:1,
  exactMove:{jobId:moveId,ownerId:owner.id}});
 assert(moveClaims.length===1&&moveClaims[0]?.jobId===moveId&&moveClaims[0].kind==="move","EXACT_OWN_MOVE_CLAIM");
 assert(moveClaims[0]!.sourceKeys.every(key=>originalKeys.includes(key)),"MOVE_SOURCE_KEY_SCOPE");
 for(const key of moveClaims[0]!.targetKeys){
  assert(key.startsWith(`albums/${owner.id}/${targetAlbumId}/photos/${photoId}/`),"TARGET_KEY_SCOPE");
  exactOwnKeys.add(key);
 }
 phase="physical_move_existing_worker";
 await worker.processJob(moveClaims[0]!,Date.now()+50_000);
 phase="moved_photo_sql";
 const actual=await prisma.galleryPhoto.findUniqueOrThrow({where:{id:photoId}});
 assert(actual.status==="ready"&&actual.albumId===targetAlbumId,"MOVE_COMPLETE_REAL_SQL");
 assert(!!actual.thumbKey&&!!actual.fullKey,"MOVE_TARGET_PRIVATE_KEYS");
 for(const key of [actual.thumbKey!,actual.fullKey!]){
  assert(key.startsWith(`albums/${owner.id}/${targetAlbumId}/photos/${photoId}/`),"MOVED_PHOTO_OWN_PREFIX");
  exactOwnKeys.add(key);
  const h=await client!.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
  assert(h.ContentType==="image/webp"&&Number(h.ContentLength)>0,"MOVED_WEBP_REAL_S3_HEAD");
 }
 const movedOwner=await api(`/gallery/photos/${photoId}`,"GET",owner.token);
 assert(movedOwner.status===200,"MOVED_HONO_OWNER_GET");
 const movedMedia=obj(movedOwner.data.data);
 const formerSignedUrls=[movedMedia.thumbUrl,movedMedia.fullUrl];
 assert(formerSignedUrls.every(url=>typeof url==="string"&&
  new URL(url).origin==="http://127.0.0.1:9000"),"MOVED_ONLY_PRIVATE_SIGNED_URLS");
 for(const url of formerSignedUrls){
  assert((await fetch(url as string,{signal:AbortSignal.timeout(6000)})).status===200,
   "MOVED_SIGNED_URL_BEFORE_DELETE200");
 }
 assert((await api(`/gallery/photos/${photoId}`,"GET",other.token)).status===404,"MOVED_HONO_FOREIGN_DENIED");
 pass("PHOTO_MOVE_REGISTERED_HONO_CORE_EXACT_JOB_PRIVATE_S3_READY_SQL_GET");
 phase="delete_original_hono";
 phase="delete_photo_http";
 const deleted=await api(`/gallery/photos/${photoId}`,"DELETE",owner.token,{});
 assert(deleted.status===200,"PHOTO_DELETE_HONO");
 assert(!!(await prisma.galleryPhoto.findUniqueOrThrow({where:{id:photoId}})).deletedAt,"PHOTO_DELETED_SQL");
 assert((await api(`/gallery/photos/${photoId}`,"GET",owner.token)).status===404,"PHOTO_DELETED_HONO_GET404");
 const cleanupJobs=await prisma.galleryStorageJob.findMany({where:{ownerId:owner.id,kind:"delete",sourceKeys:{hasSome:[actual.thumbKey!,actual.fullKey!]}}});
 assert(cleanupJobs.length>0,"PHOTO_DELETED_DURABLE_STORAGE_JOB");
 const ownFinalDeletes=cleanupJobs.filter(job=>job.status==="pending"&&
  job.availableAt.getTime()<=Date.now()&&job.sourceKeys.includes(actual.thumbKey!)&&
  job.sourceKeys.includes(actual.fullKey!));
 assert(ownFinalDeletes.length===1,"EXACT_OWN_READY_DELETE_DUE");
 phase="exact_ready_delete_claim";
 const deleteClaims=await moveSourceService.claimStorageJobs({limit:1,exactDelete:{
  jobId:ownFinalDeletes[0]!.id,ownerId:owner.id,
 }});
 assert(deleteClaims.length===1&&deleteClaims[0]!.kind==="delete"&&
  deleteClaims[0]!.jobId===ownFinalDeletes[0]!.id,"EXACT_OWNER_DELETE_JOB_CLAIM");
 phase="actual_s3_ready_variant_delete";
 await worker.processJob(deleteClaims[0]!,Date.now()+50_000);
 assert((await prisma.galleryStorageJob.findUniqueOrThrow({where:{id:deleteClaims[0]!.jobId}})).status==="done", "DELETE_JOB_DONE_SQL");
 for(const key of [actual.thumbKey!,actual.fullKey!]){
  try{
   await client!.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
   throw Error("ASSERT_PRIVATE_READY_VARIANT_STILL_EXISTS");
  }catch(e){
   assert((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,
    "FINAL_VARIANT_PHYSICAL_S3_HEAD404");
  }
 }
 for(const formerSignedUrl of formerSignedUrls){
  const afterDelete=await fetch(formerSignedUrl as string,{signal:AbortSignal.timeout(6000)});
  assert(afterDelete.status===404,"SIGNED_LOCAL_MEDIA_DELETED_GET404");
 }
 pass("SIGNED_LOCAL_MEDIA_INVALID_AFTER_PHYSICAL_DELETE_GET404");
 pass("REAL_READY_PHOTO_EXACT_DELETE_WORKER_S3_HEAD404_SQL_DONE");
 // Five actual, distinct private multipart transfers through the original
 // owner Hono reservation/complete API. All start together; only the five
 // synthetic owner/album keys may be read, processed or cleaned.
 phase="five_real_parallel_private_uploads";
 const parallel=await Promise.all(Array.from({length:5},async(_,index)=>{
  const reservation=await api(`/gallery/albums/${targetAlbumId}/uploads`,"POST",owner!.token,{
   filename:`batch-${index}.png`,declaredMime:"image/png",declaredBytes:png.length,
   clientRequestId:randomUUID(),
  });
  assert(reservation.status===200,"PARALLEL_RESERVATION_HONO200");
  const payload=obj(reservation.data.data);
  const id=payload.uploadId as string;
  const photo=obj(payload.photo).id as string;
  assert(typeof id==="string"&&typeof photo==="string","PARALLEL_RESERVATION_IDS");
  const upload=await prisma.galleryUpload.findUniqueOrThrow({where:{id}});
  assert(upload.ownerId===owner!.id&&upload.photoId===photo&&upload.status==="reserved"&&
   upload.sourceKey.startsWith(`albums/${owner!.id}/${targetAlbumId}/`),
   "PARALLEL_OWNER_RESERVED_SQL");
  exactOwnKeys.add(upload.sourceKey);
  assert(typeof payload.postUrl==="string"&&
   new URL(payload.postUrl).origin==="http://127.0.0.1:9000","PARALLEL_ONLY_PRIVATE_S3");
  return {id,photo,sourceKey:upload.sourceKey,
   url:payload.postUrl as string,fields:payload.postFields as Record<string,string>};
 }));
 assert(new Set(parallel.map(entry=>entry.id)).size===5&&
  new Set(parallel.map(entry=>entry.sourceKey)).size===5,
  "FIVE_DISTINCT_RESERVATIONS_AND_SOURCE_KEYS");
 // The barrier ensures that no one transfer is held back by serial dispatch.
 let starts=0;
 let startAll:()=>void=()=>{throw Error("BARRIER_NOT_READY");};
 const gate=new Promise<void>(resolve=>{startAll=resolve;});
 await Promise.all(parallel.map(async entry=>{
  starts++;
  if(starts===5)startAll();
  await gate;
  await postSigned(entry.url,entry.fields);
  const head=await client!.send(new HeadObjectCommand({Bucket:bucket,Key:entry.sourceKey}));
  assert(Number(head.ContentLength)===png.length,"PARALLEL_PRIVATE_S3_PHYSICAL_HEAD");
 }));
 const uploads=await Promise.all(parallel.map(async entry=>{
  const confirmed=await api(`/gallery/uploads/${entry.id}/complete`,"POST",owner!.token,{});
  assert(confirmed.status===200&&obj(confirmed.data.data).status==="uploaded",
   "PARALLEL_CONFIRM_HONO200");
  const seen=await api(`/gallery/uploads/${entry.id}`,"GET",owner!.token);
  assert(seen.status===200&&obj(seen.data.data).uploadId===entry.id,
   "PARALLEL_AUTHORITATIVE_UPLOAD_GET");
  return prisma.galleryUpload.findUniqueOrThrow({where:{id:entry.id}});
 }));
 assert(uploads.length===5&&uploads.every(entry=>entry.status==="uploaded"&&
  entry.ownerId===owner!.id),"FIVE_INDEPENDENT_COMMITTED_UPLOADS");
 pass("FIVE_PARALLEL_REGISTERED_HONO_RESERVATION_PRIVATE_S3_POST204_SQL_COMPLETE_GET");
 phase="five_real_parallel_sharp_publish";
 await Promise.all(parallel.map(entry=>worker.processUpload(entry.id,Date.now()+50_000)));
 for(const entry of parallel){
  const photoRow=await prisma.galleryPhoto.findUniqueOrThrow({where:{id:entry.photo}});
  assert(photoRow.status==="ready"&&photoRow.albumId===targetAlbumId&&
   !!photoRow.thumbKey&&!!photoRow.fullKey,"FIVE_PROCESSING_PHOTOS_READY_SQL");
  for(const key of [photoRow.thumbKey!,photoRow.fullKey!]){
   assert(key.startsWith(`albums/${owner!.id}/${targetAlbumId}/`),
    "FIVE_READY_KEYS_ISOLATED");
   exactOwnKeys.add(key);
   const head=await client!.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
   assert(head.ContentType==="image/webp"&&Number(head.ContentLength)>0,
    "FIVE_READY_PHYSICAL_S3_WEBP");
  }
  const reloaded=await api(`/gallery/photos/${entry.photo}`,"GET",owner!.token);
  assert(reloaded.status===200&&obj(reloaded.data.data).status==="ready",
   "FIVE_READY_HONO_RELOAD");
 }
 pass("FIVE_PARALLEL_EXISTING_SHARP_WORKER_S3_WEBP_READY_HONO_RELOAD");
 const deletedAlbum=await api(`/gallery/albums/${albumId}`,"DELETE",owner.token,{});
 const deletedTarget=await api(`/gallery/albums/${targetAlbumId}`,"DELETE",owner.token,{});
 assert(deletedAlbum.status===200&&deletedTarget.status===200,"BOTH_ALBUMS_DELETE_HONO");
 assert((await api(`/gallery/albums/${albumId}`,"GET",owner.token)).status===404,"ALBUM_TOMBSTONED_OWNER404");
 assert((await api(`/gallery/albums/${targetAlbumId}`,"GET",owner.token)).status===404,"TARGET_TOMBSTONED_OWNER404");
 pass("PHOTO_ALBUM_DELETE_HONO_CORE_SQL_DURABLE_CLEANUP_QUEUED");
}
async function cleanup(){
 if(owner){
  // A lost worker acknowledgement can leave staged keys; discover only rows
  // originally scoped to our generated owner and album, never a bucket sweep.
  const uploads=await prisma.galleryUpload.findMany({where:{ownerId:owner.id},select:{sourceKey:true,stagedThumbKey:true,stagedFullKey:true}});
  const photos=await prisma.galleryPhoto.findMany({where:{ownerId:owner.id},select:{thumbKey:true,fullKey:true}});
  const ownJobs=await prisma.galleryStorageJob.findMany({where:{ownerId:owner.id},select:{sourceKeys:true,targetKeys:true}});
  for(const row of ownJobs)for(const k of [...row.sourceKeys,...row.targetKeys])if(k)exactOwnKeys.add(k);
  for(const row of uploads)for(const k of [row.sourceKey,row.stagedThumbKey,row.stagedFullKey])if(k)exactOwnKeys.add(k);
  for(const row of photos)for(const k of [row.thumbKey,row.fullKey])if(k)exactOwnKeys.add(k);
 }
 if(client && owner && albumId){
  const ownOwnerId=owner.id;
  for(const key of exactOwnKeys){
   if(![albumId,targetAlbumId].filter(Boolean).some(aid=>key.startsWith(`albums/${ownOwnerId}/${aid}/`))){
    console.error("GALLERY_REFACTOR_FOREIGN_S3_KEY_REJECTED");process.exitCode=1;continue;
   }
   try{
    await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
    try{await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));throw Error("UNCONFIRMED_DELETE");}
    catch(e){assert((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"OWN_S3_HEAD404");}
   }catch{console.error("GALLERY_REFACTOR_S3_CLEANUP_REVIEW_REQUIRED");process.exitCode=1;}
  }
 }
 if(owner)await prisma.galleryStorageJob.deleteMany({where:{ownerId:owner.id}});
 for(const actor of [owner,other])if(actor){
  const row=await prisma.user.findUnique({where:{id:actor.id},select:{username:true}});
  if(row?.username===actor.username&&actor.username.startsWith(prefix))
   await prisma.user.delete({where:{id:actor.id}});
 }
}
void(async()=>{try{await main();}catch(e){process.exitCode=1;
 console.error(`GALLERY_REFACTOR_MOVE_FAILED phase=${phase} code=${e instanceof Error&&e.message.startsWith("ASSERT_")?e.message:"REDACTED"} type=${e instanceof Error?e.name:"unknown"}`);
}finally{try{await cleanup();if(owner)pass("SYNTHETIC_PRIVATE_S3_AND_SQL_CLEANUP");}
 catch{process.exitCode=1;console.error("GALLERY_REFACTOR_SQL_CLEANUP_REVIEW_REQUIRED");}
 client?.destroy();await prisma.$disconnect();
 // Imported mounted Hono initializes Redis/provider handles. Stop only this
 // disposable test process after its own scoped cleanup, never shared services.
 process.exit(process.exitCode??0);
}})();
