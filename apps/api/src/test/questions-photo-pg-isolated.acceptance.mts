/** Real disposable PostgreSQL Questions cleanup acceptance. LOCAL ONLY.
 * Runner scripts/refactor/questions-photo-pg-isolated.py owns this PG instance.
 * S3 DELETE is intentionally simulated: it belongs to the existing Worker.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const uri=process.env.DATABASE_URL;
if(process.env.GAFUS_QUESTIONS_PG_ISOLATED!=="1" || !uri)
  throw Error("QUESTIONS_V2_TEST_REQUIRES_EXPLICIT_ISOLATION");
const address=new URL(uri);
if(address.hostname!=="127.0.0.1" || address.port!=="35439" ||
   address.pathname!=="/postgres" || address.searchParams.get("schema")!=="public")
  throw Error("QUESTIONS_V2_TEST_REFUSES_NONLOCAL_DB");
const {prisma}=await import("@gafus/prisma");
const {createQuestionsV2Queue}=await import("../modules/questions/media-v2-jobs.js");
const {questionsV2SourceKey}=await import("@gafus/feed-cloud");
const {questionsV2CleanupKeys}=await import("@gafus/cdn-upload");
const ids=[randomUUID(),randomUUID()],ownerId="isolated-owner";
try{
  const host=await prisma.$queryRawUnsafe<Array<{host:string;port:number}>>(
    "SELECT host(inet_server_addr()) AS host, inet_server_port() AS port");
  assert.equal(host[0]?.host,"127.0.0.1");
  assert.equal(host[0]?.port,35439);
  for(const [i,mediaId] of ids.entries()){
    const photoId="isolated-photo-"+i;
    const sourceKey=questionsV2SourceKey(ownerId,mediaId,"image/webp");
    await prisma.$executeRawUnsafe(
      'INSERT INTO "QuestionPhoto" ("id","ownerId","url","storagePath","questionId","answerId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
      photoId,ownerId,"questions-v2:ready", "questions-v2:"+sourceKey,null,null);
    await prisma.questionV2MediaTask.create({data:{mediaId,photoId,ownerId,
      sourceMime:"image/webp",sourceBytes:1024,sourceKey,
      status:"READY",cleanupKind:"SOURCE",cleanupNextAt:new Date(Date.now()-1000),
      createdAt:new Date(Date.now()-2*60_000)}});
  }
  const queue=createQuestionsV2Queue({database:prisma});
  const first=(await queue.claimCleanup()).job;
  const second=(await queue.claimCleanup()).job;
  assert.ok(first && second);
  assert.notEqual(first.mediaId,second.mediaId);
  assert.notEqual(first.cleanupToken,second.cleanupToken);
  assert.deepEqual(questionsV2CleanupKeys(first),[first.sourceKey,
    first.sourceKey.replace("source.webp","small.webp")]);
  console.log("REAL_PRISMA_TWO_INDEPENDENT_S3_CLEANUP_LEASES=PASS");
  assert.equal((await queue.completeCleanup(first.mediaId,first.cleanupToken,"SOURCE")).accepted,true);
  const source=await prisma.questionV2MediaTask.findUniqueOrThrow({where:{mediaId:first.mediaId}});
  assert.equal(source.status,"READY");
  assert.equal(source.cleanupKind,"SOURCE");
  assert.equal(source.cleanupToken,null);
  assert.equal(source.cleanupCompletedAt,null);
  assert.ok(source.cleanupNextAt.getTime()>Date.now());
  assert.equal((await queue.completeCleanup(first.mediaId,first.cleanupToken,"SOURCE")).accepted,false);
  assert.equal((await queue.failCleanup(second.mediaId,second.cleanupToken,"SOURCE")).accepted,true);
  const retried=await prisma.questionV2MediaTask.findUniqueOrThrow({where:{mediaId:second.mediaId}});
  assert.equal(retried.cleanupKind,"SOURCE");
  assert.equal(retried.cleanupToken,null);
  assert.ok(retried.cleanupNextAt.getTime()>Date.now());
  console.log("REAL_PRISMA_SOURCE_REPLAY_SWEEP_AND_S3_FAILURE_RETRY=PASS");
  // A hard-deleted parent invalidates the READY photo; final objects must be
  // deleted only after the signed POST expiry, never via the old SOURCE token.
  await prisma.$executeRawUnsafe('DELETE FROM "QuestionPhoto" WHERE "id" = $1',
    "isolated-photo-"+ids.findIndex(id=>id===first.mediaId));
  await queue.claimCleanup(); // Runs orphan reconciliation without deleting S3.
  const orphan=await prisma.questionV2MediaTask.findUniqueOrThrow({where:{mediaId:first.mediaId}});
  assert.equal(orphan.status,"EXPIRED");
  assert.equal(orphan.cleanupKind,"ALL");
  assert.equal((await queue.completeCleanup(first.mediaId,first.cleanupToken,"SOURCE")).accepted,false);
  await prisma.questionV2MediaTask.update({where:{mediaId:second.mediaId},
    data:{cleanupNextAt:new Date(Date.now()+24*3600_000)}});
  const future=createQuestionsV2Queue({database:prisma,
    now:()=>new Date(Date.now()+13*60_000)});
  const final=(await future.claimCleanup()).job;
  assert.ok(final);
  assert.equal(final.mediaId,first.mediaId);
  assert.equal(final.cleanupKind,"ALL");
  assert.equal(questionsV2CleanupKeys(final).length,4);
  assert.equal((await future.completeCleanup(final.mediaId,final.cleanupToken,"ALL")).accepted,true);
  const done=await prisma.questionV2MediaTask.findUniqueOrThrow({where:{mediaId:first.mediaId}});
  assert.equal(done.cleanupKind,null);
  assert.ok(done.cleanupCompletedAt);
  console.log("REAL_PRISMA_HARD_DELETE_ALL_S3_OUTBOX_AND_STALE_TOKEN_FENCE=PASS");
}finally{
  await prisma.questionV2MediaTask.deleteMany({where:{mediaId:{in:ids}}});
  await prisma.$executeRawUnsafe('DELETE FROM "QuestionPhoto" WHERE "id" LIKE $1',"isolated-%");
  assert.equal(await prisma.questionV2MediaTask.count(),0);
  await prisma.$disconnect();
  console.log("REAL_PRISMA_TEST_LEASES_RELEASED=PASS");
}
