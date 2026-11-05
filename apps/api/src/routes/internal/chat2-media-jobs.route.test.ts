import {createHash,createHmac,randomUUID} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {createChat2InternalDispatcher} from "./chat2-media-jobs.js";
const secret=new TextEncoder().encode("isolated-chat2-internal-test-key-128-char-do-not-use-in-cloud");
const path="/internal/chat2/media/jobs/claim";
function makeQueue(){return {
  claimOne:vi.fn(async()=>({jobs:[]})),
  cleanupPending:vi.fn(async()=>({cleaned:false})),
  renew:vi.fn(async()=>({accepted:true})),
  complete:vi.fn(async()=>({accepted:true})),
  fail:vi.fn(async()=>({accepted:true})),
};}
function fixture(){
  const queue=makeQueue();
  const seen=new Set<string>();
  const consumeNonce=vi.fn(async(id:string)=>!seen.has(id)&&(seen.add(id),true));
  return {queue,consumeNonce,dispatch:createChat2InternalDispatcher({secret,queue,consumeNonce})};
}
function signed(url:string,payload:string,opts:{nonce?:string;stamp?:string;signature?:string}={}){
  const stamp=opts.stamp??String(Math.floor(Date.now()/1000)),nonce=opts.nonce??randomUUID();
  const hash=createHash("sha256").update(payload).digest("hex");
  const signature=opts.signature??createHmac("sha256",secret)
    .update(`POST\n${new URL(url).pathname}\n${stamp}\n${nonce}\n${hash}`).digest("hex");
  return new Request(url,{method:"POST",headers:{"content-type":"application/json",
    "x-chat2-timestamp":stamp,"x-chat2-nonce":nonce,"x-chat2-signature":signature},body:payload});
}
const url="https://refactor.example.invalid"+path;
describe("Chat2 Job Core strict HMAC transport",()=>{
  it("accepts signed bounded claim and supports one job",async()=>{
    const {dispatch,queue,consumeNonce}=fixture();
    const reply=await dispatch(signed(url,JSON.stringify({batchSize:1,kind:"video"})),path);
    expect(reply).toEqual({jobs:[]});expect(queue.claimOne).toHaveBeenCalledTimes(1);
    expect(consumeNonce).toHaveBeenCalledTimes(1);
  });
  it("rejects replay even with a valid unchanged signature",async()=>{
    const {dispatch,queue}=fixture();const nonce=randomUUID();
    await dispatch(signed(url,'{"batchSize":1,"kind":"video"}',{nonce}),path);
    await expect(dispatch(signed(url,'{"batchSize":1,"kind":"video"}',{nonce}),path)).rejects.toMatchObject({status:401});
    expect(queue.claimOne).toHaveBeenCalledTimes(1);
  });
  it("rejects changed payload, stale timestamp, unsigned and query-string requests",async()=>{
    const {dispatch,queue}=fixture();
    await expect(dispatch(signed(url,'{"batchSize":2,"kind":"video"}',{signature:"0".repeat(64)}),path))
      .rejects.toMatchObject({status:401});
    await expect(dispatch(signed(url,'{"batchSize":1,"kind":"video"}',{stamp:String(Math.floor(Date.now()/1000)-500)}),path))
      .rejects.toMatchObject({status:401});
    await expect(dispatch(new Request(url,{method:"POST",body:'{"batchSize":1,"kind":"video"}'}),path))
      .rejects.toMatchObject({status:415});
    await expect(dispatch(signed(url+"?x=1",'{"batchSize":1,"kind":"video"}'),path))
      .rejects.toMatchObject({status:404});
    expect(queue.claimOne).not.toHaveBeenCalled();
  });
  it("rejects invalid JSON command and forbidden batch size after signature",async()=>{
    const {dispatch,queue}=fixture();
    await expect(dispatch(signed(url,'{"batchSize":2,"kind":"video"}'),path))
      .rejects.toMatchObject({status:400});
    await expect(dispatch(signed(url,'{"batchSize":1,"kind":"video","inject":true}'),path))
      .rejects.toMatchObject({status:400});
    expect(queue.claimOne).not.toHaveBeenCalled();
  });
  it("rejects retired image claims even when signed",async()=>{
    const {dispatch,queue}=fixture();
    await expect(dispatch(signed(url,'{"batchSize":1,"kind":"image"}'),path))
      .rejects.toMatchObject({status:400});
    expect(queue.claimOne).not.toHaveBeenCalled();
  });
  it("rejects data larger than 16k even without content-length",async()=>{
    const {dispatch,queue}=fixture();
    const body=JSON.stringify({batchSize:1,extra:"x".repeat(17_000)});
    await expect(dispatch(signed(url,body),path)).rejects.toMatchObject({status:413});
    expect(queue.claimOne).not.toHaveBeenCalled();
  });
});
