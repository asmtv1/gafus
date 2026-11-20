/** Isolated PG18 training transaction regression. Never run against shared/production DB.
 * Launcher: scripts/qa/training-atomic-isolated-pg.sh. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { createTrainingService, type TrainingServicePorts } from "./trainingService";

const safe = (() => {
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    return process.env.GAFUS_TRAINING_ATOMIC_PG === "1" &&
      u.protocol === "postgresql:" && u.hostname === "127.0.0.1" &&
      /^training_atomic_[a-z0-9]{12}$/.test(u.pathname.slice(1)) &&
      u.username === "qatran" && Number(u.port) >= 10000 &&
      process.env.GAFUS_TRAINING_ATOMIC_DB_NAME === u.pathname.slice(1);
  } catch { return false; }
})();
const suite = safe ? describe : describe.skip;
const calculateStatus = (statuses: Array<string | TrainingStatus>): TrainingStatus => {
  if (statuses.every(x => x === TrainingStatus.COMPLETED)) return TrainingStatus.COMPLETED;
  if (statuses.some(x => x !== TrainingStatus.NOT_STARTED)) return TrainingStatus.IN_PROGRESS;
  return TrainingStatus.NOT_STARTED;
};
const deps = {
  checkCourseAccess: async () => ({hasAccess:true}),
  checkCourseAccessById: async () => ({hasAccess:true}),
  hasActiveGafusCourseStepAccess: async () => false,
  getPremiumOrRewardedAccess: async () => {throw Error("unexpected access call");},
  requirePremiumOrRewardedUnlock: async () => {throw Error("unexpected access call");},
  SubscriptionOrCreditsRequiredError: Error,
  calculateCourseStatusFromDayStatuses: calculateStatus,
  replacePersonalizationPlaceholders: (s: string) => s,
  getTrainingDayContent: async () => {throw Error("unexpected content call");},
} as unknown as TrainingServicePorts;
const service = createTrainingService(deps);
let owner = "", courseId = "", dayId = "";
let first = {id:"",stepId:""}, second = {id:"",stepId:""};
const binding = (s: typeof first) => ({expectedStepOnDayId:s.id,expectedStepId:s.stepId,expectedCourseId:courseId});
const states = () => Promise.all([
  prisma.userTraining.findUnique({where:{userId_dayOnCourseId:{userId:owner,dayOnCourseId:dayId}},include:{steps:true}}),
  prisma.userCourse.findUnique({where:{userId_courseId:{userId:owner,courseId}}}),
  prisma.stepNotification.count({where:{userId:owner}}),
]);
suite("training step+day+course on disposable PostgreSQL", () => {
  beforeAll(async () => {
    const [db] = await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`;
    expect(db?.db).toBe(process.env.GAFUS_TRAINING_ATOMIC_DB_NAME);
    const actor = await prisma.user.create({data:{username:"training-atomic-qa",password:"no-login"}});
    owner=actor.id;
    const course = await prisma.course.create({data:{name:"Training atomic QA",type:"atomic-qa",duration:"1 day",logoImg:"placeholder",trainingLevel:"BEGINNER",authorId:owner}});
    courseId=course.id;
    const day = await prisma.trainingDay.create({data:{title:"Atomic day",authorId:owner}});
    const link = await prisma.dayOnCourse.create({data:{courseId,dayId:day.id,order:0}});
    dayId=link.id;
    for (let i=0;i<2;i++) {
      const step = await prisma.step.create({data:{title:`Atomic step ${i}`,authorId:owner,type:"PRACTICE"}});
      const occurrence = await prisma.stepOnDay.create({data:{dayId:day.id,stepId:step.id,order:i}});
      if (i === 0) first = {id:occurrence.id, stepId:step.id};
      else second = {id:occurrence.id, stepId:step.id};
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });
  it("rolls back UserStep and UserTraining when UserCourse reconciliation fails",async () => {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION public.qa_atomic_reject_course() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_COURSE_WRITE_ABORT'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER qa_atomic_reject_course BEFORE INSERT OR UPDATE ON "UserCourse" FOR EACH ROW EXECUTE FUNCTION public.qa_atomic_reject_course()`);
    try {
      await expect(service.updateStepAndDay(owner,dayId,0,{type:"complete"},binding(first))).rejects.toThrow("QA_COURSE_WRITE_ABORT");
      const [day,course] = await states();
      expect(day).toBeNull();
      expect(course).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER qa_atomic_reject_course ON "UserCourse"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION public.qa_atomic_reject_course()`);
    }
  });
  it("serializes two clients completing the same bound step; an ignored response does not duplicate the completion",async () => {
    const [a,b] = await Promise.all([
      service.updateStepAndDay(owner,dayId,0,{type:"complete"},binding(first)),
      service.updateStepAndDay(owner,dayId,0,{type:"complete"},binding(first)),
    ]);
    expect([a.stepJustCompleted,b.stepJustCompleted].sort()).toEqual([false,true]);
    const [day,course,notifications] = await states();
    expect(day?.steps).toHaveLength(1);
    expect(day?.steps[0]?.status).toBe(TrainingStatus.COMPLETED);
    expect(day?.status).toBe(TrainingStatus.IN_PROGRESS);
    expect(course?.status).toBe(TrainingStatus.IN_PROGRESS);
    expect(course?.completedAt).toBeNull();
    expect(notifications).toBe(0);
    const retry = await service.updateStepAndDay(owner,dayId,0,{type:"complete"},binding(first));
    expect(retry.stepJustCompleted).toBe(false);
    expect((await states())[0]?.steps).toHaveLength(1);
  });
  it("commits the course completion exactly once across two concurrent step completions",async () => {
    const result = await Promise.all([
      service.updateStepAndDay(owner,dayId,1,{type:"start",remainingSec:30},binding(second)),
      service.updateStepAndDay(owner,dayId,0,{type:"complete"},binding(first)),
    ]);
    expect(result).toHaveLength(2);
    const complete = await service.updateStepAndDay(owner,dayId,1,{type:"complete"},binding(second));
    expect(complete.allCompleted).toBe(true);
    const [day,course,notifications] = await states();
    expect(day?.steps).toHaveLength(2);
    expect(day?.status).toBe(TrainingStatus.COMPLETED);
    expect(course?.status).toBe(TrainingStatus.COMPLETED);
    expect(course?.completedAt).toBeInstanceOf(Date);
    expect(notifications).toBe(0);
    const at=course?.completedAt?.getTime();
    await service.updateStepAndDay(owner,dayId,1,{type:"complete"},binding(second));
    expect((await states())[1]?.completedAt?.getTime()).toBe(at);
  });
});
