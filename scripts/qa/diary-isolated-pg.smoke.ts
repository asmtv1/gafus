/** Exercise the actual Core ACL + extracted diary persistence against disposable PostgreSQL. */
import assert from "node:assert/strict";
import { prisma } from "@gafus/prisma";
import { getDiaryEntries, saveDiaryEntry } from "../../apps/api/src/modules/training/composition/diary-rows.js";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1"||process.env.GAFUS_DIARY_REAL_PG!=="1"||
 url.protocol!=="postgresql:"||url.hostname!=="127.0.0.1"||
 url.pathname!=="/gafus_refactor_diary_phase_h")
 throw Error("REFUSING_NON_DISPOSABLE_DIARY_PG");
async function main(){
 const zone=await prisma.$queryRaw<{zone:string}[]>`SELECT current_setting('TimeZone') AS zone`;
 assert.equal(zone[0]?.zone,"Pacific/Auckland");
 const owner=await prisma.user.create({data:{username:"diary_author_h",password:"fictional"}});
 const learner=await prisma.user.create({data:{username:"diary_learner_h",password:"fictional"}});
 const foreign=await prisma.user.create({data:{username:"diary_foreign_h",password:"fictional"}});
 const base={trainingLevel:"BEGINNER" as const,duration:"5",logoImg:"",authorId:owner.id};
 const pub=await prisma.course.create({data:{...base,name:"Public diary",type:"diary_public_h",isPrivate:false}});
 const priv=await prisma.course.create({data:{...base,name:"Private diary",type:"diary_private_h",isPrivate:true}});
 const d1=await prisma.trainingDay.create({data:{title:"First day",authorId:owner.id}});
 const d2=await prisma.trainingDay.create({data:{title:"Second day",authorId:owner.id}});
 const secretDay=await prisma.trainingDay.create({data:{title:"Private day",authorId:owner.id}});
 // Shared TrainingDay in separate courses must NOT bypass course ownership.
 const [first,second,privateShared,privateSecret]=await Promise.all([
  prisma.dayOnCourse.create({data:{courseId:pub.id,dayId:d1.id,order:0}}),
  prisma.dayOnCourse.create({data:{courseId:pub.id,dayId:d2.id,order:1}}),
  prisma.dayOnCourse.create({data:{courseId:priv.id,dayId:d1.id,order:0}}),
  prisma.dayOnCourse.create({data:{courseId:priv.id,dayId:secretDay.id,order:1}}),
 ]);
 assert.deepEqual(await saveDiaryEntry(learner.id,first.id,"  "),{success:false,error:"Текст записи не может быть пустым"});
 assert.equal((await saveDiaryEntry(learner.id,first.id,"x".repeat(10001))).success,false);
 assert.deepEqual(await saveDiaryEntry(learner.id,"unknown-occurrence","valid"),{success:false,error:"День курса не найден"});
 assert.deepEqual(await saveDiaryEntry(learner.id,privateSecret.id,"forbidden"),{success:false,error:"Нет доступа к курсу"});
 assert.equal(await prisma.diaryEntry.count({where:{userId:learner.id}}),0);
 assert.equal((await saveDiaryEntry(learner.id,second.id,"  second  ")).success,true);
 assert.equal((await saveDiaryEntry(learner.id,first.id,"  first  ")).success,true);
 assert.equal((await saveDiaryEntry(foreign.id,first.id,"foreign-private-text")).success,true);
 const got=await getDiaryEntries(learner.id,pub.id);
 assert.equal(got.error,undefined);
 assert.deepEqual(got.entries.map(e=>[e.dayOnCourseId,e.dayTitle,e.content]),[
  [first.id,"First day","first"],[second.id,"Second day","second"],
 ]);
 assert.deepEqual((await getDiaryEntries(learner.id,pub.type)).entries,got.entries);
 assert.deepEqual((await getDiaryEntries(learner.id,pub.id,first.id)).entries.map(e=>e.content),["first"]);
 assert.equal((await getDiaryEntries(learner.id,priv.id)).error,"Нет доступа к курсу");
 assert.equal((await getDiaryEntries(learner.id,priv.id)).entries.length,0);
 assert.equal(got.entries.some(e=>e.content.includes("foreign")),false,"different users' entries never project");
 const grant=await prisma.courseAccess.create({data:{courseId:priv.id,userId:learner.id}});
 assert.equal((await saveDiaryEntry(learner.id,privateSecret.id,"private progress")).success,true);
 const privateView=await getDiaryEntries(learner.id,priv.id);
 assert.deepEqual(privateView.entries.map(e=>e.dayOnCourseId),[privateShared.id,privateSecret.id]);
 assert.deepEqual(privateView.entries.map(e=>e.content),["first","private progress"]);
 await prisma.courseAccess.delete({where:{courseId_userId:{courseId:grant.courseId,userId:grant.userId}}});
 assert.equal((await getDiaryEntries(learner.id,priv.id)).error,"Нет доступа к курсу","revoked private course cannot disclose persisted content");
 assert.equal((await saveDiaryEntry(learner.id,privateSecret.id,"overwriting revoked content")).success,false);
 const concurrent=await Promise.all([saveDiaryEntry(learner.id,first.id,"new one"),saveDiaryEntry(learner.id,first.id,"new two")]);
 assert.equal(concurrent.every(r=>r.success),true);
 assert.equal(await prisma.diaryEntry.count({where:{userId:learner.id,dayId:d1.id}}),1,"unique owner/day diary upsert retains one row");
 assert.equal((await getDiaryEntries(learner.id,"course_not_found")).error,"Курс не найден");
 console.log("DIARY_PHASE_H_REAL_PG_PASS: owner-only read/write, private assignment/revocation, shared days, legacy course type lookup, ordered occurrence projection, capped day, concurrent unique upsert, nonUTC DB");
}
main().then(async()=>prisma.$disconnect()).catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
