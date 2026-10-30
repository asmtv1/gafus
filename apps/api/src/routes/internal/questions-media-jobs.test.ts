import { createHash,createHmac,randomUUID } from "node:crypto";
import { describe,expect,it,vi } from "vitest";

vi.mock("@gafus/queues",()=>({connection:{status:"ready",set:vi.fn()}}));
vi.mock("../../modules/questions/media-v2-jobs.js",()=>({
  createLiveQuestionsV2Queue:vi.fn(),
}));
import { createQuestionsInternalDispatcher } from "./questions-media-jobs";
import type { QuestionsV2Queue } from "../../modules/questions/media-v2-jobs";

const path="/internal/questions/media/jobs/claim";
const now=()=>Date.parse("2026-10-28T10:00:00Z");
const secret=Buffer.alloc(32,0x5b);
function signed(body:object,p=path,secretOverride=secret){
  const content=JSON.stringify(body),stamp=Math.floor(now()/1000).toString();
  const nonce=randomUUID(),sha=createHash("sha256").update(content).digest("hex");
  const value=["POST",p,stamp,nonce,sha].join("\n");
  const signature=createHmac("sha256",secretOverride).update(value).digest("hex");
  return new Request("https://questions-refactor.example"+p,{
    method:"POST",headers:{"content-type":"application/json",
      "x-questions-timestamp":stamp,"x-questions-nonce":nonce,
      "x-questions-signature":signature},body:content,
  });
}
function suite(){
  const seen=new Set<string>();
  const claimOne=vi.fn(async()=>({jobs:[]}));
  const cleanupPending=vi.fn(async()=>({cleaned:true}));
  const renew=vi.fn(async()=>({accepted:false}));
  const complete=vi.fn(async()=>({accepted:false}));
  const fail=vi.fn(async()=>({accepted:false}));
  const queue={claimOne,cleanupPending,renew,complete,fail} as QuestionsV2Queue;
  const dispatch=createQuestionsInternalDispatcher({secret,queue,now,
    consumeNonce:async nonce=>{
      if(seen.has(nonce))return false;
      seen.add(nonce);
      return true;
    }});
  return {dispatch,claimOne,cleanupPending,renew,complete,fail};
}
describe("Questions Photo V2 internal Job HMAC boundary",()=>{
  it("accepts only a signed exact claim command",async()=>{
    const t=suite();
    await expect(t.dispatch(signed({batchSize:1}),path))
      .resolves.toEqual({jobs:[]});
    expect(t.claimOne).toHaveBeenCalledOnce();
  });
  it("rejects unsigned and mistargeted requests before queue methods",async()=>{
    const t=suite();
    await expect(t.dispatch(signed({batchSize:1},path,Buffer.alloc(32,0x12)),path))
      .rejects.toMatchObject({status:401});
    await expect(t.dispatch(signed({batchSize:1}),"/internal/questions/media/jobs/cleanup"))
      .rejects.toMatchObject({status:404});
    expect(t.claimOne).not.toHaveBeenCalled();
  });
  it("rejects replayed nonce even with a valid signature",async()=>{
    const t=suite();
    const request=signed({batchSize:1});
    await t.dispatch(request.clone(),path);
    await expect(t.dispatch(request.clone(),path))
      .rejects.toMatchObject({status:401});
    expect(t.claimOne).toHaveBeenCalledOnce();
  });
  it("rejects unsupported/bulk job commands instead of opening generic API",async()=>{
    const t=suite();
    await expect(t.dispatch(signed({batchSize:2}),path))
      .rejects.toMatchObject({status:400});
    await expect(t.dispatch(signed({batchSize:1},"/internal/questions/media/jobs/erase"),
      "/internal/questions/media/jobs/erase")).rejects.toMatchObject({status:404});
  });
});
