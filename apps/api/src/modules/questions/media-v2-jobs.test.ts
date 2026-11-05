import { describe,expect,it,vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { questionsV2FinalKeys,questionsV2SourceKey,
  type QuestionsV2Manifest } from "@gafus/feed-cloud";
import { createQuestionsV2Queue } from "./media-v2-jobs";

const ownerId="actor1",now=new Date("2026-10-28T13:00:00.000Z");
const media=(mediaId:string=randomUUID())=>{
  const sourceMime="image/jpeg" as const;
  return {mediaId,photoId:"photo-"+mediaId,ownerId,sourceMime,sourceBytes:100,
    sourceKey:questionsV2SourceKey(ownerId,mediaId,sourceMime),
    status:"QUEUED",attempts:0,createdAt:new Date(now.getTime()-60_000),
    attemptToken:null as string|null,
    leaseUntil:null as Date|null};
};
function fakeDb(tasks:ReturnType<typeof media>[]) {
  const claimSql:string[]=[];
  const head=vi.fn(async()=>({mime:"image/webp",bytes:100,etag:undefined}));
  const deleteObjects=vi.fn(async()=>undefined);
  const cleanupRows:Array<Record<string,unknown>>=[];
  const taskStore=new Map(tasks.map(t=>[t.mediaId,t]));
  const tx={
    $queryRawUnsafe:vi.fn(async(sql:string,maxAttempts?:number)=>{
      if(sql.includes("pg_advisory_xact_lock"))return [{pg_advisory_xact_lock:null}];
      if(sql.includes('COUNT(*)::int AS "active"'))return [{active:
        tasks.filter(t=>t.status==="PROCESSING" && t.leaseUntil && t.leaseUntil>now).length}];
      claimSql.push(sql);
      expect(maxAttempts).toBe(4);
      const task=tasks.find(t=>t.status==="QUEUED");
      if(!task)return [];
      task.status="LOCKED";
      return [{mediaId:task.mediaId}];
    }),
    questionV2MediaTask:{
      update:vi.fn(async (args:{where:{mediaId:string};data:{status:string;attemptToken:string;leaseUntil:Date}})=>{
        const task=taskStore.get(args.where.mediaId)!;
        task.status=args.data.status;
        task.attemptToken=args.data.attemptToken;
        task.leaseUntil=args.data.leaseUntil;
        task.attempts++;
        return task;
      }),
      updateMany:vi.fn(async()=>({count:1})),
    },
    questionPhoto:{
      findFirst:vi.fn(async()=>({id:"attached"})),
      update:vi.fn(async()=>({id:"attached"})),
    },
  };
  const database={
    $transaction:vi.fn(async (cb:(ctx:typeof tx)=>Promise<unknown>)=>cb(tx)),
    $queryRaw:vi.fn(async()=>[]),
    questionPhoto:{findMany:vi.fn(async()=>[])},
    questionV2MediaTask:{
      updateMany:vi.fn(async(args:{data:Record<string,unknown>})=>{
        cleanupRows.push(args.data);
        return {count:1};
      }),
      findFirst:vi.fn(async(args:{where:{mediaId?:string;attemptToken?:string;status?:unknown}})=>{
        if(args.where?.mediaId && args.where?.attemptToken)
          return taskStore.get(args.where.mediaId) ?? null;
        return null;
      }),
      findMany:vi.fn(async()=>[]),
    },
  };
  return {database:database as unknown as typeof prisma,tx,head,deleteObjects,claimSql,cleanupRows};
}

describe("Questions V2 durable PostgreSQL queue",()=>{
  it("claims two independent images under SKIP LOCKED and creates unique attempt tokens",async()=>{
    const data=fakeDb([media(),media()]);
    const queue=createQuestionsV2Queue({database:data.database,now:()=>now,
      head:data.head});
    const [first,second]=await Promise.all([queue.claimOne(),queue.claimOne()]);
    expect(first.jobs).toHaveLength(1);
    expect(second.jobs).toHaveLength(1);
    expect(first.jobs[0].mediaId).not.toBe(second.jobs[0].mediaId);
    expect(first.jobs[0].attemptToken).not.toBe(second.jobs[0].attemptToken);
    expect(data.claimSql).toHaveLength(2);
    for(const sql of data.claimSql){
      expect(sql).toContain("FOR UPDATE SKIP LOCKED");
      expect(sql).toContain("NOW() AT TIME ZONE 'UTC'");
    }
  });
  it("limits active claims to two regardless of queued photo count",async()=>{
    const data=fakeDb(Array.from({length:5},()=>media()));
    const queue=createQuestionsV2Queue({database:data.database,now:()=>now});
    const results=[];
    for(let i=0;i<5;i++)results.push(await queue.claimOne());
    expect(results.filter(r=>r.jobs.length===1)).toHaveLength(2);
    expect(results.filter(r=>r.jobs.length===0)).toHaveLength(3);
    expect(data.claimSql).toHaveLength(2);
  });
  it("a duplicate wake-up never allocates the same already-leased task",async()=>{
    const data=fakeDb([media()]);
    const queue=createQuestionsV2Queue({database:data.database,now:()=>now});
    const [first,second]=await Promise.all([queue.claimOne(),queue.claimOne()]);
    expect(first.jobs.length+second.jobs.length).toBe(1);
  });
  it("verifies every WebP HEAD before a transactional READY publication",async()=>{
    const task=media();
    task.status="PROCESSING";
    task.attemptToken=randomUUID();
    task.leaseUntil=new Date(now.getTime()+180000);
    const data=fakeDb([task]);
    const keys=questionsV2FinalKeys(ownerId,task.mediaId);
    const manifest:QuestionsV2Manifest={kind:"image",variants:{
      small:{key:keys.small,width:360,height:240,bytes:100},
      medium:{key:keys.medium,width:720,height:480,bytes:100},
    }};
    const queue=createQuestionsV2Queue({database:data.database,now:()=>now,
      head:data.head});
    const result=await queue.complete(task.mediaId,task.attemptToken,manifest);
    expect(result.accepted).toBe(true);
    expect(data.head).toHaveBeenCalledTimes(2);
    expect(data.tx.questionPhoto.update).toHaveBeenCalledWith({
      where:{id:task.photoId},
      data:{url:expect.stringContaining("/v1/image/m.webp")},
    });
    expect(data.tx.questionV2MediaTask.updateMany).toHaveBeenCalledTimes(1);
  });
  it("never commits READY if a WebP HEAD verification fails",async()=>{
    const task=media();
    task.status="PROCESSING";
    task.attemptToken=randomUUID();
    task.leaseUntil=new Date(now.getTime()+180000);
    const data=fakeDb([task]);
    const keys=questionsV2FinalKeys(ownerId,task.mediaId);
    const badHead=vi.fn(async(key:string)=>({
      mime:key.endsWith("/m.webp")?"image/png":"image/webp",bytes:100,etag:undefined,
    }));
    const queue=createQuestionsV2Queue({database:data.database,now:()=>now,
      head:badHead});
    await expect(queue.complete(task.mediaId,task.attemptToken,{
      kind:"image",variants:{
        small:{key:keys.small,width:360,height:240,bytes:100},
        medium:{key:keys.medium,width:720,height:480,bytes:100},
      },
    })).rejects.toThrow("QUESTIONS_V2_OUTPUT_UNVERIFIED");
    expect(data.tx.questionPhoto.update).not.toHaveBeenCalled();
  });
});
