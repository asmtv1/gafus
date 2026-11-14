/** Independent local PostgreSQL: atomic CDN purge with S3 deletion and V2 cleanup. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {prisma} from "@gafus/prisma";
import {enqueueDeletedMediaPurge,deletedMediaPurgePaths} from "@gafus/media-server/deleted-media-purge";
import {scheduleQuestionsV2Cleanup} from "@gafus/media-server/question-v2-cleanup";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_MEDIA_DELETION_REAL_PG!=="1" ||
 url.protocol!=="postgresql:" || url.hostname!=="127.0.0.1" ||
 url.pathname!=="/gafus_refactor_media_deletion")throw Error("REFUSING_NON_DISPOSABLE_MEDIA_DB");
const env={GALLERY_CDN_PROVIDER:"beget",GALLERY_S3_ENDPOINT:"https://s3.cloud.ru",FEED_CDN_PROVIDER:"beget",FEED_S3_ENDPOINT:"https://s3.cloud.ru"};
async function main(){
 const galleryKey="gallery/testowner/media/photo-1/v2/thumb.webp";
 const feedKey="media/v2/post-1/v1/video/720.mp4";
 assert.deepEqual(deletedMediaPurgePaths("gallery",[galleryKey,galleryKey,"gallery/testowner/media/photo-1/v2/source.jpg"]),["/"+galleryKey]);
 await prisma.$transaction(async tx=>{
  await enqueueDeletedMediaPurge(tx,"gallery","job-1",[galleryKey],env);
 });
 await prisma.$transaction(async tx=>{
  await enqueueDeletedMediaPurge(tx,"gallery","job-1",[galleryKey],env);
 });
 assert.equal(await prisma.mediaCdnPurge.count({where:{id:"gallery:job-1"}}),1);
 const first=await prisma.mediaCdnPurge.findUniqueOrThrow({where:{id:"gallery:job-1"}});
 assert.equal(first.status,"pending");assert.deepEqual(first.paths,["/"+galleryKey]);
 await assert.rejects(prisma.$transaction(async tx=>{
  await enqueueDeletedMediaPurge(tx,"feed","rollback-job",[feedKey],env);
  throw Error("SYNTHETIC_S3_DELETE_ROLLBACK");
 }),/SYNTHETIC_S3_DELETE_ROLLBACK/);
 assert.equal(await prisma.mediaCdnPurge.count({where:{id:"feed:rollback-job"}}),0);
 await assert.rejects(prisma.$transaction(tx=>enqueueDeletedMediaPurge(tx,"feed","invalid",[feedKey],{
  FEED_CDN_PROVIDER:"beget",FEED_S3_ENDPOINT:"https://storage.yandexcloud.net",
 })),/MEDIA_PURGE_STORAGE_UNVERIFIED/);
 assert.equal(await prisma.mediaCdnPurge.count({where:{scope:"feed"}}),0);
 const now=new Date("2026-11-07T12:00:00Z");
 const photoIds=["question-photo-processing","question-photo-ready"];
 const mediaIds=[randomUUID(),randomUUID()];
 await prisma.questionV2MediaTask.createMany({data:[
  {mediaId:mediaIds[0],photoId:photoIds[0],ownerId:"owner",sourceKey:"question/test-source-1.jpg",sourceMime:"image/jpeg",sourceBytes:1024,status:"PROCESSING",createdAt:new Date(now.getTime()-4*60_000),leaseUntil:new Date(now.getTime()+12*60_000),attemptToken:randomUUID()},
  {mediaId:mediaIds[1],photoId:photoIds[1],ownerId:"owner",sourceKey:"question/test-source-2.jpg",sourceMime:"image/jpeg",sourceBytes:1024,status:"READY",createdAt:new Date(now.getTime()-5*60_000)},
 ]});
 await prisma.$transaction(tx=>scheduleQuestionsV2Cleanup(tx,photoIds,now));
 const tasks=await prisma.questionV2MediaTask.findMany({where:{photoId:{in:photoIds}},orderBy:{photoId:"asc"}});
 assert.equal(tasks.every(t=>t.status==="EXPIRED"&&t.cleanupKind==="ALL"&&t.errorCode==="PHOTO_REMOVED"),true);
 const processing=tasks.find(t=>t.photoId===photoIds[0])!;
 assert.equal(processing.attemptToken,null);assert.equal(processing.leaseUntil,null);
 assert.equal(processing.cleanupNextAt.getTime(),now.getTime()+13*60_000);
 const ready=tasks.find(t=>t.photoId===photoIds[1])!;
 assert.equal(ready.cleanupNextAt.getTime(),now.getTime()+6*60_000);
 await assert.rejects(prisma.$transaction(async tx=>{
  await scheduleQuestionsV2Cleanup(tx,[photoIds[1]],new Date(now.getTime()+10_000));
  throw Error("SYNTHETIC_CANCEL_ROLLBACK");
 }),/SYNTHETIC_CANCEL_ROLLBACK/);
 assert.equal((await prisma.questionV2MediaTask.findUniqueOrThrow({where:{mediaId:mediaIds[1]}})).cleanupNextAt.getTime(),ready.cleanupNextAt.getTime());
 console.log("MEDIA_DELETION_REAL_PG_PASS: CDN purge idempotence+rollback+storage-fail-closed; Question V2 signed replay 11m/lease deadline and atomic cleanup rollback");
}
main().then(async()=>prisma.$disconnect()).catch(async(err)=>{console.error(err);await prisma.$disconnect();process.exitCode=1;});
