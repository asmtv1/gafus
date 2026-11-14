/** Fresh private loopback PG; owner-scope and concurrency acceptance for course completion. */
import assert from "node:assert/strict";
import {prisma} from "@gafus/prisma";
import {
 completeUserCourseRecord,completeExistingUserCourseRecord,countCourseDays,
 readCourseDayIds,readOwnTrainingStatuses,
} from "@gafus/course-progress-server/completion";
import {completeUserCourse,checkAndCompleteCourse} from "../../packages/core/src/services/user/userCourseService.js";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_COURSE_PROGRESS_REAL_PG!=="1" ||
   url.protocol!=="postgresql:" || url.hostname!=="127.0.0.1" ||
   url.pathname!=="/gafus_refactor_course_progress")throw Error("REFUSING_NON_DISPOSABLE_COURSE_DB");
async function main(){
 const [owner,outsider]=await Promise.all([
  prisma.user.create({data:{username:"course_progress_owner",password:"synthetic-disposable"}}),
  prisma.user.create({data:{username:"course_progress_other",password:"synthetic-disposable"}}),
 ]);
 const course=await prisma.course.create({data:{name:"Synthetic course",type:"test_course_progress",authorId:owner.id,trainingLevel:"BEGINNER",duration:"7",logoImg:""}});
 const d1=await prisma.trainingDay.create({data:{title:"Day 1",authorId:owner.id}});
 const d2=await prisma.trainingDay.create({data:{title:"Day 2",authorId:owner.id}});
 const [link1,link2]=await Promise.all([
  prisma.dayOnCourse.create({data:{courseId:course.id,dayId:d1.id,order:0}}),
  prisma.dayOnCourse.create({data:{courseId:course.id,dayId:d2.id,order:1}}),
 ]);
 assert.equal(await countCourseDays(course.id),2);
 assert.deepEqual((await readCourseDayIds(course.id)).map(x=>x.id),[link1.id,link2.id]);
 await prisma.userTraining.createMany({data:[
  {userId:owner.id,dayOnCourseId:link1.id,status:"COMPLETED"},
  {userId:owner.id,dayOnCourseId:link2.id,status:"COMPLETED"},
  {userId:outsider.id,dayOnCourseId:link1.id,status:"NOT_STARTED"},
 ]});
 assert.equal((await readOwnTrainingStatuses(owner.id,[link1.id,link2.id])).length,2);
 assert.deepEqual((await readOwnTrainingStatuses(outsider.id,[link1.id,link2.id])).map(x=>x.status),["NOT_STARTED"]);
 assert.equal((await readOwnTrainingStatuses("",[link1.id])).length,0);
 await assert.rejects(completeExistingUserCourseRecord(owner.id,course.id),/COURSE_ENROLLMENT_NOT_FOUND/);
 const start=new Date("2026-11-06T10:00:00Z");
 await prisma.userCourse.create({data:{userId:owner.id,courseId:course.id,status:"IN_PROGRESS",startedAt:start}});
 const evaluations=await Promise.all(Array.from({length:6},()=>completeUserCourseRecord(owner.id,course.id)));
 const first=evaluations[0]?.completedAt?.getTime();
 assert.ok(first);assert.ok(evaluations.every(x=>x.completedAt?.getTime()===first),"concurrent completion must never change first timestamp");
 assert.equal((await prisma.userCourse.findUniqueOrThrow({where:{userId_courseId:{userId:owner.id,courseId:course.id}}})).startedAt?.getTime(),start.getTime());
 assert.equal(await prisma.userCourse.count({where:{userId:owner.id,courseId:course.id}}),1);
 assert.equal((await completeUserCourse(owner.id,course.id)).success,true);
 assert.equal((await checkAndCompleteCourse(owner.id,course.id)).success,true);
 assert.equal((await prisma.userCourse.findUniqueOrThrow({where:{userId_courseId:{userId:owner.id,courseId:course.id}}})).completedAt?.getTime(),first);
 assert.equal((await checkAndCompleteCourse(outsider.id,course.id)).success,false);
 assert.equal(await prisma.userCourse.count({where:{userId:outsider.id}}),0);
 const outsiderAttempt=await completeUserCourseRecord(outsider.id,course.id);
 assert.equal(outsiderAttempt.userId,outsider.id);
 assert.equal(await prisma.userCourse.count({where:{userId:outsider.id}}),1);
 assert.equal(await prisma.userCourse.count({where:{userId:owner.id}}),1);
 await assert.rejects(completeUserCourseRecord("",course.id),/COURSE_COMPLETION_ACTOR_AND_COURSE_REQUIRED/);
 await assert.rejects(completeUserCourseRecord("absent",course.id),/COURSE_COMPLETION_ACTOR_UNAVAILABLE/);
 console.log("COURSE_PROGRESS_REAL_PG_PASS: owner-scoped training statuses, existing-only completion, six competing completions preserve first timestamp/start, Core parity, missing/foreign actor denied");
}
main().then(async()=>prisma.$disconnect()).catch(async(err)=>{console.error(err);await prisma.$disconnect();process.exitCode=1;});
