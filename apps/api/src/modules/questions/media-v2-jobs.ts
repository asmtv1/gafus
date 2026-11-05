/** Durable, Questions-only image queue. Redis events are never authoritative. */
import { randomUUID } from "node:crypto";
import { prisma, Prisma } from "@gafus/prisma";
import { mediaTaskFailurePolicy, mediaCleanupRetryDelayMs, questionsSafeCleanupAt } from "@gafus/core/services/mediaDelivery";
import { questionsV2Head, questionsV2Marker, questionsV2CleanupKeys,
  type QuestionsV2CleanupIdentity, type QuestionsV2CleanupKind } from "@gafus/cdn-upload";
import {questionsV2FinalKeys,questionsV2ValidateJob,questionsV2ValidateManifest,
  type QuestionsV2Job,type QuestionsV2Manifest} from "@gafus/feed-cloud";
const limit=4, leaseMs=180000;
export interface QuestionsV2Claim extends QuestionsV2Job{
  photoId:string;attemptToken:string;leaseUntil:string;
}
export interface QuestionsV2CleanupClaim extends QuestionsV2CleanupIdentity {
  cleanupToken:string;
  cleanupLeaseUntil:string;
}
export interface QuestionsV2Queue{
  claimOne():Promise<{jobs:QuestionsV2Claim[]}>;
  renew(id:string,token:string):Promise<{accepted:boolean}>;
  complete(id:string,token:string,manifest:QuestionsV2Manifest):Promise<{accepted:boolean}>;
  fail(id:string,token:string,code:string):Promise<{accepted:boolean}>;
  claimCleanup():Promise<{job:QuestionsV2CleanupClaim|null}>;
  completeCleanup(mediaId:string,cleanupToken:string,cleanupKind:QuestionsV2CleanupKind):Promise<{accepted:boolean}>;
  failCleanup(mediaId:string,cleanupToken:string,cleanupKind:QuestionsV2CleanupKind):Promise<{accepted:boolean}>;
}
export function createQuestionsV2Queue(input:{
  database:typeof prisma;now?:()=>Date;
  head?:typeof questionsV2Head;
}):QuestionsV2Queue{
  const db=input.database,now=input.now??(()=>new Date());
  const head=input.head??questionsV2Head;
  function validated(task:{mediaId:string;ownerId:string;sourceKey:string;sourceMime:string;sourceBytes:number}){
    const job:QuestionsV2Job={mediaId:task.mediaId,ownerId:task.ownerId,
      sourceKey:task.sourceKey,sourceMime:task.sourceMime as QuestionsV2Job["sourceMime"],
      sourceBytes:task.sourceBytes};
    questionsV2ValidateJob(job);return job;
  }
  async function expire(){
    const t=now();
    await db.questionV2MediaTask.updateMany({
      where:{status:"AWAITING_UPLOAD",createdAt:{lt:new Date(t.getTime()-3600000)}},
      data:{status:"EXPIRED",errorCode:"UPLOAD_EXPIRED",cleanupKind:"ALL",cleanupNextAt:t},
    });
    // Expired client finalization must NEVER be claimed by a Cloud photo Job.
    await db.questionV2MediaTask.updateMany({
      where:{status:"CLIENT_PROCESSING",leaseUntil:{lt:t}},
      data:{status:"AWAITING_UPLOAD",attemptToken:null,leaseUntil:null},
    });
    // Previously queued photo-only Cloud Jobs have no processor after the
    // cutover. Do not leave old queue rows retrying forever. Honor active
    // leases and the original 10-minute signed S3 POST cleanup horizon.
    const retired=await db.questionV2MediaTask.findMany({
      where:{OR:[{status:"QUEUED"},
        {status:"PROCESSING",leaseUntil:{lt:t}}]},
      select:{mediaId:true,createdAt:true,leaseUntil:true},
      orderBy:{createdAt:"asc"},take:100,
    });
    for(const task of retired){
      await db.questionV2MediaTask.updateMany({
        where:{mediaId:task.mediaId,OR:[{status:"QUEUED"},
          {status:"PROCESSING",leaseUntil:{lt:t}}]},
        data:{status:"FAILED",attemptToken:null,leaseUntil:null,
          errorCode:"PHOTO_JOB_RETIRED",cleanupKind:"ALL",
          cleanupCompletedAt:null,
          cleanupNextAt:questionsSafeCleanupAt(t,task.createdAt,task.leaseUntil)},
      });
    }
    // Handle a crashed final attempt without prematurely sweeping a
    // still-valid signed original. Schedule the cleanup per media task.
    const exhausted=await db.questionV2MediaTask.findMany({
      where:{status:"PROCESSING",attempts:{gte:limit},leaseUntil:{lt:t}},
      select:{mediaId:true,createdAt:true},
      take:100,
    });
    for(const task of exhausted){
      await db.questionV2MediaTask.updateMany({
        where:{mediaId:task.mediaId,status:"PROCESSING",attempts:{gte:limit},
          leaseUntil:{lt:t}},
        data:{status:"FAILED",attemptToken:null,leaseUntil:null,
          cleanupKind:"ALL",cleanupCompletedAt:null,
          cleanupNextAt:questionsSafeCleanupAt(t,task.createdAt)},
      });
    }
    const deleted=await db.questionPhoto.findMany({
      where:{OR:[{question:{deletedAt:{not:null}}},{answer:{deletedAt:{not:null}}}]},
      select:{id:true},take:100,
    });
    if(deleted.length){
      // Moderation/soft-delete may not run the usual editor transaction.
      // Never delete before an in-flight signed POST or a leased Job expires.
      const tasks=await db.questionV2MediaTask.findMany({
        where:{photoId:{in:deleted.map(p=>p.id)},status:{notIn:["FAILED","EXPIRED"]}},
        select:{mediaId:true,createdAt:true,leaseUntil:true},
      });
      for(const task of tasks){
        await db.questionV2MediaTask.updateMany({
          where:{mediaId:task.mediaId,status:{notIn:["FAILED","EXPIRED"]}},
          data:{status:"EXPIRED",attemptToken:null,leaseUntil:null,
            cleanupKind:"ALL",cleanupToken:null,cleanupLeaseUntil:null,cleanupCompletedAt:null,
            cleanupNextAt:questionsSafeCleanupAt(t,task.createdAt,task.leaseUntil)},
        });
      }
    }
  }
  async function recoverMissingPhotoRows(){
    const orphans=await db.$queryRaw<{mediaId:string}[]>
      `SELECT t."mediaId" FROM "QuestionV2MediaTask" t
        LEFT JOIN "QuestionPhoto" p ON p."id" = t."photoId"
        WHERE p."id" IS NULL AND t."status" IN
          ('AWAITING_UPLOAD','QUEUED','PROCESSING','CLIENT_PROCESSING','READY')
        ORDER BY t."createdAt" ASC LIMIT 100`;
    if(!orphans.length)return;
    const tasks=await db.questionV2MediaTask.findMany({
      where:{mediaId:{in:orphans.map(o=>o.mediaId)}},
      select:{mediaId:true,createdAt:true,leaseUntil:true},
    });
    for(const task of tasks){
      await db.questionV2MediaTask.updateMany({
        where:{mediaId:task.mediaId,status:{in:["AWAITING_UPLOAD","QUEUED","PROCESSING","CLIENT_PROCESSING","READY"]}},
        data:{status:"EXPIRED",attemptToken:null,leaseUntil:null,
          cleanupKind:"ALL",cleanupToken:null,cleanupLeaseUntil:null,cleanupCompletedAt:null,
          cleanupNextAt:questionsSafeCleanupAt(now(),task.createdAt,task.leaseUntil)},
      });
    }
  }
  const cleanupWhere=(at:Date)=>({
    cleanupCompletedAt:null,cleanupNextAt:{lte:at},
    AND:[
      // A stale READY+ALL row must never starve legitimate cleanups.
      {OR:[{status:"READY",cleanupKind:"SOURCE"},
        {status:{in:["FAILED","EXPIRED"]},cleanupKind:"ALL"}]},
      {OR:[{cleanupLeaseUntil:null},{cleanupLeaseUntil:{lt:at}}]},
    ],
  });
  async function claimCleanup():Promise<{job:QuestionsV2CleanupClaim|null}>{
    await expire();
    await recoverMissingPhotoRows();
    const at=now(),where=cleanupWhere(at);
    // An owner-scoped S3 deletion is always leased in PostgreSQL before the
    // Worker sees its derivation inputs. This API does NOT delete objects.
    const task=await db.questionV2MediaTask.findFirst({
      where,orderBy:[{cleanupNextAt:"asc"},{createdAt:"asc"}],
    });
    if(!task || (task.status==="READY"&&task.cleanupKind!=="SOURCE") ||
       (task.status!=="READY"&&task.cleanupKind!=="ALL"))return {job:null};
    const identity:QuestionsV2CleanupIdentity={mediaId:task.mediaId,ownerId:task.ownerId,
      sourceKey:task.sourceKey,sourceMime:task.sourceMime,
      cleanupKind:task.cleanupKind as "SOURCE"|"ALL"};
    // Both API and Worker validate exact, non-arbitrary, owner-derived keys.
    questionsV2CleanupKeys(identity);
    const cleanupToken=randomUUID(),cleanupLeaseUntil=new Date(at.getTime()+leaseMs);
    const locked=await db.questionV2MediaTask.updateMany({
      where:{...where,mediaId:task.mediaId,status:task.status,
        cleanupKind:identity.cleanupKind},
      data:{cleanupToken,cleanupLeaseUntil,cleanupAttempts:{increment:1}},
    });
    return {job:locked.count===1?{...identity,cleanupToken,
      cleanupLeaseUntil:cleanupLeaseUntil.toISOString()}:null};
  }
  async function completeCleanup(mediaId:string,token:string,expectedKind:QuestionsV2CleanupKind):Promise<{accepted:boolean}>{
    const at=now();
    const task=await db.questionV2MediaTask.findFirst({
      where:{mediaId,cleanupToken:token,cleanupLeaseUntil:{gt:at},
        cleanupKind:expectedKind,cleanupCompletedAt:null,
        status:{in:["READY","FAILED","EXPIRED"]}},
    });
    if(!task || (task.status==="READY"&&task.cleanupKind!=="SOURCE") ||
       (task.status!=="READY"&&task.cleanupKind!=="ALL"))return {accepted:false};
    const replayDeadline=task.createdAt.getTime()+11*60_000;
    // A 10-minute signed upload might replay after the first source DELETE.
    // Repeat the idempotent DELETE once after that replay window expires.
    const mustSweep=task.cleanupKind==="SOURCE" && at.getTime()<replayDeadline;
    const updated=await db.questionV2MediaTask.updateMany({
      where:{mediaId,cleanupToken:token,cleanupLeaseUntil:{gt:at},
        status:task.status,cleanupKind:expectedKind,cleanupCompletedAt:null},
      data:mustSweep
        ?{cleanupNextAt:new Date(replayDeadline),cleanupToken:null,cleanupLeaseUntil:null}
        :{cleanupCompletedAt:at,cleanupKind:null,cleanupToken:null,cleanupLeaseUntil:null},
    });
    return {accepted:updated.count===1};
  }
  async function failCleanup(mediaId:string,token:string,expectedKind:QuestionsV2CleanupKind):Promise<{accepted:boolean}>{
    const at=now();
    const task=await db.questionV2MediaTask.findFirst({
      where:{mediaId,cleanupToken:token,cleanupLeaseUntil:{gt:at},
        cleanupKind:expectedKind,cleanupCompletedAt:null},
    });
    if(!task || (task.status==="READY"&&expectedKind!=="SOURCE") ||
       (task.status!=="READY"&&expectedKind!=="ALL"))return {accepted:false};
    const updated=await db.questionV2MediaTask.updateMany({
      where:{mediaId,cleanupToken:token,cleanupLeaseUntil:{gt:at},
        status:task.status,cleanupKind:expectedKind,cleanupCompletedAt:null},
      data:{cleanupToken:null,cleanupLeaseUntil:null,
        cleanupNextAt:new Date(at.getTime()+mediaCleanupRetryDelayMs(task.cleanupAttempts))},
    });
    return {accepted:updated.count===1};
  }
  return {
    claimCleanup,completeCleanup,failCleanup,
    async claimOne(){
      await expire();
      return db.$transaction(async tx=>{
        // Only two active photo leases across all API instances and both Cloud Jobs.
        // Transaction-scoped PG advisory lock serializes the count+claim decision:
        // SKIP LOCKED alone prevents duplicates, NOT more than two active images.
        // Fixed Questions-only lock key, never acquired by Feed/Chat/production.
        await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(7287446517851686::bigint) IS NULL AS "locked"');
        const occupied=await tx.$queryRawUnsafe<{active:number}[]>(
          'SELECT COUNT(*)::int AS "active" FROM "QuestionV2MediaTask" '+
          `WHERE "status" = 'PROCESSING' AND "leaseUntil" > (NOW() AT TIME ZONE 'UTC')`);
        if((occupied[0]?.active??2)>=2)return {jobs:[]};
        // PostgreSQL Timestamp(3) without timezone, compared to UTC.
        const sql='SELECT "mediaId" FROM "QuestionV2MediaTask" WHERE "attempts" < $1 '+
          'AND (("status" = \'QUEUED\' AND "nextAttemptAt" <= (NOW() AT TIME ZONE \'UTC\')) '+
          'OR ("status" = \'PROCESSING\' AND "leaseUntil" < (NOW() AT TIME ZONE \'UTC\'))) '+
          'ORDER BY "nextAttemptAt","createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED';
        const candidates=await tx.$queryRawUnsafe<{mediaId:string}[]>(sql,limit);
        if(!candidates.length)return {jobs:[]};
        const token=randomUUID(),lease=new Date(now().getTime()+leaseMs);
        const task=await tx.questionV2MediaTask.update({
          where:{mediaId:candidates[0]!.mediaId},
          data:{status:"PROCESSING",attemptToken:token,leaseUntil:lease,
            attempts:{increment:1}},
        });
        return {jobs:[{...validated(task),photoId:task.photoId,attemptToken:token,
          leaseUntil:lease.toISOString()}]};
      });
    },
    async renew(id,token){
      const result=await db.questionV2MediaTask.updateMany({
        where:{mediaId:id,attemptToken:token,status:"PROCESSING",leaseUntil:{gt:now()}},
        data:{leaseUntil:new Date(now().getTime()+leaseMs)}});
      return {accepted:result.count===1};
    },
    async complete(id,token,manifest){
      const task=await db.questionV2MediaTask.findFirst({
        where:{mediaId:id,attemptToken:token,status:"PROCESSING",leaseUntil:{gt:now()}}});
      if(!task)return {accepted:false};
      questionsV2ValidateManifest(validated(task),manifest);
      const unique=[...new Map(Object.values(manifest.variants).map(v=>[v.key,v])).values()];
      const checks=await Promise.allSettled(unique.map(async item=>{
        const result=await head(item.key);
        if(result.bytes!==item.bytes||result.mime!=="image/webp")
          throw Error("QUESTIONS_V2_OUTPUT_UNVERIFIED");
      }));
      for(const check of checks)if(check.status==="rejected")throw check.reason;
      const committed=await db.$transaction(async tx=>{
        const photo=await tx.questionPhoto.findFirst({where:{id:task.photoId,ownerId:task.ownerId}});
        if(!photo)return false;
        const updated=await tx.questionV2MediaTask.updateMany({
          where:{mediaId:id,attemptToken:token,status:"PROCESSING",leaseUntil:{gt:now()}},
          data:{status:"READY",attemptToken:null,leaseUntil:null,
            manifest:manifest as unknown as Prisma.InputJsonValue,errorCode:null,
            cleanupKind:"SOURCE",cleanupNextAt:now(),cleanupCompletedAt:null}});
        if(updated.count!==1)return false;
        await tx.questionPhoto.update({where:{id:task.photoId},
          data:{url:questionsV2Marker(manifest.variants.medium.key)}});
        return true;
      });
      return {accepted:committed};
    },
    async fail(id,token,code){
      const task=await db.questionV2MediaTask.findFirst({
        where:{mediaId:id,attemptToken:token,status:"PROCESSING",leaseUntil:{gt:now()}}});
      if(!task)return {accepted:false};
      const failure=mediaTaskFailurePolicy(task.attempts,limit,now());
      const terminal=failure.terminal;
      const updated=await db.questionV2MediaTask.updateMany({
        where:{mediaId:id,attemptToken:token,status:"PROCESSING",leaseUntil:{gt:now()}},
        data:{status:failure.status,attemptToken:null,leaseUntil:null,
          nextAttemptAt:failure.nextAttemptAt,
          errorCode:code.slice(0,64),
          ...(terminal?{cleanupKind:"ALL",
            cleanupNextAt:questionsSafeCleanupAt(now(),task.createdAt),cleanupCompletedAt:null}:{})}});
      return {accepted:updated.count===1};
    },
  };
}
export function createLiveQuestionsV2Queue(){
  return createQuestionsV2Queue({database:prisma});
}
