import { realpathSync } from "node:fs";
/** Original registered gallery/feed Hono -> restricted WORK PG18 -> actual isolated MinIO. */
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
import { prisma } from "@gafus/prisma";

const root = "/Users/asmtv1/Desktop/gafus-refactor";
const base = "http://127.0.0.1:3001/api/v1";
const prefix = `ag1_media_http_${randomBytes(8).toString("hex")}`;
const data = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==","base64");
const obj = (v: unknown): Record<string,unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string,unknown> : {};
function ensure(ok: unknown, code: string): asserts ok {if(!ok)throw Error("ASSERT_"+code);}
function pass(label: string) {console.warn("AG1_GALLERY_FEED_WORK_HTTP_"+label+"=PASS");}
interface Actor { id:string; username:string; token:string }
let a:Actor|undefined,b:Actor|undefined;
let albumId = "", galleryUploadId = "", postId = "", feedUploadId = "";
let phase = "preflight";
const ownObjects: {bucket:string;key:string}[] = [];
let s3:S3Client|undefined;
async function api(path:string,method:string,token:string,body?:unknown) {
  const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,
    ...(body===undefined?{}:{"Content-Type":"application/json"})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
  return {status:r.status,headers:r.headers,data:obj(await r.json())};
}
async function presignedPost(url:string,fields:Record<string,string>,mime:string) {
  const form=new FormData();for(const [key,val] of Object.entries(fields))form.append(key,val);
  form.append("file",new File([data],"source.png",{type:mime}));
  const resp=await fetch(url,{method:"POST",body:form,signal:AbortSignal.timeout(20000)});
  ensure(resp.status===204,"SIGNED_MULTIPART_S3_POST204");
}
async function actor(suffix:string):Promise<Actor> {
  const username=prefix+"_"+suffix;
  const password=randomBytes(16).toString("base64url");
  const row=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),
    passwordSetAt:new Date(),registrationPending:false,role:"USER"}});
  const r=await fetch(base+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username,password}),signal:AbortSignal.timeout(12000)});
  const body=obj(await r.json());const token=obj(body.data).accessToken;
  ensure(r.status===200 && typeof token==="string","ACTUAL_OWNER_LOGIN");
  return {id:row.id,username,token};
}
async function verifyS3(bucket:string,key:string) {
  ensure(s3,"S3_IS_INITIALIZED");
  const head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
  ensure(head.ContentLength===data.length,"PERSISTED_S3_HEAD");
  const result=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  ensure(Buffer.from(await result.Body!.transformToByteArray()).equals(data),"PERSISTED_S3_BYTES");
  ensure((await fetch(`http://127.0.0.1:9000/${bucket}/${key}`)).status===403,"ANONYMOUS_MEDIA_DENIED");
}
async function main(){
  ensure(process.env.AG1_GALLERY_FEED_WORK_HTTP==="1","EXPLICIT_ACCEPTANCE_OPTIN");
  ensure(realpathSync(root)===root && (realpathSync(process.cwd())===root || realpathSync(process.cwd()).startsWith(root+"/")),"PROJECT_CWD");
  const db=new URL(process.env.DATABASE_URL??"");
  ensure(db.hostname==="127.0.0.1"&&db.port==="55921"&&
    db.pathname==="/gafus_refactor_real_work_20261024"&&db.username==="gafus_refactor_local_real", "WORK_DB_RESTRICTED_ROLE");
  ensure((await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`)[0]?.db===
    "gafus_refactor_real_work_20261024","PHYSICAL_WORK_DB");
  const config=isolatedNonprodS3Config("gallery",{...process.env,NODE_ENV:"development",
    GAFUS_LOCAL_ISOLATED_API:"1",GAFUS_ISOLATED_NONPROD_S3:"enabled",
    GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9000",
    GAFUS_ISOLATED_S3_GALLERY_BUCKET:"gafus-refactor-gallery-test"});
  ensure(config?.endpoint==="http://127.0.0.1:9000","LOOPBACK_S3");
  s3=new S3Client({endpoint:config.endpoint,region:"us-east-1",forcePathStyle:true,
    credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},maxAttempts:1,
    requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"});
  const ready=await fetch("http://127.0.0.1:3001/health",{signal:AbortSignal.timeout(5000)});
  ensure(ready.status===200,"ORIGINAL_HONO_IS_READY");
  phase="login";a=await actor("owner");b=await actor("other");
  pass("ORIGINAL_HONO_TWO_JWT_ACTORS_WORK_SQL_AND_PRIVATE_MINIO");

  phase="gallery_album";
  const created=await api("/gallery/albums","POST",a.token,{name:`AG1 GALLERY ${prefix}`,isVisible:false});
  ensure(created.status===200 && created.data.success===true,"GALLERY_CREATE_HTTP200");
  albumId=obj(created.data.data).id as string;ensure(typeof albumId==="string","GALLERY_ALBUM_ID");
  ensure((await prisma.galleryAlbum.findFirst({where:{id:albumId,ownerId:a.id}}))?.isVisible===false,"GALLERY_CREATE_SQL");
  const updated=await api(`/gallery/albums/${albumId}`,"PATCH",a.token,{name:"AG1 gallery edited"});
  ensure(updated.status===200&&obj(updated.data.data).name==="AG1 gallery edited","GALLERY_ALBUM_PATCH");
  const ownerRead=await api(`/gallery/albums/${albumId}`,"GET",a.token);
  ensure(ownerRead.status===200&&obj(ownerRead.data.data).id===albumId,"GALLERY_OWNER_GET");
  const foreign=await api(`/gallery/albums/${albumId}`,"GET",b.token);
  ensure(foreign.status===404,"GALLERY_HIDDEN_FOREIGN404");
  pass("GALLERY_ALBUM_CREATE_EDIT_OWNER_SQL_PRIVATE_FOREIGN404");

  phase="gallery_media";
  const reserve=await api(`/gallery/albums/${albumId}/uploads`,"POST",a.token,{
    filename:"sample.png",declaredMime:"image/png",declaredBytes:data.length,clientRequestId:randomUUID(),
  });
  ensure(reserve.status===200&&reserve.data.success===true,"GALLERY_RESERVE_HTTP200");
  const slot=obj(reserve.data.data);
  galleryUploadId=slot.uploadId as string;
  ensure(typeof galleryUploadId==="string"&&galleryUploadId.length>6,"GALLERY_UPLOAD_ID");
  const sql=await prisma.galleryUpload.findFirst({where:{id:galleryUploadId,ownerId:a.id}});
  ensure(sql?.status==="reserved"&&sql?.declaredBytes===data.length,"GALLERY_UPLOAD_SQL_RESERVED");
  ensure(typeof slot.postUrl==="string"&&new URL(slot.postUrl).origin==="http://127.0.0.1:9000","GALLERY_LOCAL_PRESIGN");
  ownObjects.push({bucket:"gafus-refactor-gallery-test",key:sql.sourceKey});
  await presignedPost(slot.postUrl,slot.postFields as Record<string,string>,"image/png");
  await verifyS3("gafus-refactor-gallery-test",sql.sourceKey);
  const confirmed=await api(`/gallery/uploads/${galleryUploadId}/complete`,"POST",a.token,{});
  ensure(confirmed.status===200&&obj(confirmed.data.data).status==="uploaded","GALLERY_HONO_CONFIRM_UPLOADED");
  ensure((await prisma.galleryUpload.findFirst({where:{id:galleryUploadId}}))?.status==="uploaded","GALLERY_SQL_CONFIRMED");
  const userGet=await api(`/gallery/uploads/${galleryUploadId}`,"GET",a.token);
  ensure(userGet.status===200&&obj(userGet.data.data).uploadId===galleryUploadId,"GALLERY_UPLOAD_OWNER_GET");
  const foreignUpload=await api(`/gallery/uploads/${galleryUploadId}`,"GET",b.token);
  ensure(foreignUpload.status===404,"GALLERY_UPLOAD_FOREIGN404");
  pass("GALLERY_ORIGINAL_HONO_RESERVE_S3_POST_HEAD_GET_CONFIRM_SQL_OWNER_ACL");

  phase="gallery_photo_crud";
  const photoId=obj(slot.photo).id;
  ensure(typeof photoId==="string" && photoId.length>6,"GALLERY_RESERVED_PHOTO_ID");
  const ownerPhotos=await api(`/gallery/albums/${albumId}/photos`,"GET",a.token);
  const photoItems=obj(ownerPhotos.data.data).items;
  ensure(ownerPhotos.status===200 && Array.isArray(photoItems) &&
    photoItems.some((item:unknown)=>obj(item).id===photoId),"OWNER_PENDING_PHOTO_LIST_SQL");
  const foreignPhoto=await api(`/gallery/photos/${photoId}`,"GET",b.token);
  ensure(foreignPhoto.status===404,"FOREIGN_PENDING_PHOTO404");
  const caption=await api(`/gallery/photos/${photoId}`,"PATCH",a.token,{caption:"AG1 actual source photo"});
  ensure(caption.status===200 && obj(caption.data.data).caption==="AG1 actual source photo","PHOTO_CAPTION_HTTP200");
  ensure((await prisma.galleryPhoto.findUnique({where:{id:photoId}}))?.caption==="AG1 actual source photo",
    "PHOTO_CAPTION_SQL");
  const invalidCover=await api(`/gallery/albums/${albumId}/cover`,"PUT",a.token,{photoId});
  ensure(invalidCover.status===409,"NO_PENDING_PHOTO_AS_READY_COVER");
  const removed=await api(`/gallery/photos/${photoId}`,"DELETE",a.token,{});
  ensure(removed.status===200,"GALLERY_DELETE_PHOTO200");
  ensure((await prisma.galleryPhoto.findUnique({where:{id:photoId}}))?.deletedAt,
    "GALLERY_PHOTO_SQL_TOMBSTONE");
  const removedAlbum=await api(`/gallery/albums/${albumId}`,"DELETE",a.token,{});
  ensure(removedAlbum.status===200,"GALLERY_DELETE_ALBUM200");
  ensure((await prisma.galleryAlbum.findUnique({where:{id:albumId}}))?.deletedAt,"GALLERY_ALBUM_SQL_TOMBSTONE");
  pass("GALLERY_PHOTO_OWNER_LIST_CAPTION_PENDING_COVER_DENIED_SOFT_DELETE_ALBUM_DELETE_SQL");

  phase="feed_media";
  const feedCreated=await api("/feed/posts","POST",a.token,{clientRequestId:randomUUID()});
  ensure(feedCreated.status===200&&feedCreated.data.success===true,"FEED_POST_CREATE");
  postId=obj(feedCreated.data.data).id as string;
  ensure(typeof postId==="string"&&postId.length>6,"FEED_POST_ID");
  ensure((await prisma.feedPost.findFirst({where:{id:postId,authorId:a.id}}))?.status==="draft","FEED_DRAFT_SQL");
  const feedReserve=await api(`/feed/posts/${postId}/uploads`,"POST",a.token,{
    filename:"sample.png",kind:"photo",declaredMime:"image/png",declaredBytes:data.length,clientRequestId:randomUUID(),
  });
  ensure(feedReserve.status===200&&feedReserve.data.success===true,"FEED_RESERVE_HTTP200");
  const fslot=obj(feedReserve.data.data);
  feedUploadId=fslot.uploadId as string;ensure(typeof feedUploadId==="string","FEED_UPLOAD_ID");
  const fsql=await prisma.feedUpload.findFirst({where:{id:feedUploadId,ownerId:a.id}});
  ensure(fsql?.status==="reserved"&&fsql.declaredBytes===data.length,"FEED_RESERVED_SQL");
  ensure(typeof fslot.postUrl==="string"&&new URL(fslot.postUrl).origin==="http://127.0.0.1:9000","FEED_LOCAL_PRESIGN");
  ownObjects.push({bucket:"gafus-refactor-feed-test",key:fsql.sourceKey});
  await presignedPost(fslot.postUrl,fslot.postFields as Record<string,string>,"image/png");
  await verifyS3("gafus-refactor-feed-test",fsql.sourceKey);
  const feedDone=await api(`/feed/uploads/${feedUploadId}/complete`,"POST",a.token,{});
  ensure(feedDone.status===200&&obj(feedDone.data.data).status==="uploaded","FEED_HONO_CONFIRM_UPLOADED");
  ensure((await prisma.feedUpload.findFirst({where:{id:feedUploadId}}))?.status==="uploaded","FEED_SQL_UPLOAD");
  const fown=await api(`/feed/uploads/${feedUploadId}`,"GET",a.token);
  ensure(fown.status===200&&obj(fown.data.data).uploadId===feedUploadId,"FEED_UPLOAD_GET");
  const fother=await api(`/feed/uploads/${feedUploadId}`,"GET",b.token);
  ensure(fother.status===404,"FEED_UPLOAD_FOREIGN404");
  pass("FEED_ORIGINAL_HONO_DRAFT_RESERVE_REAL_S3_POST_HEAD_GET_CONFIRM_SQL_ACL");
  phase="feed_revision_publish_pending";
  const revision=await api(`/feed/posts/${postId}/revisions`,"PUT",a.token,{
    clientRequestId:randomUUID(),expectedVersion:0,
    text:"AG1 media pending synthetic publication",attachmentIds:[fslot.mediaId],
  });
  ensure(revision.status===200,"FEED_ORIGINAL_HONO_REVISION_ACCEPTED");
  const mediaId = fslot.mediaId;
  ensure(typeof mediaId === "string", "FEED_MEDIA_ID_WIRE");
  const storedRevision=await prisma.feedPostRevision.findFirst({where:{postId,revisionNumber:1}});
  ensure(storedRevision && (await prisma.feedRevisionAttachment.count({where:{revisionId:storedRevision.id,mediaId}}))===1,
    "FEED_REVISION_SQL_ATTACHMENT_BOUND");
  const publication=await api(`/feed/posts/${postId}/publish`,"POST",a.token,{clientRequestId:randomUUID()});
  ensure(publication.status===200,"FEED_ORIGINAL_HONO_PUBLISH_PENDING");
  const revisedPost=await prisma.feedPost.findUnique({where:{id:postId}});
  ensure(revisedPost?.status==="pending" && revisedPost.activeRevisionId===null,
    "FEED_NOT_PUBLIC_UNPROCESSED_MEDIA_SQL");
  ensure((await prisma.feedPostRevision.findUnique({where:{id:storedRevision.id}}))?.status==="pending",
    "FEED_REVISION_PENDING_UNTIL_PROCESSOR");
  const outsider=await api(`/feed/posts/${postId}`,"GET",b.token);
  ensure(outsider.status===404,"FEED_UNPROCESSED_POST_FOREIGN404");
  pass("FEED_ORIGINAL_HONO_REVISION_SQL_ATTACHMENT_PUBLISH_QUEUED_NOT_EXPOSED_UNPROCESSED");
}
async function cleanup(){
  if(s3){for(const {bucket,key} of ownObjects){
    // Object deletion strictly restricted to synthetic source keys resolved from
    // rows bound to our generated owner id; never prefix-wide cleanup.
    const isOwn=Boolean(a && (bucket==="gafus-refactor-gallery-test"||bucket==="gafus-refactor-feed-test") &&
      key.includes(`/${a.id}/`));
    if(!isOwn){console.error("AG1_MEDIA_CLEANUP_REJECTED_UNOWNED_KEY");process.exitCode=1;continue;}
    try{await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
      try{await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));throw Error("OBJECT_STILL_EXISTS");}
      catch(err){if((err as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==404)throw err;}}
    catch{process.exitCode=1;console.error("AG1_MEDIA_S3_CLEANUP_REVIEW_REQUIRED");}
  }}
  if(a){
    await prisma.galleryStorageJob.deleteMany({where:{ownerId:a.id}});
    await prisma.feedStorageJob.deleteMany({where:{ownerId:a.id}});
  }
  for(const actor of [a,b])if(actor){
    const x=await prisma.user.findUnique({where:{id:actor.id},select:{username:true}});
    if(x?.username===actor.username&&actor.username.startsWith(prefix))await prisma.user.delete({where:{id:actor.id}});
  }
}
void (async()=>{try{await main();}catch(error){process.exitCode=1;
  console.error(`AG1_GALLERY_FEED_WORK_HTTP_FAIL phase=${phase} code=${error instanceof Error&&error.message.startsWith("ASSERT_")?error.message:"REDACTED"}`);
}finally{try{await cleanup();if(a)pass("SYNTHETIC_SQL_AND_ACTUAL_S3_OBJECT_CLEANUP");}
  catch{process.exitCode=1;console.error("AG1_GALLERY_FEED_CLEANUP_REVIEW_REQUIRED");}
  s3?.destroy();await prisma.$disconnect();}})();
