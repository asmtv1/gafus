/** Three-phase real Redis outage + real PostgreSQL recovery, local ONLY.
 * Runner: scripts/refactor/questions-photo-pg-isolated.py
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";

const phase=process.argv[2];
const parsed=new URL(process.env.DATABASE_URL??"invalid:");
const redisPort=process.env.GAFUS_QUESTIONS_REDIS_PORT;
if(process.env.GAFUS_QUESTIONS_PG_ISOLATED!=="1" ||
   process.env.GAFUS_QUESTIONS_REDIS_ISOLATED!=="1" ||
   parsed.hostname!=="127.0.0.1" || parsed.port!=="35439" ||
   parsed.pathname!=="/postgres" || redisPort!=="35440" ||
   !["seed","outage","recover"].includes(phase))
  throw Error("QUESTIONS_V2_REDIS_TEST_REFUSES_NONISOLATED_INFRA");
const { prisma }=await import("@gafus/prisma");
const { questionsV2SourceKey, questionsV2FinalKeys }=await import("@gafus/feed-cloud");
const { createQuestionsV2Queue }=await import("../modules/questions/media-v2-jobs.js");
const queueName="questions-photo-v2-local-outage";
const ownerId="isolated-redis-owner";
const connection=()=>new Redis({host:"127.0.0.1",port:35440,
  maxRetriesPerRequest:1,retryStrategy:()=>null,enableOfflineQueue:false,
  connectTimeout:800,lazyConnect:true});
try {
  if(phase==="seed") {
    const queueClient=connection();
    const store=new Queue(queueName,{connection:queueClient});
    try {
      await store.waitUntilReady();
      const ids=Array.from({length:5},()=>randomUUID());
      for(const [i,mediaId] of ids.entries()){
        const photoId="isolated-redis-photo-"+i;
        const sourceKey=questionsV2SourceKey(ownerId,mediaId,"image/png");
        await prisma.$executeRawUnsafe(
          'INSERT INTO "QuestionPhoto" ("id","ownerId","url","storagePath","questionId","answerId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
          photoId,ownerId,"","questions-v2:"+sourceKey,null,null);
        await prisma.questionV2MediaTask.create({data:{mediaId,photoId,ownerId,
          sourceKey,sourceMime:"image/png",sourceBytes:2048,status:"QUEUED",
          nextAttemptAt:new Date(Date.now()-1000)}});
      }
      await Promise.all(Array.from({length:5},()=>store.add("wake",{mediaId:ids[0]},
        {jobId:"questions-"+ids[0]})));
      await Promise.all(ids.slice(1).map(mediaId=>store.add("wake",{mediaId},
        {jobId:"questions-"+mediaId})));
      assert.equal(await store.getWaitingCount(),5);
      assert.equal(await prisma.questionV2MediaTask.count({where:{ownerId,status:"QUEUED"}}),5);
      console.log("REAL_REDIS_FIVE_JOBS_DEDUPLICATED=PASS");
    }finally{await store.close();queueClient.disconnect();}
  }else if(phase==="outage"){
    const client=connection();
    try{await assert.rejects(client.connect());}
    finally{client.disconnect();}
    assert.equal(await prisma.questionV2MediaTask.count({where:{ownerId,status:"QUEUED"}}),5);
    console.log("REDIS_DOWN_REAL_PG_DURABLE_QUEUED=PASS");
  }else{
    const queueClient=connection();
    const store=new Queue(queueName,{connection:queueClient});
    const claimed=new Set<string>();
    const durable=createQuestionsV2Queue({database:prisma,
      head:async()=>({bytes:124,mime:"image/webp",etag:"isolated-mock"}),
      deleteObjects:async()=>{}});
    let resolveDone:(v:void)=>void=()=>{};
    let rejectDone:(e:Error)=>void=()=>{};
    const completed=new Promise<void>((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
    const workerClient=new Redis({host:"127.0.0.1",port:35440,maxRetriesPerRequest:null});
    const consumer=new Worker(queueName,async()=>{
      const {jobs}=await durable.claimOne();
      assert.ok(jobs.length<=1);
      // A valid wake-up may find both PG leases occupied. It can end idle;
      // the durable PG recovery sweep must re-emit that still-QUEUED media.
      if(!jobs.length)return;
      const job=jobs[0]!;
      assert.equal(job.ownerId,ownerId);
      assert.equal(claimed.has(job.mediaId),false);
      claimed.add(job.mediaId);
      const k=questionsV2FinalKeys(job.ownerId,job.mediaId);
      const accepted=await durable.complete(job.mediaId,job.attemptToken,{kind:"image",
        variants:{small:{key:k.small,width:360,height:576,bytes:124},
          medium:{key:k.medium,width:720,height:1152,bytes:124}}});
      assert.equal(accepted.accepted,true);
      if(claimed.size===5)resolveDone();
    },{connection:workerClient,concurrency:2});
    consumer.on("failed",(_job,e)=>rejectDone(e));
    try{
      await consumer.waitUntilReady();await store.waitUntilReady();
      // Redis was restarted with no AOF. All five notifications disappeared;
      // the real PostgreSQL table is the only recovery source.
      assert.equal(await store.getWaitingCount(),0);
      const due=await prisma.questionV2MediaTask.findMany({
        where:{ownerId,status:"QUEUED",nextAttemptAt:{lte:new Date()}},
        select:{mediaId:true},orderBy:{createdAt:"asc"}});
      assert.equal(due.length,5);
      await Promise.all(due.map(({mediaId})=>store.add("wake",{mediaId},
        {jobId:"questions-"+mediaId,removeOnComplete:true})));
      let watchdog:ReturnType<typeof setTimeout>|undefined;
      let wave=0;
      let scanning=false;
      const recover=async()=>{
        if(scanning || claimed.size===5)return;
        scanning=true;
        try{
          const leftovers=await prisma.questionV2MediaTask.findMany({
            where:{ownerId,status:"QUEUED",nextAttemptAt:{lte:new Date()}},
            select:{mediaId:true},take:2,
          });
          const prefix="questions-recovery-"+(++wave)+"-";
          await Promise.all(leftovers.map(({mediaId})=>store.add("wake",{mediaId},
            {jobId:prefix+mediaId,removeOnComplete:true})));
        }finally{scanning=false;}
      };
      const ticker=setInterval(()=>{
        void recover().catch(rejectDone);
      },100);
      try{
        await Promise.race([completed,new Promise<never>((_,reject)=>{
          watchdog=setTimeout(()=>reject(Error("LOCAL_REDIS_RECOVERY_TIMEOUT")),12_000);
        })]);
      }finally{clearInterval(ticker);if(watchdog)clearTimeout(watchdog);}
      assert.equal(claimed.size,5);
      assert.equal(await prisma.questionV2MediaTask.count({where:{ownerId,status:"READY"}}),5);
      console.log("REAL_REDIS_RESTART_PG_RECOVERY_FIVE_READY=PASS");
    }finally{await consumer.close(true);await store.close();workerClient.disconnect();queueClient.disconnect();}
  }
}finally{await prisma.$disconnect();}
