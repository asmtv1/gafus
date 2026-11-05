import { createHash,createHmac,randomUUID } from "node:crypto";
import { describe,expect,it,vi } from "vitest";
vi.mock("@gafus/queues",()=>({connection:{status:"ready",set:vi.fn()}}));
vi.mock("../../modules/questions/media-v2-jobs.js",()=>({createLiveQuestionsV2Queue:vi.fn()}));
import {createQuestionsInternalDispatcher} from "./questions-media-jobs";
import type {QuestionsV2Queue} from "../../modules/questions/media-v2-jobs";
const prefix="/internal/questions/media/jobs/";
const now=()=>Date.parse("2026-11-05T10:00:00Z");
const secret=Buffer.alloc(32,0x5b);
const id=randomUUID(),token=randomUUID();
function signed(op:string,body:object,secretOverride=secret){
  const path=prefix+op, content=JSON.stringify(body),stamp=Math.floor(now()/1000).toString();
  const nonce=randomUUID(),hash=createHash("sha256").update(content).digest("hex");
  const signature=createHmac("sha256",secretOverride)
    .update(["POST",path,stamp,nonce,hash].join("\n")).digest("hex");
  return new Request("https://questions-refactor.example"+path,{
    method:"POST",headers:{"content-type":"application/json",
      "x-questions-timestamp":stamp,"x-questions-nonce":nonce,
      "x-questions-signature":signature},body:content,
  });
}
function suite(){
  const seen=new Set<string>();
  const claimCleanup=vi.fn(async()=>({job:null}));
  const completeCleanup=vi.fn(async()=>({accepted:true}));
  const failCleanup=vi.fn(async()=>({accepted:true}));
  const queue={claimCleanup,completeCleanup,failCleanup} as unknown as QuestionsV2Queue;
  const dispatch=createQuestionsInternalDispatcher({secret,queue,now,
    consumeNonce:async nonce=>{if(seen.has(nonce))return false;seen.add(nonce);return true;},
  });
  const call=(op:string,body:object)=>dispatch(signed(op,body),prefix+op);
  return {dispatch,call,claimCleanup,completeCleanup,failCleanup};
}
describe("Questions HMAC S3 cleanup leases; physical DELETE is Worker-only",()=>{
  it("accepts only signed claim/complete/fail, preserving exact DB token",async()=>{
    const t=suite();
    await expect(t.call("claim",{batchSize:1})).resolves.toEqual({job:null});
    expect(t.claimCleanup).toHaveBeenCalledOnce();
    await expect(t.call("complete",{mediaId:id,cleanupToken:token,cleanupKind:"SOURCE"})).resolves.toEqual({accepted:true});
    expect(t.completeCleanup).toHaveBeenCalledExactlyOnceWith(id,token,"SOURCE");
    await expect(t.call("fail",{mediaId:id,cleanupToken:token,cleanupKind:"SOURCE"})).resolves.toEqual({accepted:true});
    expect(t.failCleanup).toHaveBeenCalledExactlyOnceWith(id,token,"SOURCE");
  });
  it("rejects legacy cleanup endpoint so API cannot execute an S3 DELETE",async()=>{
    const t=suite();
    await expect(t.call("cleanup",{batchSize:1})).rejects.toMatchObject({status:404});
    await expect(t.call("erase",{batchSize:1})).rejects.toMatchObject({status:404});
    expect(t.claimCleanup).not.toHaveBeenCalled();
  });
  it("rejects bad signature and nonce replay before touching task state",async()=>{
    const t=suite();
    await expect(t.dispatch(signed("claim",{batchSize:1},Buffer.alloc(32,0x12)),prefix+"claim"))
      .rejects.toMatchObject({status:401});
    const req=signed("claim",{batchSize:1});
    await t.dispatch(req.clone(),prefix+"claim");
    await expect(t.dispatch(req.clone(),prefix+"claim")).rejects.toMatchObject({status:401});
    expect(t.claimCleanup).toHaveBeenCalledTimes(1);
  });
  it("rejects bulk cleanup, unsafe keys, unknown fields and invalid tokens",async()=>{
    const t=suite();
    for(const [op,body] of [
      ["claim",{batchSize:2}],
      ["claim",{batchSize:1,sourceKey:"questions/v2/other/key"}],
      ["complete",{mediaId:id,cleanupToken:"not-a-uuid",cleanupKind:"SOURCE"}],
      ["fail",{mediaId:id,cleanupToken:token,cleanupKind:"SOURCE",keys:["arbitrary"]}],
    ] as const)await expect(t.call(op,body)).rejects.toMatchObject({status:400});
    expect(t.claimCleanup).not.toHaveBeenCalled();
    expect(t.completeCleanup).not.toHaveBeenCalled();
    expect(t.failCleanup).not.toHaveBeenCalled();
  });
});
