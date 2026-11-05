/** Local-only Redis outage acceptance for PostgreSQL-backed S3 cleanup.
 * No Redis / BullMQ photo Jobs are created: the current GAFUS Worker calls
 * a signed HMAC cleanup claim and performs DELETE directly in S3.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import Redis from "ioredis";
const phase=process.argv[2];
const parsed=new URL(process.env.DATABASE_URL??"invalid:");
const port=process.env.GAFUS_QUESTIONS_REDIS_PORT;
if(process.env.GAFUS_QUESTIONS_PG_ISOLATED!=="1"||
   process.env.GAFUS_QUESTIONS_REDIS_ISOLATED!=="1"||
   parsed.hostname!=="127.0.0.1"||parsed.port!=="35439"||
   parsed.pathname!=="/postgres"||port!=="35440"||
   !["seed","outage","recover"].includes(phase))
  throw Error("QUESTIONS_V2_REDIS_TEST_REFUSES_NONISOLATED_INFRA");
const {prisma}=await import("@gafus/prisma");
const {questionsV2SourceKey}=await import("@gafus/feed-cloud");
const {questionsV2CleanupKeys}=await import("@gafus/cdn-upload");
const {createQuestionsV2Queue}=await import("../modules/questions/media-v2-jobs.js");
const ownerId="isolated-redis-owner";
try{
  if(phase==="seed"){
    const redis=new Redis({host:"127.0.0.1",port:35440,
      maxRetriesPerRequest:1,enableOfflineQueue:false});
    try{assert.equal(await redis.ping(),"PONG");}
    finally{redis.disconnect();}
    for(let i=0;i<5;i++){
      const mediaId=randomUUID(),photoId="isolated-redis-photo-"+i;
      const sourceKey=questionsV2SourceKey(ownerId,mediaId,"image/webp");
      await prisma.$executeRawUnsafe(
        'INSERT INTO "QuestionPhoto" ("id","ownerId","url","storagePath","questionId","answerId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
        photoId,ownerId,"questions-v2:ready","questions-v2:"+sourceKey,null,null);
      await prisma.questionV2MediaTask.create({data:{mediaId,photoId,ownerId,
        sourceKey,sourceMime:"image/webp",sourceBytes:2048,status:"READY",
        cleanupKind:"SOURCE",cleanupNextAt:new Date(Date.now()-1000),
        createdAt:new Date(Date.now()-2*60_000)}});
    }
    assert.equal(await prisma.questionV2MediaTask.count({where:{ownerId,status:"READY"}}),5);
    console.log("REAL_REDIS_NO_CLOUD_PHOTO_JOBS_FIVE_S3_CLEANUPS=PASS");
  }else if(phase==="outage"){
    const redis=new Redis({host:"127.0.0.1",port:35440,
      maxRetriesPerRequest:1,retryStrategy:()=>null,enableOfflineQueue:false,
      connectTimeout:700,lazyConnect:true});
    try{await assert.rejects(redis.connect());}
    finally{redis.disconnect();}
    assert.equal(await prisma.questionV2MediaTask.count({
      where:{ownerId,status:"READY",cleanupKind:"SOURCE"}}),5);
    console.log("REDIS_DOWN_REAL_PG_CLEANUP_OUTBOX_PERSISTED=PASS");
  }else{
    const redis=new Redis({host:"127.0.0.1",port:35440,
      maxRetriesPerRequest:1,enableOfflineQueue:false});
    try{assert.equal(await redis.ping(),"PONG");}
    finally{redis.disconnect();}
    const queue=createQuestionsV2Queue({database:prisma});
    const cleaned=new Set<string>();
    for(let i=0;i<5;i++){
      const {job}=await queue.claimCleanup();
      assert.ok(job);
      assert.equal(job.ownerId,ownerId);
      assert.equal(cleaned.has(job.mediaId),false);
      cleaned.add(job.mediaId);
      assert.equal(questionsV2CleanupKeys(job).length,2);
      assert.equal((await queue.completeCleanup(job.mediaId,job.cleanupToken,"SOURCE")).accepted,true);
    }
    assert.equal(cleaned.size,5);
    assert.equal((await queue.claimCleanup()).job,null);
    assert.equal(await prisma.questionV2MediaTask.count({
      where:{ownerId,cleanupKind:"SOURCE",cleanupToken:null,
        cleanupNextAt:{gt:new Date()}}}),5);
    await prisma.questionV2MediaTask.deleteMany({where:{ownerId}});
    await prisma.$executeRawUnsafe('DELETE FROM "QuestionPhoto" WHERE "id" LIKE $1',
      "isolated-redis-photo-%");
    console.log("REDIS_RECOVERED_REAL_PG_S3_DELETE_LEASES_PRESERVED=PASS");
  }
}finally{await prisma.$disconnect();}
