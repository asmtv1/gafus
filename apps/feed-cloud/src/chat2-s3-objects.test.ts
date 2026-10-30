import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { Readable } from "node:stream";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { chat2V2SourceKey, type Chat2V2Job } from "@gafus/feed-cloud";
import { createChat2S3Objects } from "./chat2-s3-objects.js";
const root="/Users/asmtv1/Desktop/gafus-refactor/apps/feed-cloud";
const folders:string[]=[];
const job=():Chat2V2Job=>{const conversationId="qa_room",ownerId="qa_owner",mediaId=randomUUID(),sourceMime="image/jpeg";
 return {conversationId,ownerId,mediaId,sourceMime,sourceBytes:40,
 sourceKey:chat2V2SourceKey(conversationId,ownerId,mediaId,sourceMime)};
};
const digest=(bytes:Uint8Array)=>createHash("md5").update(bytes).digest("hex");
const dir=async()=>{const name=await mkdtemp(join(root,".chat2-s3-test-"));folders.push(name);return name;};
afterEach(async()=>{for(const name of folders.splice(0))await rm(name,{recursive:true,force:true});});
describe("Chat2 S3 request budget without reduced safety",()=>{
 it("downloads the original using exactly ONE GET and exact response metadata",async()=>{
  const claim=job(),bytes=Buffer.alloc(40,4),path=join(await dir(),"original");
  const send=vi.fn(async cmd=>{
   if(cmd instanceof GetObjectCommand)return {ContentLength:40,ContentType:"image/jpeg",Body:Readable.from([bytes])};
   throw Error("UNEXPECTED_S3_REQUEST");
  });
  await createChat2S3Objects(claim,{send} as unknown as S3Client)
    .download(claim.sourceKey,path,10*1024*1024,new AbortController().signal);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
  expect(await readFile(path)).toEqual(bytes);
 });
 it("does not create a file on wrong GET MIME, with no extra HEAD",async()=>{
  const claim=job(),path=join(await dir(),"original");
  const send=vi.fn(async()=>({ContentLength:40,ContentType:"image/png",Body:Readable.from([Buffer.alloc(40)])}));
  await expect(createChat2S3Objects(claim,{send} as unknown as S3Client)
    .download(claim.sourceKey,path,10*1024*1024,new AbortController().signal))
    .rejects.toThrow("CHAT2_S3_SOURCE_SIZE_OR_MIME_MISMATCH");
  expect(send).toHaveBeenCalledTimes(1);
  await expect(readFile(path)).rejects.toMatchObject({code:"ENOENT"});
 });
 it("uses only immutable PUT on correct S3 ETag; Core validates HEAD before READY",async()=>{
  const claim=job(),bytes=Buffer.from("RIFF..........WEBP...........");
  const key=`chat2/${claim.conversationId}/${claim.ownerId}/${claim.mediaId}/v1/image/s.webp`;
  const send=vi.fn(async cmd=>{
   if(cmd instanceof PutObjectCommand)return {ETag:`\"${digest(bytes)}\"`};
   throw Error("UNEXPECTED_S3_HEAD");
  });
  await createChat2S3Objects(claim,{send} as unknown as S3Client)
    .create(key,bytes,"image/webp",new AbortController().signal);
  expect(send).toHaveBeenCalledTimes(1);
  const put=send.mock.calls[0]?.[0] as PutObjectCommand;
  expect(put.input.IfNoneMatch).toBe("*");
  expect(put.input.ContentMD5).toBe(createHash("md5").update(bytes).digest("base64"));
 });
 it("HEAD verifies an immutable retry collision before treating it as success",async()=>{
  const claim=job(),bytes=Buffer.alloc(32,5);
  const key=`chat2/${claim.conversationId}/${claim.ownerId}/${claim.mediaId}/v1/image/m.webp`;
  const send=vi.fn(async cmd=>{
   if(cmd instanceof PutObjectCommand)throw Object.assign(Error("PRECONDITION_FAILED"),{$metadata:{httpStatusCode:412}});
   if(cmd instanceof HeadObjectCommand)return {ContentLength:bytes.length,ContentType:"image/webp",ETag:`\"${digest(bytes)}\"`};
   throw Error("UNEXPECTED_S3_REQUEST");
  });
  await createChat2S3Objects(claim,{send} as unknown as S3Client)
    .create(key,bytes,"image/webp",new AbortController().signal);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]?.[0]).toBeInstanceOf(HeadObjectCommand);
 });
 it("streams an MP4 as one PUT without an unnecessary post-PUT HEAD",async()=>{
  const claim=job(),file=join(await dir(),"360.mp4"),bytes=Buffer.alloc(128,6);
  await writeFile(file,bytes);
  const key=`chat2/${claim.conversationId}/${claim.ownerId}/${claim.mediaId}/v1/video/360.mp4`;
  const send=vi.fn(async cmd=>{
   if(cmd instanceof PutObjectCommand)return {ETag:`\"${digest(bytes)}\"`};
   throw Error("UNEXPECTED_EXTRA_S3_HEAD");
  });
  await createChat2S3Objects(claim,{send} as unknown as S3Client)
    .createFile(key,file,new AbortController().signal);
  expect(send).toHaveBeenCalledTimes(1);
 });
});
