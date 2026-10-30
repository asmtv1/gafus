/** Original registered Hono -> WORK PG -> local MinIO -> existing Sharp gallery-cloud worker -> original Hono READY. */
import { realpathSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@gafus/prisma";
import { galleryStorageConfigFromEnv, createGalleryStorageFromEnv } from "@gafus/gallery-storage";
import { createGalleryS3Client, createGalleryObjectStore } from "@gafus/gallery-storage/objects";
import { createCurrentGalleryService } from "@gafus/core/services/gallery";

const root="/Users/asmtv1/Desktop/gafus-refactor";
const base="http://127.0.0.1:3001/api/v1";
const bucket="gafus-refactor-gallery-test";
const prefix=`ag1_ready_gallery_${randomBytes(7).toString("hex")}`;
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGM4ECBHEmIY1RAwquHAcNUAADAxLhDqcDqfAAAAAElFTkSuQmCC","base64");
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
function assert(ok:unknown,code:string):asserts ok{if(!ok)throw Error("ASSERT_"+code);}
function pass(name:string){console.warn("AG1_GALLERY_READY_REAL_"+name+"=PASS");}
interface Actor{id:string;username:string;token:string}
let owner:Actor|undefined,other:Actor|undefined,albumId="",uploadId="",photoId="",client:S3Client|undefined;
let phase="preflight";
const exactOwnKeys=new Set<string>();
async function api(path:string,method:string,token:string,body?:unknown){
 const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,
 ...(body===undefined?{}:{"Content-Type":"application/json"})},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 return {status:response.status,data:obj(await response.json())};
}
async function createActor(suffix:string):Promise<Actor>{
 const username=prefix+"_"+suffix,password=randomBytes(24).toString("base64url");
 const user=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),role:"USER",
 passwordSetAt:new Date(),registrationPending:false}});
 const login=await fetch(base+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},
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
 assert(process.env.AG1_GALLERY_REAL_READY_WORK_HTTP==="1","EXPLICIT_WORKER_ACCEPTANCE");
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
 const headReady=await fetch("http://127.0.0.1:3001/health",{signal:AbortSignal.timeout(3500)});
 assert(headReady.status===200,"STOCK_HONO_HEALTH");
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
 const cover=await api(`/gallery/albums/${albumId}/cover`,"PUT",owner.token,{photoId});
 assert(cover.status===200,"READY_COVER_HTTP200");
 assert((await prisma.galleryAlbum.findUnique({where:{id:albumId}}))?.coverPhotoId===photoId,"READY_COVER_SQL");
 pass("ORIGINAL_HONO_READY_WEBP_SIGNED_LOCAL_GET_PRIVATE_FOREIGN_COVER_SQL");
}
async function cleanup(){
 if(owner){
  // A lost worker acknowledgement can leave staged keys; discover only rows
  // originally scoped to our generated owner and album, never a bucket sweep.
  const uploads=await prisma.galleryUpload.findMany({where:{ownerId:owner.id},select:{sourceKey:true,stagedThumbKey:true,stagedFullKey:true}});
  const photos=await prisma.galleryPhoto.findMany({where:{ownerId:owner.id},select:{thumbKey:true,fullKey:true}});
  for(const row of uploads)for(const k of [row.sourceKey,row.stagedThumbKey,row.stagedFullKey])if(k)exactOwnKeys.add(k);
  for(const row of photos)for(const k of [row.thumbKey,row.fullKey])if(k)exactOwnKeys.add(k);
 }
 if(client && owner && albumId){
  for(const key of exactOwnKeys){
   if(!key.startsWith(`albums/${owner.id}/${albumId}/`)){
    console.error("AG1_GALLERY_READY_FOREIGN_S3_KEY_REJECTED");process.exitCode=1;continue;
   }
   try{
    await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
    try{await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));throw Error("UNCONFIRMED_DELETE");}
    catch(e){assert((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"OWN_S3_HEAD404");}
   }catch{console.error("AG1_GALLERY_READY_S3_CLEANUP_REVIEW_REQUIRED");process.exitCode=1;}
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
 console.error(`AG1_GALLERY_READY_FAILED phase=${phase} code=${e instanceof Error&&e.message.startsWith("ASSERT_")?e.message:"REDACTED"}`);
}finally{try{await cleanup();if(owner)pass("SYNTHETIC_PRIVATE_S3_AND_SQL_CLEANUP");}
 catch{process.exitCode=1;console.error("AG1_GALLERY_READY_SQL_CLEANUP_REVIEW_REQUIRED");}
 client?.destroy();await prisma.$disconnect();}})();
