#!/usr/bin/env node
/**
 * Runs actual pre-refactor generated Prisma Client against the additive OTA schema.
 * All fixture writes are inside a transaction that is deliberately rolled back.
 * Refuses remote/non-QA databases. No worker process or external integrations.
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";

const require=createRequire(import.meta.url);
const clientPath=process.env.GAFUS_OTA_LEGACY_PRISMA_CLIENT_DIR;
const uri=process.env.DATABASE_URL;
if (!clientPath || !uri)throw Error("LEGACY_CLIENT_DIR_AND_DATABASE_URL_REQUIRED");
const dbUrl=new URL(uri);
if(dbUrl.protocol!=="postgresql:" || dbUrl.hostname!=="127.0.0.1" ||
  dbUrl.port!=="55673" ||
  !["/gafus_ota_legacy_20261113","/gafus_ota_snapshot_20261112"].includes(dbUrl.pathname))
  throw Error("LEGACY_SMOKE_ALLOWED_ONLY_LOCAL_ISOLATED_QA_DATABASES");
if(!path.basename(clientPath).startsWith("gafus-ota-legacy-prisma-client-") ||
  !["/tmp",os.tmpdir()].some(folder=>path.resolve(folder)===path.dirname(path.resolve(clientPath))) ||
  clientPath.includes("..") || path.resolve(clientPath)!==clientPath)
  throw Error("LEGACY_CLIENT_MUST_BE_ISOLATED_SNAPSHOT");
const { PrismaClient }=require(path.resolve(clientPath));
const legacy=new PrismaClient({datasources:{db:{url:uri}}});
let verified=false;
const prefix=`legacy-ota-${randomUUID().slice(0,8)}`;
const username=`qa-${prefix}`;
const expectedRollback="EXPECTED_QA_TRANSACTION_ROLLBACK";
try {
  await legacy.$transaction(async tx=>{
    const user=await tx.user.create({data:{username,password:"not-a-real-password-hash"}});
    const course=await tx.course.create({data:{name:`QA ${prefix}`,type:prefix,trainingLevel:"BEGINNER",
      duration:"1 day",logoImg:"https://example.invalid/no-image",authorId:user.id}});
    const training=await tx.training.create({data:{userId:user.id,name:`QA ${prefix}`}});
    const enrollment=await tx.userCourse.create({data:{userId:user.id,courseId:course.id}});
    const conversation=await tx.chat2Conversation.create({data:{kind:"DIRECT",createdById:user.id}});
    const outbox=await tx.chat2OutboxEvent.create({data:{conversationId:conversation.id,eventType:"qa_legacy_event"}});
    const result=await tx.chat2OutboxEvent.update({where:{id:outbox.id},data:{attempts:1,
      claimedUntil:new Date(Date.now()+60_000)}});
    const pending=await tx.chat2OutboxEvent.findMany({where:{conversationId:conversation.id,
      deliveredAt:null,attempts:1},select:{id:true,attempts:true}});
    const courses=await tx.userCourse.findMany({where:{userId:user.id},include:{course:true}});
    if(result.attempts!==1 || pending.length!==1 || courses[0]?.course.id!==course.id ||
       enrollment.courseId!==course.id || training.userId!==user.id)
      throw Error("LEGACY_READ_WRITE_SEMANTICS_BROKEN");
    verified=true;
    throw Error(expectedRollback);
  },{timeout:20000});
  throw Error("TRANSACTION_WAS_NOT_ROLLED_BACK");
}catch(error){
  if(!(error instanceof Error) || error.message!==expectedRollback || !verified)throw error;
  const remaining=await legacy.user.count({where:{username}});
  if(remaining!==0)throw Error("QA_FIXTURE_PERSISTED_AFTER_ROLLBACK");
  console.log(JSON.stringify({status:"OLD_PRISMA_RUNTIME_CRUD_PASS",database:dbUrl.pathname.slice(1),
    legacyModels:Object.keys(legacy._runtimeDataModel.models).length,
    operations:["User.create","Course.create","Training.create","UserCourse.create",
      "Chat2Conversation.create","Chat2OutboxEvent.create","OutboxEvent.update+find","UserCourse.include"],
    writesPersisted:false}));
} finally {await legacy.$disconnect();}
