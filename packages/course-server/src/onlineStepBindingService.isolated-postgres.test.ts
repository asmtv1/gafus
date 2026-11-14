/** Genuine SQL end-to-end only on owned disposable PostgreSQL, never shared DB. */
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import type { TrainingDetail } from "@gafus/types";
import { withOnlineStepBinding } from "./onlineStepBindingService.js";

const enabled = process.env.GAFUS_STEP_BINDING_ISOLATED_TEST === "1";
if (enabled) {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" ||
      url.pathname !== "/gafus_refactor_step_binding" ||
      process.env.GAFUS_LOCAL_ISOLATED_API !== "1")
    throw Error("DENIED: step binding test requires disposable loopback PostgreSQL");
}
const suite = enabled ? describe : describe.skip;
suite("physical StepOnDay occurrence and owner-progress readback: real PostgreSQL", () => {
  let owner = "", stranger = "", dayId = "", stepId = "", occurrenceId = "";
  let courseId = "", dayLinkId = "", userTrainingId = "";
  const detail = (step = stepId, status = "IN_PROGRESS", remaining = 30) => ({
    trainingDayId: dayId,
    steps: [{ id: step, order: 1, status, locked: false,
      isPausedOnServer: false, remainingSecOnServer: remaining }],
  }) as unknown as TrainingDetail;
  beforeAll(async () => {
    owner = (await prisma.user.create({
      data: {username: "qa_step_binding_owner_"+randomUUID(),
        password:randomUUID(),role:"USER"},
    })).id;
    stranger = (await prisma.user.create({
      data: {username:"qa_step_binding_other_"+randomUUID(),
        password:randomUUID(),role:"USER"},
    })).id;
    courseId = (await prisma.course.create({
      data:{name:"qa course",type:"qa_step_binding_"+randomUUID().slice(0,32),
        trainingLevel:"BEGINNER",duration:"1 day",logoImg:"",authorId:owner},
    })).id;
    dayId = (await prisma.trainingDay.create({
      data: {title:"qa day",authorId:owner},
    })).id;
    stepId = (await prisma.step.create({
      data: {title:"qa exercise",authorId:owner},
    })).id;
    occurrenceId = (await prisma.stepOnDay.create({
      data: {dayId,stepId,order:1},
    })).id;
    dayLinkId = (await prisma.dayOnCourse.create({
      data: {dayId,courseId,order:1},
    })).id;
    userTrainingId = (await prisma.userTraining.create({
      data: {userId:owner,dayOnCourseId:dayLinkId,status:"IN_PROGRESS"},
    })).id;
  });
  beforeEach(async () => {
    await prisma.userStep.deleteMany({where:{userTrainingId}});
  });
  afterAll(async () => {
    if (userTrainingId) await prisma.userStep.deleteMany({where:{userTrainingId}});
    if (userTrainingId) await prisma.userTraining.deleteMany({where:{id:userTrainingId}});
    if (dayLinkId) await prisma.dayOnCourse.deleteMany({where:{id:dayLinkId}});
    if (dayId) await prisma.stepOnDay.deleteMany({where:{dayId}});
    if (dayId) await prisma.trainingDay.deleteMany({where:{id:dayId}});
    if (stepId) await prisma.step.deleteMany({where:{id:stepId}});
    if (courseId) await prisma.course.deleteMany({where:{id:courseId}});
    if (owner) await prisma.user.deleteMany({where:{id:{in:[owner,stranger]}}});
    await prisma.$disconnect();
  });
  it("binds only physical occurrence; without a progress row it does not create one",async()=>{
    const original = detail();
    const bound = await withOnlineStepBinding(owner,dayLinkId,original);
    expect(bound).toHaveProperty("onlineStepBinding","STEP_ON_DAY_ID_V1");
    expect(bound.steps[0]).toMatchObject({stepOnDayId:occurrenceId,
      timerSnapshot:{remainingSecAtServerNow:null,expiresAt:null}});
    expect(await prisma.userStep.count({where:{userTrainingId}})).toBe(0);
    expect(original.steps[0]).not.toHaveProperty("stepOnDayId");
  });
  it("reads exact userTraining and step occurrence and emits bounded countdown",async()=>{
    const updatedAt = new Date(Date.now()+10_000);
    await prisma.userStep.create({
      data: {userTrainingId,stepOnDayId:occurrenceId,status:"IN_PROGRESS",
        paused:false,remainingSec:30,updatedAt},
    });
    const bound = await withOnlineStepBinding(owner,dayLinkId,detail());
    expect(bound).toHaveProperty("onlineStepBinding","STEP_ON_DAY_ID_V1");
    expect(bound.steps[0]).toMatchObject({stepOnDayId:occurrenceId,
      timerSnapshot:{remainingSecAtServerNow:expect.any(Number),
        expiresAt:expect.any(String)}});
    expect(JSON.stringify(bound)).not.toContain(userTrainingId);
    expect(JSON.stringify(bound)).not.toContain(owner);
    expect(JSON.stringify(bound)).not.toContain("password");
  });
  it("does not project another user's training progress",async()=>{
    await prisma.userStep.create({
      data: {userTrainingId,stepOnDayId:occurrenceId,status:"IN_PROGRESS",
        paused:false,remainingSec:30},
    });
    const strangerRead=await withOnlineStepBinding(stranger,dayLinkId,detail());
    expect(strangerRead.steps[0]).toMatchObject({
      timerSnapshot:{remainingSecAtServerNow:null,expiresAt:null},
    });
    expect(JSON.stringify(strangerRead)).not.toContain(userTrainingId);
  });
  it("refuses mismatched logical step before trying to read progress",async()=>{
    const original=detail("forged-other-step");
    expect(await withOnlineStepBinding(owner,dayLinkId,original)).toBe(original);
  });
  it("refuses stale state when DB changed to completed after application projection",async()=>{
    await prisma.userStep.create({
      data: {userTrainingId,stepOnDayId:occurrenceId,status:"COMPLETED",
        paused:false,remainingSec:30},
    });
    const original=detail();
    expect(await withOnlineStepBinding(owner,dayLinkId,original)).toBe(original);
  });
});
