import {describe,it,expect,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {chat2V2FinalKeys,chat2V2SourceKey} from "@gafus/feed-cloud";
import {createChat2V2Queue} from "./media-v2-jobs.js";
const time=new Date("2026-10-27T20:00:00.000Z");
function fixture(status:"READY"|"FAILED"|"EXPIRED"="READY") {
 const conversationId="private_room",ownerId="media_owner",mediaId=randomUUID(),sourceMime="image/jpeg";
 const row={mediaId,conversationId,ownerId,sourceMime,sourceBytes:256,
  sourceKey:chat2V2SourceKey(conversationId,ownerId,mediaId,sourceMime),status:status as string,
  cleanupKind:status==="READY"?"SOURCE":"ALL",cleanupToken:null as string|null,
  cleanupLeaseUntil:null as Date|null,cleanupNextAt:new Date(time.getTime()-1000),
  cleanupCompletedAt:null as Date|null,cleanupAttempts:0,
  attempts:1,attemptToken:randomUUID(),leaseUntil:new Date(time.getTime()+100000)};
 const deleted:string[][]=[];
 const remove=vi.fn(async(keys:readonly string[])=>{deleted.push([...keys]);});
 const findFirst=vi.fn(async ({where}:any)=>{
  if(where.cleanupKind){if(row.cleanupKind&&row.cleanupCompletedAt===null&&row.cleanupNextAt<=time&&
     (!where.mediaId||where.mediaId===row.mediaId)&&
     (!row.cleanupLeaseUntil||row.cleanupLeaseUntil<time))return {...row};return null;}
  if(where.status==="PROCESSING")return row.status==="PROCESSING"?{...row}:null;
  return null;
 });
 const updateMany=vi.fn(async({where,data}:any)=>{
  if(where.mediaId&&where.mediaId!==row.mediaId)return {count:0};
  if(where.cleanupToken&&where.cleanupToken!==row.cleanupToken)return {count:0};
  if(where.status==="PROCESSING"&&row.status!=="PROCESSING")return {count:0};
  if(!where.mediaId)return {count:0};
  for(const [k,v]of Object.entries(data)){if(v&&typeof v==='object'&&'increment'in v)(row as any)[k]+=(v as any).increment;
    else (row as any)[k]=v;}
  return {count:1};
 });
 const db={chat2V2MediaTask:{findFirst,updateMany},$transaction:vi.fn()};
 return {row,remove,deleted,db,updateMany};
}
describe("Chat2 media V2 durable S3 cleanup after terminal state",()=>{
 it("deletes the original automatically as part of successful READY commit",async()=>{
  const x=fixture("READY");x.row.status="PROCESSING" as never;
  const q=createChat2V2Queue({database:x.db as never,deleteObjects:x.remove,now:()=>time,
    head:vi.fn(async()=>({status:200,bytes:1234,mime:"image/webp"}))});
  const keys=chat2V2FinalKeys(x.row.conversationId,x.row.ownerId,x.row.mediaId);
  const manifest={kind:"image" as const,width:720,height:1152,keys:keys.image,
    imageSizes:{small:{width:360,height:576},medium:{width:720,height:1152}}};
  expect(await q.complete(x.row.mediaId,x.row.attemptToken,manifest)).toEqual({accepted:true});
  expect(x.row.status).toBe("READY");
  expect(x.deleted).toEqual([[x.row.sourceKey]]);
  expect(x.row.cleanupCompletedAt).toEqual(time);
 });
 it("READY is not rolled back if S3 original deletion fails; keeps a retry ledger",async()=>{
  const x=fixture("READY");x.row.status="PROCESSING" as never;
  x.remove.mockRejectedValueOnce(new Error("S3_UNAVAILABLE"));
  const q=createChat2V2Queue({database:x.db as never,deleteObjects:x.remove,now:()=>time,
    head:vi.fn(async()=>({status:200,bytes:1234,mime:"image/webp"}))});
  const keys=chat2V2FinalKeys(x.row.conversationId,x.row.ownerId,x.row.mediaId);
  expect(await q.complete(x.row.mediaId,x.row.attemptToken,{kind:"image",width:720,height:1152,
    keys:keys.image,imageSizes:{small:{width:360,height:576},medium:{width:720,height:1152}}}))
    .toEqual({accepted:true});
  expect(x.row.status).toBe("READY");
  expect(x.row.cleanupKind).toBe("SOURCE");
  expect(x.row.cleanupCompletedAt).toBeNull();
  expect(x.row.cleanupNextAt.getTime()).toBeGreaterThan(time.getTime());
 });
 it("deletes ONLY the incoming original after READY and persists completion",async()=>{
  const x=fixture("READY");const q=createChat2V2Queue({database:x.db as never,deleteObjects:x.remove,now:()=>time});
  expect(await q.cleanupPending()).toEqual({cleaned:true});
  expect(x.deleted).toEqual([[x.row.sourceKey]]);
  expect(x.row.cleanupKind).toBeNull();expect(x.row.cleanupCompletedAt).toEqual(time);
  expect(await q.cleanupPending()).toEqual({cleaned:false});
  expect(x.remove).toHaveBeenCalledTimes(1);
 });
 it("terminal FAILED removes one source and exactly 5 potential variants",async()=>{
  const x=fixture("FAILED");const q=createChat2V2Queue({database:x.db as never,deleteObjects:x.remove,now:()=>time});
  expect(await q.cleanupPending()).toEqual({cleaned:true});
  const final=chat2V2FinalKeys(x.row.conversationId,x.row.ownerId,x.row.mediaId);
  expect(x.deleted[0]).toEqual([x.row.sourceKey,...Object.values(final.image),final.video.poster,...Object.values(final.video.variants)]);
  expect(x.deleted[0]).toHaveLength(6);
 });
 it("S3 failure preserves cleanup intent for later retry without claiming success",async()=>{
  const x=fixture("READY");x.remove.mockRejectedValueOnce(new Error("S3_DOWN"));
  const q=createChat2V2Queue({database:x.db as never,deleteObjects:x.remove,now:()=>time});
  expect(await q.cleanupPending()).toEqual({cleaned:false});
  expect(x.row.cleanupKind).toBe("SOURCE");expect(x.row.cleanupCompletedAt).toBeNull();
  expect(x.row.cleanupNextAt.getTime()).toBeGreaterThan(time.getTime());
  expect(x.row.cleanupToken).toBeNull();
  expect(await q.cleanupPending()).toEqual({cleaned:false});
  expect(x.remove).toHaveBeenCalledTimes(1);
 });
 it("will never remove objects belonging to an active PROCESSING task",async()=>{
  const x=fixture("READY");x.row.status="PROCESSING" as never;
  const q=createChat2V2Queue({database:x.db as never,deleteObjects:x.remove,now:()=>time});
  expect(await q.cleanupPending()).toEqual({cleaned:false});
  expect(x.remove).not.toHaveBeenCalled();
 });
});
