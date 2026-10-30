import { describe,expect,it,vi } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { questionsV2SourceKey, type QuestionsV2Job } from "@gafus/feed-cloud";
import { createQuestionsV2JobRunner,type QuestionsV2Claim } from "./questions-v2-job-runner";
import type { QuestionsV2Core } from "./questions-v2-job-core";

const createClaim=():QuestionsV2Claim=>{
  const mediaId=randomUUID(),ownerId="actor_1",sourceMime="image/png" as const;
  return {mediaId,ownerId,photoId:"photo-"+mediaId,
    sourceMime,sourceBytes:0,sourceKey:questionsV2SourceKey(ownerId,mediaId,sourceMime),
    attemptToken:randomUUID(),leaseUntil:new Date(Date.now()+180_000).toISOString()};
};
async function source(){
  return sharp({create:{width:600,height:900,channels:3,background:"#ffbbaa"}})
    .png().toBuffer();
}
function core(jobs:QuestionsV2Claim[]){
  const claimOne=vi.fn(async()=>jobs.shift()??null);
  const complete=vi.fn(async()=>({accepted:true}));
  const fail=vi.fn(async()=>({accepted:true}));
  const renew=vi.fn(async()=>({accepted:true}));
  return {claimOne,complete,fail,renew} as QuestionsV2Core;
}
describe("two independent Questions Photo V2 Container Jobs",()=>{
  it("never starts an encoder or S3 call when PG has no due claim",async()=>{
    const api=core([]);
    const objectsFor=vi.fn();
    const run=createQuestionsV2JobRunner({core:api,objectsFor});
    expect(await run()).toBe(0);
    expect(objectsFor).not.toHaveBeenCalled();
  });
  it("two workers process two distinct uploads; one GET and two PUT per image",async()=>{
    const bytes=await source();
    const first=createClaim(),second=createClaim();
    first.sourceBytes=bytes.length;second.sourceBytes=bytes.length;
    const api=core([first,second]);
    const downloads=vi.fn(async()=>bytes);
    const uploads=vi.fn(async(_key:string,_data:Uint8Array)=>{});
    const close=vi.fn();
    const objectsFor=vi.fn(()=>({downloadSource:downloads,createWebp:uploads,close}));
    const runA=createQuestionsV2JobRunner({core:api,objectsFor});
    const runB=createQuestionsV2JobRunner({core:api,objectsFor});
    const result=await Promise.all([runA(),runB()]);
    expect(result).toEqual([1,1]);
    expect(api.claimOne).toHaveBeenCalledTimes(2);
    expect(api.complete).toHaveBeenCalledTimes(2);
    const idA=(api.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const idB=(api.complete as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(idA).not.toBe(idB);
    expect(downloads).toHaveBeenCalledTimes(2);
    expect(uploads).toHaveBeenCalledTimes(4);
    expect(close).toHaveBeenCalledTimes(2);
  });
  it("reports processing errors to durable Core and closes resources",async()=>{
    const job=createClaim();
    job.sourceBytes=500;
    const api=core([job]);
    const close=vi.fn();
    const run=createQuestionsV2JobRunner({core:api,
      objectsFor:()=>({downloadSource:async()=>{throw Error("S3_DOWN");},
        createWebp:async()=>{},close})});
    await expect(run()).rejects.toThrow("S3_DOWN");
    expect(api.fail).toHaveBeenCalledWith(job.mediaId,job.attemptToken,
      "QUESTIONS_V2_PROCESSING_FAILED");
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("a lost READY acknowledgment does not incorrectly mark a published image FAILED",async()=>{
    const bytes=await source(),job=createClaim();
    job.sourceBytes=bytes.length;
    const api=core([job]);
    api.complete=vi.fn(async()=>{throw Error("ACK_LOST");});
    const run=createQuestionsV2JobRunner({core:api,
      objectsFor:()=>({downloadSource:async()=>bytes,createWebp:async()=>{}})});
    await expect(run()).rejects.toThrow("ACK_LOST");
    expect(api.fail).not.toHaveBeenCalled();
  });
});
