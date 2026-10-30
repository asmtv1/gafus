import {describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {chat2V2SourceKey,chat2V2FinalKeys} from "@gafus/feed-cloud";
import {createChat2V2Queue} from "./media-v2-jobs.js";
const now=new Date("2026-10-27T15:00:00.000Z");
function task(){
 const conversationId="room1",ownerId="actor1",mediaId=randomUUID(),sourceMime="image/jpeg";
 return {mediaId,conversationId,ownerId,sourceMime,sourceBytes:120,
   sourceKey:chat2V2SourceKey(conversationId,ownerId,mediaId,sourceMime),attempts:1,
   status:"PROCESSING",attemptToken:randomUUID(),leaseUntil:new Date(now.getTime()+120_000)};
}
function db(row=task()){
 const updateMany=vi.fn(async()=>({count:1}));
 const findFirst=vi.fn(async()=>row);
 const queryRaw=vi.fn(async(_strings:TemplateStringsArray,..._params:unknown[])=>[{mediaId:row.mediaId}]);
 const update=vi.fn(async()=>row);
 return {row,db:{chat2V2MediaTask:{findFirst,updateMany,update},
   $transaction:vi.fn(async(fn:(tx:unknown)=>Promise<unknown>)=>fn({$queryRaw:queryRaw,chat2V2MediaTask:{update}}))},
   updateMany,findFirst,queryRaw,update};
}
function imageKeys(row:ReturnType<typeof task>){return chat2V2FinalKeys(row.conversationId,row.ownerId,row.mediaId).image;}
const envDate=()=>now;
describe("Chat2 V2 durable queue lease and manifest CAS",()=>{
 it("uses UTC SQL comparisons for lease and retry timestamps on non-UTC PG servers",async()=>{
  const x=db();const q=createChat2V2Queue({database:x.db as never,now:envDate});
  await q.claimOne("image");
  const template=x.queryRaw.mock.calls[0]?.[0];
  expect(template).toBeDefined();
  const sql=Array.from(template!).join(" ");
  expect(sql).toContain("\"nextAttemptAt\" <= (NOW() AT TIME ZONE 'UTC')");
  expect(sql).toContain("\"leaseUntil\" < (NOW() AT TIME ZONE 'UTC')");
  expect(sql).toContain("FOR UPDATE SKIP LOCKED");
 });
 it("claims one UUID token under the locked transaction",async()=>{
  const x=db();const q=createChat2V2Queue({database:x.db as never,now:envDate});
  const result=await q.claimOne("image");
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0].mediaId).toBe(x.row.mediaId);
  expect(result.jobs[0].attemptToken).toMatch(/^[0-9a-f-]{36}$/);
  expect(x.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"PROCESSING"})}));
  expect(x.db.$transaction).toHaveBeenCalledTimes(1);
 });
 it("renews only the still-valid leased attempt",async()=>{
  const x=db();const q=createChat2V2Queue({database:x.db as never,now:envDate});
  expect(await q.renew(x.row.mediaId,x.row.attemptToken)).toEqual({accepted:true});
  expect(x.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({status:"PROCESSING",attemptToken:x.row.attemptToken,
     leaseUntil:{gt:now}})}));
 });
 it("verifies each public object before committing READY; requires exact manifest",async()=>{
  const x=db();const m={kind:"image" as const,width:720,height:480,keys:imageKeys(x.row),imageSizes:{small:{width:360,height:240},medium:{width:720,height:480}}};
  const head=vi.fn(async(_url:string)=>({status:200,bytes:1024,mime:"image/webp"}));
  const q=createChat2V2Queue({database:x.db as never,head,now:envDate});
  expect(await q.complete(x.row.mediaId,x.row.attemptToken,m)).toEqual({accepted:true});
  expect(head).toHaveBeenCalledTimes(2);
  expect(x.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"READY"})}));
  head.mockClear();x.updateMany.mockClear();
  await expect(q.complete(x.row.mediaId,x.row.attemptToken,{...m,keys:{small:"other/s.webp",medium:m.keys.medium}}))
    .rejects.toThrow("CHAT2_V2_INVALID_MANIFEST");
  expect(head).not.toHaveBeenCalled();expect(x.updateMany).not.toHaveBeenCalled();
 });
 it("rejects missing S3 objects before READY, without status mutation",async()=>{
  const x=db();const q=createChat2V2Queue({database:x.db as never,now:envDate,
    head:vi.fn(async()=>({status:404,bytes:0,mime:""}))});
  await expect(q.complete(x.row.mediaId,x.row.attemptToken,
    {kind:"image",width:720,height:480,keys:imageKeys(x.row),imageSizes:{small:{width:360,height:240},medium:{width:720,height:480}}}))
    .rejects.toThrow("CHAT2_V2_S3_OUTPUT_UNVERIFIED");
  expect(x.updateMany).not.toHaveBeenCalled();
 });
 it("requeues transient failures but makes fourth attempt terminal",async()=>{
  const x=db();const q=createChat2V2Queue({database:x.db as never,now:envDate});
  expect(await q.fail(x.row.mediaId,x.row.attemptToken,"RETRYABLE_ERROR")).toEqual({accepted:true});
  expect(x.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"QUEUED"})}));
  x.updateMany.mockClear();x.row.attempts=4;
  await q.fail(x.row.mediaId,x.row.attemptToken,"FAILED");
  expect(x.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"FAILED"})}));
 });
 it("denies completion when no active matching lease exists",async()=>{
  const x=db();x.findFirst.mockResolvedValueOnce(null as never);
  const q=createChat2V2Queue({database:x.db as never,now:envDate});
  expect(await q.complete(x.row.mediaId,randomUUID(),
    {kind:"image",width:720,height:480,keys:imageKeys(x.row),imageSizes:{small:{width:360,height:240},medium:{width:720,height:480}}})).toEqual({accepted:false});
  expect(x.updateMany).not.toHaveBeenCalled();
 });
});


describe("Chat2 type-isolated job pool",()=>{
 it("only accepts image/video typed claim and passes it into locked SQL",async()=>{
  const x=db();const q=createChat2V2Queue({database:x.db as never,now:envDate});
  await q.claimOne("image");
  // Simulate an incorrectly delivered image row for a VIDEO claim: safety
  // validation prevents worker S3 access even if DB query is mocked wrong.
  await expect(q.claimOne("video")).rejects.toThrow("CHAT2_CLAIM_MIME_KIND_MISMATCH");
  expect(x.queryRaw).toHaveBeenCalledTimes(2);
  expect(x.update).toHaveBeenCalledTimes(2);
  await expect(q.claimOne("file" as never)).rejects.toThrow("CHAT2_INVALID_JOB_KIND");
  expect(x.queryRaw).toHaveBeenCalledTimes(2);
 });
});
