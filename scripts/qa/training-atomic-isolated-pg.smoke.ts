import { getPremiumOrRewardedAccess, requirePremiumOrRewardedUnlock } from "../../apps/api/src/modules/rewarded-credits/composition/gafus-access.js";
/** Real PostgreSQL atomic learner course mutation; isolated by shell launcher. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { createTrainingService } from "@gafus/course-progress-server/training-service";
import { getCoreTrainingDependencies } from "../../packages/core/src/services/training/trainingService.js";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (process.env.GAFUS_TRAINING_ATOMIC_QA !== "1" || url.hostname !== "127.0.0.1" ||
    url.pathname !== "/gafus_refactor_training_atomic_qa" || url.port === "5432" || !url.port) {
  throw Error("REFUSE_NON_DISPOSABLE_TRAINING_DATABASE");
}
const { checkCourseAccess, checkCourseAccessById } = await import("../../apps/api/src/modules/courses/composition/catalog-read-instance.js");
const { hasActiveGafusCourseStepAccess } = await import("../../packages/core/src/services/contentAccess/index.js");
const { getTrainingDayContent } = await import("../../packages/core/src/services/training/trainingDayContent.js");
const { occurrenceReadPort } = await import("../../apps/api/src/modules/content-access/composition/occurrence-reads-instance.js");
const { dayContentReadPort, contentRevisionReadPort } = await import("../../apps/api/src/modules/training/composition/training-content-rows-instance.js");
const deps = {
  ...getCoreTrainingDependencies({ checkCourseAccess, checkCourseAccessById, getPremiumOrRewardedAccess, requirePremiumOrRewardedUnlock }),
  hasActiveGafusCourseStepAccess: (input: Parameters<typeof hasActiveGafusCourseStepAccess>[0]) => hasActiveGafusCourseStepAccess(input, occurrenceReadPort),
  getTrainingDayContent: (courseType: string, dayOnCourseId: string) => getTrainingDayContent(courseType, dayOnCourseId, { contentRows: dayContentReadPort, revisionRows: contentRevisionReadPort }),
};
const service = createTrainingService(deps);
const another = createTrainingService(deps);
assert.notEqual(service.updateStepAndDay, another.updateStepAndDay, "two instances are independent");

async function main() {
  assert.equal((await prisma.$queryRaw<{db: string}[]>`SELECT current_database() AS db`)[0].db,
    "gafus_refactor_training_atomic_qa");
  const name = "atomic-qa-" + randomUUID().slice(0, 8);
  const author = await prisma.user.create({data: {username: name + "-trainer",password: "synthetic-no-login",role: "TRAINER"}});
  const learner = await prisma.user.create({data: {username: name + "-learner",password: "synthetic-no-login"}});
  const course = await prisma.course.create({data: {
    name, type: name, trainingLevel: "BEGINNER", duration: "1", logoImg: "",
    authorId: author.id, isPrivate: false,
  }});
  const day = await prisma.trainingDay.create({data: {title: name, authorId: author.id}});
  const link = await prisma.dayOnCourse.create({data: {courseId: course.id, dayId: day.id, order: 0}});
  const stepA = await prisma.step.create({data: {title: "A", authorId: author.id,type: "TRAINING",durationSec: 20}});
  const stepB = await prisma.step.create({data: {title: "B", authorId: author.id,type: "TRAINING",durationSec: 20}});
  await prisma.stepOnDay.createMany({data: [
    {stepId:stepA.id,dayId:day.id,order:0}, {stepId:stepB.id,dayId:day.id,order:1},
  ]});
  await prisma.courseAccess.create({data: {courseId: course.id,userId: learner.id}});

  // Write the step and day then force a failure exactly at the UserCourse write.
  await assert.rejects(prisma.$transaction(async (tx) => {
    const fault = new Proxy(tx, {get(target, prop) {
      if (prop === "userCourse") return new Proxy(target.userCourse, {get(delegate, key) {
        if (key === "upsert") return async () => { throw Error("QA_FAIL_AFTER_STEP_DAY_BEFORE_COURSE"); };
        return Reflect.get(delegate,key);
      }});
      return Reflect.get(target,prop);
    }});
    await service.applyStepDayAndCourseTx(fault as never,learner.id,link.id,0,{type:"complete"});
  }), /QA_FAIL_AFTER_STEP_DAY_BEFORE_COURSE/);
  assert.equal(await prisma.userTraining.count({where:{userId:learner.id}}),0,"day rolled back");
  assert.equal(await prisma.userStep.count({where:{userTraining:{userId:learner.id}}}),0,"step rolled back");
  assert.equal(await prisma.userCourse.count({where:{userId:learner.id}}),0,"course rolled back");

  // Independent logical writes from two clients must serialize at course level.
  const concurrent = await Promise.all([
    service.updateStepAndDay(learner.id,link.id,0,{type:"complete"}),
    another.updateStepAndDay(learner.id,link.id,1,{type:"complete"}),
  ]);
  assert.equal(concurrent.filter(x=>x.stepJustCompleted).length,2);
  const result = await prisma.userCourse.findUniqueOrThrow({where:{userId_courseId:{userId:learner.id,courseId:course.id}}});
  const dayStatus = await prisma.userTraining.findUniqueOrThrow({where:{userId_dayOnCourseId:{userId:learner.id,dayOnCourseId:link.id}}});
  const steps = await prisma.userStep.findMany({where:{userTrainingId:dayStatus.id},orderBy:{stepOnDay:{order:"asc"}}});
  assert.deepEqual(steps.map(s=>s.status),["COMPLETED","COMPLETED"]);
  assert.equal(dayStatus.status,"COMPLETED");
  assert.equal(result.status,"COMPLETED");
  assert.ok(result.completedAt);

  // Ambiguous HTTP response after commit: retry is idempotent at step state.
  const again = await service.updateStepAndDay(learner.id,link.id,0,{type:"complete"});
  assert.equal(again.stepJustCompleted,false);
  assert.equal(await prisma.userStep.count({where:{userTrainingId:dayStatus.id}}),2);
  assert.equal((await prisma.userCourse.findUniqueOrThrow({where:{id:result.id}})).status,"COMPLETED");
  // Reset followed by new completion is a distinct user action and remains valid.
  await service.updateStepAndDay(learner.id,link.id,0,{type:"reset"});
  assert.equal((await prisma.userCourse.findUniqueOrThrow({where:{id:result.id}})).status,"IN_PROGRESS");
  await service.updateStepAndDay(learner.id,link.id,0,{type:"complete"});
  assert.equal((await prisma.userCourse.findUniqueOrThrow({where:{id:result.id}})).status,"COMPLETED");
  console.log("TRAINING_ATOMIC_REAL_PG_PASS: course/step/day rollback; two concurrent writes complete course; no duplicate step after lost ACK; reset-recomplete");
}
main().catch(err=>{console.error(err);process.exitCode=1;}).finally(async()=>prisma.$disconnect());
