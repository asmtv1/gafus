/**
 * Durable Refactor-only Chat2 media V2 lease queue. No existing Chat2Media
 * rows are changed and no actual message is published by this worker queue.
 * Must be activated only after the authenticated upload path is implemented.
 */
import { randomUUID } from "node:crypto";
import { prisma, Prisma } from "@gafus/prisma";
import { mediaTaskFailurePolicy, mediaCleanupRetryDelayMs } from "@gafus/core/services/mediaDelivery";
import { chat2V2DeleteObjects,chat2V2ClientSmallKey,chat2V2ClientVideoPosterKey } from "@gafus/cdn-upload";
import { chat2V2FinalKeys, validateChat2V2Job, validateChat2V2Manifest,
  type Chat2V2Job, type Chat2V2Manifest, type Chat2JobKind } from "@gafus/feed-cloud";

const maxAttempts=4;
const leaseMs=3*60_000;
const publicHost="https://gafus-chat2-media-2026.s3.cloud.ru";
export type { Chat2JobKind } from "@gafus/feed-cloud";
export interface Chat2QueueCore {
  claimOne(kind:Chat2JobKind): Promise<{jobs: Array<Chat2V2Job & {attemptToken:string;leaseUntil:string}>}>;
  renew(mediaId:string,attemptToken:string):Promise<{accepted:boolean}>;
  complete(mediaId:string,attemptToken:string,manifest:Chat2V2Manifest):Promise<{accepted:boolean}>;
  fail(mediaId:string,attemptToken:string,code:string):Promise<{accepted:boolean}>;
  cleanupPending():Promise<{cleaned:boolean}>;
}
export function createChat2V2Queue(input:{
  database:typeof prisma;
  now?:()=>Date;
  head?:(url:string)=>Promise<{status:number;bytes:number;mime:string}>;
  deleteObjects?:(keys:readonly string[])=>Promise<void>;
}):Chat2QueueCore {
  const now=input.now??(()=>new Date());
  const remove=input.deleteObjects??chat2V2DeleteObjects;
  /** Claim exactly one terminal cleanup row with a 3-min lease. No S3 deletion
   * is attempted for QUEUED/PROCESSING (a retry still needs its original). */
  async function cleanupOne(mediaId?:string):Promise<{cleaned:boolean}>{
    const t=now(),lease=new Date(t.getTime()+180_000);
    const where={
      ...(mediaId?{mediaId}:{}),
      status:{in:["READY","FAILED","EXPIRED"]},
      cleanupKind:{in:["SOURCE","ALL"]},cleanupCompletedAt:null,
      cleanupNextAt:{lte:t},
      OR:[{cleanupLeaseUntil:null},{cleanupLeaseUntil:{lt:t}}],
    };
    const record=await input.database.chat2V2MediaTask.findFirst({where,orderBy:{cleanupNextAt:"asc"}});
    if(!record||!["READY","FAILED","EXPIRED"].includes(record.status)||
      (record.status==="READY"&&record.cleanupKind!=="SOURCE")||
      (record.status!=="READY"&&record.cleanupKind!=="ALL"))return {cleaned:false};
    const token=randomUUID();
    const lock=await input.database.chat2V2MediaTask.updateMany({where:{...where,mediaId:record.mediaId},
      data:{cleanupToken:token,cleanupLeaseUntil:lease,cleanupAttempts:{increment:1}}});
    if(lock.count!==1)return {cleaned:false};
    try{
      const keys=chat2V2FinalKeys(record.conversationId,record.ownerId,record.mediaId);
      const staged=record.sourceMime==="image/webp"?[chat2V2ClientSmallKey(record.sourceKey)]:
        record.sourceMime==="video/mp4"?[chat2V2ClientVideoPosterKey(record.sourceKey)]:[];
      const objects=record.cleanupKind==="SOURCE"?[record.sourceKey,...staged]:[
        record.sourceKey,...staged,...Object.values(keys.image),keys.video.poster,...Object.values(keys.video.variants)];
      // Regenerate exact keys from the trusted DB identity, never caller input.
      await remove(objects);
      await input.database.chat2V2MediaTask.updateMany({where:{mediaId:record.mediaId,cleanupToken:token},
        data:{cleanupCompletedAt:now(),cleanupKind:null,cleanupToken:null,cleanupLeaseUntil:null}});
      return {cleaned:true};
    }catch{
      const delay=mediaCleanupRetryDelayMs(record.cleanupAttempts);
      await input.database.chat2V2MediaTask.updateMany({where:{mediaId:record.mediaId,cleanupToken:token},
        data:{cleanupNextAt:new Date(now().getTime()+delay),cleanupToken:null,cleanupLeaseUntil:null}});
      return {cleaned:false};
    }
  }
  async function recoverTerminalOrphans(){
    // Signed POST expires in 10min: after 1h an unconfirmed reservation is stale.
    await input.database.chat2V2MediaTask.updateMany({
      where:{status:"AWAITING_UPLOAD",createdAt:{lt:new Date(now().getTime()-3_600_000)}},
      data:{status:"EXPIRED",cleanupKind:"ALL",cleanupNextAt:now()}
    });
    // A verified upload that was never sent must not live forever in S3.
    await input.database.chat2V2MediaTask.updateMany({
      where:{status:"UPLOADED",createdAt:{lt:new Date(now().getTime()-3_600_000)}},
      data:{status:"EXPIRED",cleanupKind:"ALL",cleanupNextAt:now()}
    });
    // Client-only S3 verification/copy uses a separate lease; after a crash,
    // restore the reservation without ever waking a Cloud photo Job.
    await input.database.chat2V2MediaTask.updateMany({
      where:{status:"CLIENT_PROCESSING",leaseUntil:{lt:now()}},
      data:{status:"AWAITING_UPLOAD",attemptToken:null,leaseUntil:null},
    });
    // Old Chat2 photo Jobs are retired. A queued image has no processor and
    // an expired image lease cannot be retried; settle both states directly.
    // Client WebP never uses QUEUED/PROCESSING and video stays untouched.
    await input.database.chat2V2MediaTask.updateMany({
      where:{status:"QUEUED",sourceMime:{startsWith:"image/"}},
      data:{status:"FAILED",attemptToken:null,leaseUntil:null,
        errorCode:"PHOTO_JOB_RETIRED",cleanupKind:"ALL",cleanupNextAt:now(),
        cleanupCompletedAt:null},
    });
    await input.database.chat2V2MediaTask.updateMany({
      where:{status:"PROCESSING",sourceMime:{startsWith:"image/"},leaseUntil:{lt:now()}},
      data:{status:"FAILED",attemptToken:null,leaseUntil:null,
        errorCode:"PHOTO_JOB_RETIRED",cleanupKind:"ALL",cleanupNextAt:now(),
        cleanupCompletedAt:null},
    });
    // A crashed fourth attempt cannot be claimed again; schedule its cleanup.
    await input.database.chat2V2MediaTask.updateMany({
      where:{status:"PROCESSING",attempts:{gte:maxAttempts},leaseUntil:{lt:now()}},
      data:{status:"FAILED",attemptToken:null,leaseUntil:null,cleanupKind:"ALL",cleanupNextAt:now()}
    });
  }

  const head=input.head??(async url=>{
    const res=await fetch(url,{method:"HEAD",redirect:"error",signal:AbortSignal.timeout(8000),cache:"no-store"});
    return {status:res.status,bytes:Number(res.headers.get("content-length")),
      mime:res.headers.get("content-type")?.split(";")[0]??""};
  });
  async function verifyOutputs(job:Chat2V2Job,manifest:Chat2V2Manifest){
    validateChat2V2Manifest(job,manifest);
    const expected=manifest.kind==="image"
      ?[{key:manifest.keys.small,mime:"image/webp",bytes:0},
        {key:manifest.keys.medium,mime:"image/webp",bytes:0}]
      :[...(manifest.posterKey?[{key:manifest.posterKey,mime:"image/webp",bytes:0}]:[]),
        ...manifest.renditions.map(r=>({key:r.key,mime:"video/mp4",bytes:r.bytes}))];
    // Still independently HEAD EVERY variant before READY, but overlap
    // network latency for the two or three small metadata-only checks.
    // allSettled ensures no outstanding HEAD outlives the completion attempt.
    const verified = await Promise.allSettled(expected.map(async item => {
      const out = await head(publicHost+"/"+item.key);
      if(out.status!==200 || out.mime!==item.mime || !Number.isSafeInteger(out.bytes) ||
          out.bytes<12 || (item.bytes>0 && out.bytes!==item.bytes))
        throw Error("CHAT2_V2_S3_OUTPUT_UNVERIFIED");
    }));
    for (const item of verified) if (item.status === "rejected") throw item.reason;
  }
  return {
    async cleanupPending(){await recoverTerminalOrphans();return cleanupOne();},
    async claimOne(kind){
      if(kind!=="image"&&kind!=="video")throw Error("CHAT2_INVALID_JOB_KIND");
      // Opportunistic janitor: one bounded deletion per invocation. The
      // separate signed cleanup endpoint allows scheduled reconciliation.
      await recoverTerminalOrphans();
      await cleanupOne();
      // A row lock with SKIP LOCKED makes overlapping Cloud Job launches safe.
      return input.database.$transaction(async tx=>{
        // All @db.Timestamp(3) values use UTC without time zone; NOW() must
        // be converted to UTC, or non-UTC PostgreSQL servers instantly reclaim
        // active leases that were created using JS Date.
        const candidates=await tx.$queryRaw<{mediaId:string}[]>`
          SELECT "mediaId" FROM "Chat2V2MediaTask"
          WHERE "attempts" < ${maxAttempts}
            AND ((${kind} = 'image' AND "sourceMime" LIKE 'image/%')
              OR (${kind} = 'video' AND "sourceMime" LIKE 'video/%'))
            AND (("status"='QUEUED' AND "nextAttemptAt" <= (NOW() AT TIME ZONE 'UTC'))
              OR ("status"='PROCESSING' AND "leaseUntil" < (NOW() AT TIME ZONE 'UTC'))
              OR (${kind} = 'video' AND "status"='READY'
                AND "nextAttemptAt" <= (NOW() AT TIME ZONE 'UTC')
                AND ("attemptToken" IS NULL OR "leaseUntil" < (NOW() AT TIME ZONE 'UTC'))
                AND ("manifest"->'renditions') @> '[{"quality":720}]'::jsonb
                AND NOT ("manifest"->'renditions') @> '[{"quality":360}]'::jsonb))
          -- A new message with an unpublished 720p always wins over an
          -- already-playable video's optional 360p enrichment.
          ORDER BY CASE WHEN "status"='READY' THEN 1 ELSE 0 END,
            "nextAttemptAt" ASC,"createdAt" ASC
          LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if(!candidates.length)return {jobs:[]};
        const token=randomUUID(),lease=new Date(now().getTime()+leaseMs);
        const current=await tx.chat2V2MediaTask.findUnique({where:{mediaId:candidates[0]!.mediaId}});
        if (!current) return {jobs:[]};
        const background=current.status==="READY";
        if (background && (current.sourceMime.startsWith("image/") || !current.manifest ||
            (current.manifest as {kind?:string}).kind!=="video"))
          throw Error("CHAT2_BACKGROUND_NOT_VIDEO");
        const task=await tx.chat2V2MediaTask.update({
          where:{mediaId:current.mediaId},
          data:{status:background?"READY":"PROCESSING",attemptToken:token,leaseUntil:lease,
            attempts:{increment:1}}
        });
        const job:Chat2V2Job={conversationId:task.conversationId,ownerId:task.ownerId,
          mediaId:task.mediaId,sourceMime:task.sourceMime as Chat2V2Job["sourceMime"],
          sourceBytes:task.sourceBytes,sourceKey:task.sourceKey};
        const verified=validateChat2V2Job(job);
        if(verified.kind!==kind)throw Error("CHAT2_CLAIM_MIME_KIND_MISMATCH");
        return {jobs:[{...job,...(background?{phase:"background_360" as const}:{}),
          attemptToken:token,leaseUntil:lease.toISOString()}]};
      });
    },
    async renew(mediaId,attemptToken){
      const updated=await input.database.chat2V2MediaTask.updateMany({
        where:{mediaId,attemptToken,status:{in:["PROCESSING","READY"]},leaseUntil:{gt:now()}},
        data:{leaseUntil:new Date(now().getTime()+leaseMs)}
      });
      return {accepted:updated.count===1};
    },
    async complete(mediaId,attemptToken,manifest){
      const task=await input.database.chat2V2MediaTask.findFirst({
        where:{mediaId,attemptToken,status:{in:["PROCESSING","READY"]},leaseUntil:{gt:now()}}
      });
      if(!task)return {accepted:false};
      const job:Chat2V2Job={conversationId:task.conversationId,ownerId:task.ownerId,
        mediaId:task.mediaId,sourceMime:task.sourceMime as Chat2V2Job["sourceMime"],
        sourceBytes:task.sourceBytes,sourceKey:task.sourceKey};
      const background=task.status==="READY";
      let finalManifest=manifest;
      if(background){
        if(!task.manifest)throw Error("CHAT2_360_BASE_MISSING");
        const base=task.manifest as unknown as Chat2V2Manifest;
        validateChat2V2Manifest(job,base);
        if(base.kind!=="video" || manifest.kind!=="video" ||
            base.renditions.length!==1 || base.renditions[0]?.quality!==720 ||
            manifest.renditions.length!==1 || manifest.renditions[0]?.quality!==360 ||
            !base.posterKey || manifest.posterKey !== undefined ||
            manifest.width>base.width || manifest.height>base.height ||
            Math.abs(manifest.durationSeconds-base.durationSeconds)>1)
          throw Error("CHAT2_360_PHASE_MISMATCH");
        finalManifest={...base,renditions:[...base.renditions,...manifest.renditions]};
        validateChat2V2Manifest(job,finalManifest);
      } else if(task.manifest) throw Error("CHAT2_INITIAL_ALREADY_HAS_MANIFEST");
      await verifyOutputs(job,manifest);
      const updated=await input.database.chat2V2MediaTask.updateMany({
        where:{mediaId,attemptToken,status:background?"READY":"PROCESSING",leaseUntil:{gt:now()}},
        data:background?{attemptToken:null,leaseUntil:null,errorCode:null,
          nextAttemptAt:new Date("9999-01-01T00:00:00Z"),
          manifest:finalManifest as unknown as Prisma.InputJsonValue}:{
          status:"READY",attemptToken:null,leaseUntil:null,manifest:manifest as unknown as Prisma.InputJsonValue,errorCode:null,
          nextAttemptAt:manifest.kind==="video"&&manifest.renditions.length===1&&manifest.renditions[0]?.quality===720
            ? now():new Date("9999-01-01T00:00:00Z"),
          attempts:0, // New 360p phase has its own retry budget, independent of 720p.
          cleanupKind:"SOURCE",cleanupNextAt:now(),cleanupCompletedAt:null}
      });
      if(updated.count===1&&!background)await cleanupOne(mediaId); // READY first, then remove source
      return {accepted:updated.count===1};
    },
    async fail(mediaId,attemptToken,code){
      const task=await input.database.chat2V2MediaTask.findFirst({
        where:{mediaId,attemptToken,status:{in:["PROCESSING","READY"]},leaseUntil:{gt:now()}}
      });
      if(!task)return {accepted:false};
      const background=task.status==="READY";
      const failure=mediaTaskFailurePolicy(task.attempts,maxAttempts,now());
      const terminal=failure.terminal;
      const updated=await input.database.chat2V2MediaTask.updateMany({
        where:{mediaId,attemptToken,status:background?"READY":"PROCESSING",leaseUntil:{gt:now()}},
        data:{status:background?"READY":failure.status,attemptToken:null,leaseUntil:null,
          nextAttemptAt:failure.nextAttemptAt,errorCode:background?"VIDEO_360_RETRY":code.slice(0,64),
          ...(!background&&terminal?{cleanupKind:"ALL",cleanupNextAt:now(),cleanupCompletedAt:null}:{})}
      });
      if(terminal&&!background&&updated.count===1)await cleanupOne(mediaId);
      return {accepted:updated.count===1};
    },
  };
}
export function createLiveChat2V2Queue(){return createChat2V2Queue({database:prisma});}
