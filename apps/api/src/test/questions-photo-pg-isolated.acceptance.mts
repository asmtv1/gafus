/**
 * Real PostgreSQL/Prisma V2 queue acceptance. Never run on existing databases.
 * Runner must initialize a fresh Refactor-only database at 127.0.0.1:35439.
 * The wrapper sets GAFUS_QUESTIONS_PG_ISOLATED=1 and DATABASE_URL explicitly.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url=process.env.DATABASE_URL;
if(process.env.GAFUS_QUESTIONS_PG_ISOLATED!=="1" || !url)
  throw Error("QUESTIONS_V2_TEST_REQUIRES_EXPLICIT_ISOLATION");
const parsed=new URL(url);
if(parsed.hostname!=="127.0.0.1" || parsed.port!=="35439" ||
    parsed.pathname!=="/postgres" || parsed.searchParams.get("schema")!=="public")
  throw Error("QUESTIONS_V2_TEST_REFUSES_NONLOCAL_DB");
const {prisma}=await import("@gafus/prisma");
const {createQuestionsV2Queue}=await import("../modules/questions/media-v2-jobs.js");
const {questionsV2SourceKey,questionsV2FinalKeys}=await import("@gafus/feed-cloud");

try {
  const host=await prisma.$queryRawUnsafe<Array<{host:string;port:number}>>(
    "SELECT host(inet_server_addr()) AS host,inet_server_port() AS port");
  assert.equal(host[0]?.host,"127.0.0.1");
  assert.equal(host[0]?.port,35439);
  const ids=[randomUUID(),randomUUID()];
  for(const [index,mediaId] of ids.entries()){
    const photoId="isolated-photo-"+index;
    const ownerId="isolated-owner";
    const sourceMime="image/png";
    const sourceKey=questionsV2SourceKey(ownerId,mediaId,sourceMime);
    await prisma.$executeRawUnsafe(
      'INSERT INTO "QuestionPhoto" ("id","ownerId","url","storagePath","questionId","answerId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
      photoId,ownerId,"","questions-v2:"+sourceKey,null,null);
    await prisma.questionV2MediaTask.create({
      data:{mediaId,photoId,ownerId,sourceMime,sourceBytes:1024,
        sourceKey,status:"QUEUED",nextAttemptAt:new Date(Date.now()-1000)},
    });
  }
  const deletes:string[][]=[];
  const queue=createQuestionsV2Queue({
    database:prisma,
    head:async()=>({bytes:124,mime:"image/webp",etag:"synthetic-etag"}),
    deleteObjects:async keys=>{deletes.push([...keys]);},
  });
  const [a,b]=await Promise.all([queue.claimOne(),queue.claimOne()]);
  assert.equal(a.jobs.length,1);
  assert.equal(b.jobs.length,1);
  const first=a.jobs[0]!,second=b.jobs[0]!;
  assert.notEqual(first.mediaId,second.mediaId);
  assert.notEqual(first.attemptToken,second.attemptToken);
  assert.equal((await queue.claimOne()).jobs.length,0);
  console.log("REAL_PRISMA_DIFFERENT_CLAIMS=PASS");

  assert.equal((await queue.renew(first.mediaId,randomUUID())).accepted,false);
  assert.equal((await queue.renew(first.mediaId,first.attemptToken)).accepted,true);
  console.log("REAL_PRISMA_TOKEN_LEASE_CAS=PASS");

  const keys=questionsV2FinalKeys(first.ownerId,first.mediaId);
  const manifest={kind:"image" as const,variants:{
    small:{key:keys.small,width:360,height:576,bytes:124},
    medium:{key:keys.medium,width:720,height:1152,bytes:124},
  }};
  assert.equal((await queue.complete(first.mediaId,first.attemptToken,manifest)).accepted,true);
  const stored=await prisma.questionV2MediaTask.findUnique({where:{mediaId:first.mediaId}});
  const photo=await prisma.questionPhoto.findUnique({where:{id:first.photoId}});
  assert.equal(stored?.status,"READY");
  assert.equal(photo?.url,"questions-v2:"+keys.medium);
  assert.equal(stored?.cleanupKind,"SOURCE");
  assert.ok(deletes.some(keys=>keys.includes(first.sourceKey)));
  console.log("REAL_PRISMA_VERIFIED_READY_AND_SOURCE_OUTBOX=PASS");

  assert.equal((await queue.fail(first.mediaId,first.attemptToken,"STALE_TOKEN")).accepted,false);
  assert.equal((await queue.fail(second.mediaId,second.attemptToken,"S3_UNAVAILABLE")).accepted,true);
  const deferred=await prisma.questionV2MediaTask.findUnique({where:{mediaId:second.mediaId}});
  assert.equal(deferred?.status,"QUEUED");
  assert.ok(deferred!.nextAttemptAt.getTime()>Date.now());
  console.log("REAL_PRISMA_RETRY_AND_STALE_TOKEN=PASS");

  // Five competing real Prisma claims, across independent database
  // transactions, must grant no more than two unexpired PROCESSING leases.
  const queuedIds=Array.from({length:5},()=>randomUUID());
  for(const [i,mediaId] of queuedIds.entries()){
    const photoId="isolated-cap-photo-"+i;
    const sourceKey=questionsV2SourceKey("isolated-owner",mediaId,"image/png");
    await prisma.$executeRawUnsafe(
      'INSERT INTO "QuestionPhoto" ("id","ownerId","url","storagePath","questionId","answerId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
      photoId,"isolated-owner","","questions-v2:"+sourceKey,null,null);
    await prisma.questionV2MediaTask.create({data:{mediaId,photoId,
      ownerId:"isolated-owner",sourceMime:"image/png",sourceBytes:1024,
      sourceKey,status:"QUEUED",nextAttemptAt:new Date(Date.now()-1000)}});
  }
  const races=await Promise.all(Array.from({length:5},()=>queue.claimOne()));
  const winners=races.flatMap(r=>r.jobs);
  assert.equal(winners.length,2);
  assert.notEqual(winners[0]?.mediaId,winners[1]?.mediaId);
  const occupying=await prisma.questionV2MediaTask.count({
    where:{status:"PROCESSING",leaseUntil:{gt:new Date()}},
  });
  assert.equal(occupying,2);
  assert.equal((await queue.claimOne()).jobs.length,0);
  const free=winners[0]!;
  const freeKeys=questionsV2FinalKeys(free.ownerId,free.mediaId);
  assert.equal((await queue.complete(free.mediaId,free.attemptToken,{kind:"image",
    variants:{small:{key:freeKeys.small,width:360,height:576,bytes:124},
      medium:{key:freeKeys.medium,width:720,height:1152,bytes:124}},
  })).accepted,true);
  const next=await queue.claimOne();
  assert.equal(next.jobs.length,1);
  assert.ok(queuedIds.some(id=>id===next.jobs[0]!.mediaId));
  assert.ok(!winners.some(w=>w.mediaId===next.jobs[0]!.mediaId));
  console.log("REAL_PRISMA_MAX_TWO_ACTIVE_PHOTO_LEASES=PASS");

  // Emulate a hard-delete/account cascade without any FK to the task outbox.
  await prisma.$executeRawUnsafe(
    'DELETE FROM "QuestionPhoto" WHERE "id" = $1',first.photoId);
  await queue.cleanupPending();
  const orphan=await prisma.questionV2MediaTask.findUnique({where:{mediaId:first.mediaId}});
  assert.equal(orphan?.status,"EXPIRED");
  assert.equal(orphan?.cleanupKind,"ALL");
  assert.ok(orphan!.cleanupNextAt.getTime()>Date.now());
  console.log("REAL_PRISMA_HARD_DELETE_RETAINED_DURABLE_CLEANUP=PASS");

  // Fast-forward the injected clock to the signed POST replay deadline.
  // S3 is intentionally a deterministic in-memory delete stub.
  const future=createQuestionsV2Queue({
    database:prisma,
    now:()=>new Date(Date.now()+13*60_000),
    head:async()=>({bytes:124,mime:"image/webp",etag:"synthetic-etag"}),
    deleteObjects:async keys=>{deletes.push([...keys]);},
  });
  await future.cleanupPending();
  const cleaned=await prisma.questionV2MediaTask.findUnique({
    where:{mediaId:first.mediaId},
  });
  assert.equal(cleaned?.cleanupKind,null);
  assert.ok(cleaned?.cleanupCompletedAt);
  assert.ok(deletes.some(batch=>[first.sourceKey,keys.small,keys.medium]
    .every(key=>batch.includes(key))));
  console.log("REAL_PRISMA_ALL_OBJECT_KEYS_RETIRED_AFTER_REPLAY_WINDOW=PASS");
  // This same disposable PG is reused by the subsequent Redis-outage phase.
  // Remove *our own* synthetic tasks so its two lease slots start empty.
  await prisma.questionV2MediaTask.deleteMany({where:{mediaId:{in:[...ids,...queuedIds]}}});
  await prisma.$executeRawUnsafe('DELETE FROM "QuestionPhoto" WHERE "id" LIKE $1',
    'isolated-%');
  assert.equal(await prisma.questionV2MediaTask.count(),0);
  console.log("REAL_PRISMA_TEST_LEASES_RELEASED=PASS");
}finally{
  await prisma.$disconnect();
}
