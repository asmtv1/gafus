/** WEB3: synthetic-only PostgreSQL 18 on project-local disposable port 55879.
 * Run with AG_WEB3_TIMER_ISOLATED_PG=1 and an explicitly checked DATABASE_URL.
 * Never runs against the production-derived WORK snapshot or production. */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { getTrainingDayWithUserSteps, updateStepAndDay } from "./trainingService.ts";

const run = process.env.AG_WEB3_TIMER_ISOLATED_PG === "1" ? describe : describe.skip;
const prefix = "web3timer_" + randomBytes(5).toString("hex");
let author = "";
let learner = "";
let course = "";
let courseType = "";
let day = "";
let dayOnCourse = "";
let trainingStep = "";
let breakStep = "";
let trainingOccurrence = "";
let breakOccurrence = "";
const binding = () => ({
  expectedCourseId: course,
  expectedStepOnDayId: trainingOccurrence,
  expectedStepId: trainingStep,
});
const findProgress = async () => prisma.userStep.findFirst({
  where: { stepOnDayId: trainingOccurrence, userTraining: { userId: learner } },
});
run("WEB3 project-local isolated PG bound timer complete lifecycle", () => {
  beforeAll(async () => {
    const u = new URL(process.env.DATABASE_URL ?? "");
    if (u.hostname !== "127.0.0.1" || u.port !== "55879" ||
        u.pathname !== "/web3_timer_fixture")
      throw Error("REFUSE_NON_DISPOSABLE_TIMER_DB");
    const metadata = await prisma.$queryRaw<{ db: string; version: string }[]>`
      SELECT current_database() AS db, current_setting('server_version_num') AS version`;
    expect(metadata[0]?.db).toBe("web3_timer_fixture");
    expect(Number(metadata[0]?.version)).toBeGreaterThanOrEqual(180000);
    expect(await prisma.user.count()).toBe(0);
    author = (await prisma.user.create({ data: {
      username: prefix + "_author", password: "!non-login!", registrationPending: false,
      role: "TRAINER",
    } })).id;
    learner = (await prisma.user.create({ data: {
      username: prefix + "_learner", password: "!non-login!", registrationPending: false,
      role: "USER",
    } })).id;
    courseType = "web3_timer_" + randomBytes(4).toString("hex");
    course = (await prisma.course.create({ data: {
      name: "Disposable TIMER test", type: courseType, trainingLevel: "BEGINNER",
      duration: "1", logoImg: "", authorId: author, isPrivate: true,
    } })).id;
    day = (await prisma.trainingDay.create({ data: {
      title: "Disposable timer day", authorId: author,
    } })).id;
    dayOnCourse = (await prisma.dayOnCourse.create({ data: {
      courseId: course, dayId: day, order: 1,
    } })).id;
    trainingStep = (await prisma.step.create({ data: {
      title: "WEB3 Timer", authorId: author, type: "TRAINING", durationSec: 30,
    } })).id;
    breakStep = (await prisma.step.create({ data: {
      title: "WEB3 Break", authorId: author, type: "BREAK", durationSec: 2,
    } })).id;
    trainingOccurrence = (await prisma.stepOnDay.create({ data: {
      stepId: trainingStep, dayId: day, order: 1,
    } })).id;
    breakOccurrence = (await prisma.stepOnDay.create({ data: {
      stepId: breakStep, dayId: day, order: 2,
    } })).id;
    await prisma.courseAccess.create({ data: { courseId: course, userId: learner } });
  });
  afterAll(async () => {
    // Only synthetic records created by this test can be deleted.
    if (dayOnCourse) await prisma.userTraining.deleteMany({where:{dayOnCourseId:dayOnCourse}});
    if (course) await prisma.courseAccess.deleteMany({where:{courseId:course}});
    if (dayOnCourse) await prisma.dayOnCourse.delete({where:{id:dayOnCourse}});
    if (trainingOccurrence) await prisma.stepOnDay.delete({where:{id:trainingOccurrence}});
    if (breakOccurrence) await prisma.stepOnDay.delete({where:{id:breakOccurrence}});
    if (trainingStep) await prisma.step.delete({where:{id:trainingStep}});
    if (breakStep) await prisma.step.delete({where:{id:breakStep}});
    if (day) await prisma.trainingDay.delete({where:{id:day}});
    if (course) await prisma.course.delete({where:{id:course}});
    if (learner) await prisma.user.delete({where:{id:learner}});
    if (author) await prisma.user.delete({where:{id:author}});
    await prisma.$disconnect();
  });
  it("read-only GET never backfills progress before first start", async () => {
    const rows = await prisma.userTraining.count({where:{userId:learner}});
    const detail=await getTrainingDayWithUserSteps(learner,courseType,dayOnCourse,{
      createIfMissing:false,
    });
    expect(detail?.steps).toHaveLength(2);
    expect(await prisma.userTraining.count({where:{userId:learner}})).toBe(rows);
    expect(await prisma.userStep.count()).toBe(0);
  });
  it("Core start/pause/resume/complete/reset updates persisted timestamp only for bound actor+occurrence", async () => {
    await updateStepAndDay(learner,dayOnCourse,0,{type:"start",remainingSec:30},binding());
    const started=await findProgress();
    expect(started).toMatchObject({status:"IN_PROGRESS",paused:false,remainingSec:30});
    expect(started?.updatedAt).toBeInstanceOf(Date);
    const afterStart=started!.updatedAt.getTime();
    await new Promise(r=>setTimeout(r,6));
    await updateStepAndDay(learner,dayOnCourse,0,{type:"pause",remainingSec:23},binding());
    const paused=await findProgress();
    expect(paused).toMatchObject({status:"IN_PROGRESS",paused:true,remainingSec:23});
    expect(paused!.updatedAt.getTime()).toBeGreaterThan(afterStart);
    const remainAtPause = paused!.remainingSec;
    expect(remainAtPause).toBe(23);
    await new Promise(r=>setTimeout(r,6));
    await updateStepAndDay(learner,dayOnCourse,0,{type:"resume"},binding());
    const resumed=await findProgress();
    expect(resumed).toMatchObject({status:"IN_PROGRESS",paused:false,remainingSec:23});
    expect(resumed!.updatedAt.getTime()).toBeGreaterThan(paused!.updatedAt.getTime());
    const expiresAt=resumed!.updatedAt.getTime()+resumed!.remainingSec!*1000;
    expect(expiresAt).toBeGreaterThan(Date.now());
    await updateStepAndDay(learner,dayOnCourse,0,{type:"complete"},binding());
    expect((await findProgress())?.status).toBe("COMPLETED");
    await updateStepAndDay(learner,dayOnCourse,0,{type:"reset"},binding());
    expect((await findProgress())?.status).toBe("RESET");
    expect(await prisma.userStep.count()).toBe(1);
    const readback=await getTrainingDayWithUserSteps(learner,courseType,dayOnCourse,{
      createIfMissing:false,
    });
    expect(readback?.steps.map(s=>s.status)).toEqual(["RESET","NOT_STARTED"]);
  });
  it("legacy Native pause/resume also produces an accurate server clock without changing step semantics", async () => {
    await updateStepAndDay(learner,dayOnCourse,0,{type:"start",remainingSec:26});
    const started=await findProgress();
    expect(started?.status).toBe("IN_PROGRESS");
    await new Promise(r=>setTimeout(r,6));
    await updateStepAndDay(learner,dayOnCourse,0,{type:"pause",remainingSec:13});
    const paused=await findProgress();
    expect(paused).toMatchObject({status:"IN_PROGRESS",paused:true,remainingSec:13});
    expect(paused!.updatedAt.getTime()).toBeGreaterThan(started!.updatedAt.getTime());
    await new Promise(r=>setTimeout(r,6));
    await updateStepAndDay(learner,dayOnCourse,0,{type:"resume"});
    const resumed=await findProgress();
    expect(resumed?.status).toBe("IN_PROGRESS");
    expect(resumed?.paused).toBe(false);
    expect(resumed?.remainingSec).toBe(13);
    expect(resumed!.updatedAt.getTime()).toBeGreaterThan(paused!.updatedAt.getTime());
  });
  it("wrong binding fails with no collateral second-step writes", async () => {
    await expect(updateStepAndDay(learner,dayOnCourse,0,{type:"start",remainingSec:30},{
      expectedCourseId:course,expectedStepOnDayId:breakOccurrence,expectedStepId:trainingStep,
    })).rejects.toThrow("STALE_STEP_BINDING");
    expect(await prisma.userStep.count()).toBe(1);
  });
});
