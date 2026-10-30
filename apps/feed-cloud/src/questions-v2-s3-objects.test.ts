import { Readable } from "node:stream";
import { createHash,randomUUID } from "node:crypto";
import sharp from "sharp";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { GetObjectCommand,PutObjectCommand,HeadObjectCommand } from "@aws-sdk/client-s3";
import { questionsV2SourceKey,questionsV2FinalKeys,
  type QuestionsV2Job } from "@gafus/feed-cloud";
import { processQuestionsV2Photo } from "./questions-v2-processor";
import { createQuestionsV2S3Objects } from "./questions-v2-s3-objects";

const mock=vi.hoisted(()=>({send:vi.fn(),destroy:vi.fn()}));
vi.mock("@gafus/cdn-upload",()=>({
  questionsV2Storage:()=>({client:{send:mock.send,destroy:mock.destroy},
    bucket:"gafus-refactor-questions-test"}),
}));
function job(bytes:Uint8Array):QuestionsV2Job{
  const mediaId=randomUUID(),ownerId="actor_1",sourceMime="image/png";
  return {mediaId,ownerId,sourceMime,sourceBytes:bytes.length,
    sourceKey:questionsV2SourceKey(ownerId,mediaId,sourceMime)};
}
beforeEach(()=>vi.resetAllMocks());
describe("Questions Photo V2 S3 HTTP command budget",()=>{
  it("processes portrait with one GET, two MD5 PUTs and no redundant HEAD",async()=>{
    const bytes=await sharp({create:{width:800,height:1280,channels:3,
      background:"#bb9977"}}).png().toBuffer();
    const claim=job(bytes),calls:string[]=[];
    mock.send.mockImplementation(async(command:unknown)=>{
      if(command instanceof GetObjectCommand){
        calls.push("GET");
        expect(command.input.Key).toBe(claim.sourceKey);
        return {ContentLength:bytes.length,ContentType:"image/png",Body:Readable.from([bytes])};
      }
      if(command instanceof PutObjectCommand){
        calls.push("PUT");
        expect(command.input.IfNoneMatch).toBe("*");
        expect(command.input.ContentType).toBe("image/webp");
        expect(command.input.ContentMD5).toBeTruthy();
        const md5=Buffer.from(command.input.ContentMD5!,"base64").toString("hex");
        return {ETag:'"'+md5+'"'};
      }
      throw Error("UNEXPECTED_S3_REQUEST");
    });
    const objects=createQuestionsV2S3Objects(claim);
    try{
      const output=await processQuestionsV2Photo(claim,objects,new AbortController().signal);
      expect(output.variants.small.width).toBe(360);
      expect(output.variants.medium.width).toBe(720);
      expect(calls.filter(x=>x==="GET")).toHaveLength(1);
      expect(calls.filter(x=>x==="PUT")).toHaveLength(2);
      expect(calls).toHaveLength(3);
    }finally{objects.close();}
    expect(mock.destroy).toHaveBeenCalledOnce();
  });
  it("does not perform HEAD on a valid GET and rejects wrong ContentLength early",async()=>{
    const bytes=await sharp({create:{width:100,height:100,channels:3,
      background:"#000"}}).png().toBuffer();
    const claim=job(bytes);
    mock.send.mockImplementation(async(command:unknown)=>{
      if(!(command instanceof GetObjectCommand))throw Error("UNEXPECTED_CMD");
      return {ContentLength:bytes.length+1,ContentType:"image/png",Body:Readable.from([bytes])};
    });
    const objects=createQuestionsV2S3Objects(claim);
    try{
      await expect(objects.downloadSource(claim,new AbortController().signal))
        .rejects.toThrow("QUESTIONS_V2_GET_INVALID_HEADERS");
      expect(mock.send).toHaveBeenCalledOnce();
    }finally{objects.close();}
  });
  it("HEAD-checks an immutable PUT conflict by ETag+size+MIME",async()=>{
    const bytes=new Uint8Array([82,73,70,70,12,0,0,0,87,69,66,80,1,2,3,4]);
    const claim=job(bytes),keys=questionsV2FinalKeys(claim.ownerId,claim.mediaId);
    const md5=createHash("md5").update(bytes).digest("hex");
    const calls:string[]=[];
    mock.send.mockImplementation(async(command:unknown)=>{
      if(command instanceof PutObjectCommand){
        calls.push("PUT");
        throw {$metadata:{httpStatusCode:412}};
      }
      if(command instanceof HeadObjectCommand){
        calls.push("HEAD");
        return {ContentLength:bytes.length,ContentType:"image/webp",ETag:'"'+md5+'"'};
      }
      throw Error("UNEXPECTED_CMD");
    });
    const objects=createQuestionsV2S3Objects(claim);
    try{
      await expect(objects.createWebp(keys.small,bytes,new AbortController().signal))
        .resolves.toBeUndefined();
      expect(calls).toEqual(["PUT","HEAD"]);
      await expect(objects.createWebp("chat2/foreign",bytes,new AbortController().signal))
        .rejects.toThrow("QUESTIONS_V2_PUT_NOT_ALLOWED");
    }finally{objects.close();}
  });
});
