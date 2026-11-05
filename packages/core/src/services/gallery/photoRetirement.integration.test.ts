/**
 * Explicit disposable-local-PostgreSQL acceptance. Never open DATABASE_URL
 * unless the test operator supplied the tightly scoped Gallery test URL.
 * No Cloud credentials, external S3, or Cloud.ru Jobs are used.
 */
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {PrismaClient} from "@gafus/prisma";
import {createGalleryService} from "./service";
import {galleryPhotoV2Keys,galleryPhotoKeys,galleryAttemptKeys} from "./keys";
import type {GalleryStoragePort,GalleryObjectMetadata} from "./ports";
const url=process.env.GALLERY_TEST_DATABASE_URL;
if(url){
  const parsed=new URL(url);
  if(!["postgresql:","postgres:"].includes(parsed.protocol)||
    !["127.0.0.1","localhost","[::1]"].includes(parsed.hostname)||
    !["/gafus_gallery_test_20261007","/gafus_gallery_v2_test_20261028"].includes(parsed.pathname))
    throw Error("RETIRED_PHOTO_TEST_REQUIRES_DISPOSABLE_LOOPBACK_GALLERY_DB");
}
const require=createRequire(new URL("../../../../prisma/package.json",import.meta.url));
const Client=require("@prisma/client").PrismaClient as new (args:{datasources:{db:{url:string}}})=>PrismaClient;
const db=url?new Client({datasources:{db:{url}}}):null;
(url?describe:describe.skip)("Gallery no-Cloud-photo Jobs / disposable real PostgreSQL",()=>{
 let owner:string,username:string,now:Date,objects:Map<string,GalleryObjectMetadata>;
 let service:ReturnType<typeof createGalleryService>,publish:ReturnType<typeof vi.fn>;
 beforeEach(async()=>{
  owner=randomUUID();username="retired_photo_"+owner.replaceAll("-","");
  now=new Date("2026-11-05T10:00:00Z");objects=new Map();
  await db!.user.create({data:{id:owner,username,password:"unusable-fixture"}});
  publish=vi.fn(async({sourceKey,thumbKey,fullKey}:{sourceKey:string;thumbKey:string;fullKey:string})=>{
   expect(objects.has(sourceKey)).toBe(true);
   objects.set(thumbKey,{etag:'"'+"a".repeat(32)+'"',bytes:100,contentType:"image/webp"});
   objects.set(fullKey,{etag:'"'+"b".repeat(32)+'"',bytes:500,contentType:"image/webp"});
   return {width:640,height:480};
  });
  const storage:GalleryStoragePort={enabled:true,
   presignPost:vi.fn(async({key})=>({url:"https://test.invalid",fields:{key}})),
   signClientThumb:vi.fn(async({sourceKey})=>({url:"https://test.invalid",fields:{sourceKey}})),
   publishClientPhoto:publish,
   head:vi.fn(async key=>objects.get(key)??null),
   signCdn:vi.fn(async({key})=>"https://cdn.invalid/"+key),
  };
  service=createGalleryService({db:db!,storage,now:()=>new Date(now)});
 });
 afterEach(async()=>{
  await db!.galleryStorageJob.deleteMany({where:{ownerId:owner}});
  await db!.user.delete({where:{id:owner}});
 });
 afterAll(async()=>{await db?.$disconnect()});
 const reserve=async()=>service.reserveClientUpload(owner,{
  filename:"prepared.webp",declaredMime:"image/webp",declaredBytes:500,
  clientRequestId:randomUUID(),
 });
 it("completes verified client WebP READY without any photo Cloud publish job",async()=>{
  const ticket=await reserve();
  const row=await db!.galleryUpload.findUniqueOrThrow({where:{id:ticket.uploadId}});
  objects.set(row.sourceKey,{etag:'"'+"c".repeat(32)+'"',bytes:500,contentType:"image/webp"});
  const dto=await service.confirmClientUpload(owner,ticket.uploadId);
  expect(dto.status).toBe("ready");
  expect(publish).toHaveBeenCalledOnce();
  expect(await db!.galleryStorageJob.count({where:{ownerId:owner,kind:"publish"}})).toBe(0);
  const final=galleryPhotoV2Keys(owner,row.photoId);
  expect((await db!.galleryPhoto.findUniqueOrThrow({where:{id:row.photoId}}))).toMatchObject({
   status:"ready",thumbKey:final.thumbKey,fullKey:final.fullKey,width:640,height:480,
  });
  expect((await service.maintenance()).processUploadIds).toEqual([]);
 });
 it("recovers crashed client WebP lease to RESERVED for a safe owner retry",async()=>{
  const ticket=await reserve();
  const row=await db!.galleryUpload.findUniqueOrThrow({where:{id:ticket.uploadId}});
  await db!.galleryUpload.update({where:{id:row.id},data:{
   status:"processing",leaseUntil:new Date(now.getTime()-1_000),attemptToken:randomUUID(),
  }});
  await db!.galleryPhoto.update({where:{id:row.photoId},data:{status:"processing"}});
  await service.maintenance();
  const recovered=await db!.galleryUpload.findUniqueOrThrow({where:{id:row.id}});
  expect(recovered.status).toBe("reserved");
  expect(recovered.attemptToken).toBeNull();
  expect(recovered.leaseUntil).toBeNull();
  expect((await service.getUpload(owner,row.id)).status).toBe("reserved");
  expect(await db!.galleryStorageJob.count({where:{ownerId:owner,kind:"publish"}})).toBe(0);
 });
 it("terminalizes pre-cutover legacy publish PG tasks, not endlessly UPLOADED",async()=>{
  const ticket=await reserve();
  const row=await db!.galleryUpload.findUniqueOrThrow({where:{id:ticket.uploadId},include:{photo:true}});
  const token=randomUUID();
  await db!.galleryUpload.update({where:{id:row.id},data:{
   status:"processing",leaseUntil:new Date(now.getTime()+60_000),attemptToken:token,
  }});
  await db!.galleryPhoto.update({where:{id:row.photoId},data:{status:"processing"}});
  const staged=galleryAttemptKeys(owner,row.photo.albumId,row.id,token);
  const targets=galleryPhotoKeys(owner,row.photo.albumId,row.photoId);
  const job=await db!.galleryStorageJob.create({data:{
   id:randomUUID(),ownerId:owner,photoId:row.photoId,uploadId:row.id,
   kind:"publish",status:"pending",dedupeKey:"publish:"+row.id+":"+token,
   sourceKeys:[staged.thumbKey,staged.fullKey],sourceETags:['"'+"a".repeat(32)+'"','"'+"b".repeat(32)+'"'],
   targetKeys:[targets.thumbKey,targets.fullKey],availableAt:now,
  }});
  expect(await service.claimStorageJobs({limit:10})).not.toContainEqual(expect.objectContaining({jobId:job.id}));
  const maintenance=await service.maintenance();
  expect(maintenance.reconciledJobs).toBeGreaterThanOrEqual(1);
  expect((await db!.galleryStorageJob.findUniqueOrThrow({where:{id:job.id}}))).toMatchObject({
   status:"failed",errorCode:"LEGACY_PHOTO_PROCESSOR_RETIRED",
  });
  expect((await db!.galleryUpload.findUniqueOrThrow({where:{id:row.id}})).status).toBe("failed");
  expect((await db!.galleryPhoto.findUniqueOrThrow({where:{id:row.photoId}})).status).toBe("failed");
  await service.maintenance();
  expect((await db!.galleryStorageJob.findUniqueOrThrow({where:{id:job.id}})).status).toBe("failed");
 });
});
