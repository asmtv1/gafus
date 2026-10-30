/** Opt-in only: permanent nonprod WORK PG18, own synthetic trainer/course/actors. */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  getTrainingDayWithMonetizedSteps,
  getTrainingDayWithUserSteps,
  requireCourseStepOperationAccess,
  updateStepAndDay,
} from "./trainingService.ts";

const run = process.env.AG1_LEARN032_WORK_PG === "1" ? describe : describe.skip;
const prefix = "ag1learn032_20261025_" + randomBytes(4).toString("hex");
let author = "";
let learner = "";
let native = "";
let foreign = "";
let courseId = "";
let courseType = "";
let dayId = "";
let linkId = "";
let stepA = "";
let stepB = "";
let occurrenceA = "";
let occurrenceB = "";

async function syntheticUser(suffix: string) {
  return prisma.user.create({
    data: {
      username: prefix + suffix,
      password: "!non-login-synthetic!",
      registrationPending: false,
      role: suffix === "author" ? "TRAINER" : "USER",
    },
  });
}

async function cleanup() {
  // Only values created in this beforeAll, never original snapshot rows.
  if (courseId) {
    await prisma.userTraining.deleteMany({ where: { dayOnCourseId: linkId } });
    await prisma.courseAccess.deleteMany({ where: { courseId } });
    await prisma.dayOnCourse.deleteMany({ where: { courseId } });
    if (dayId) await prisma.stepOnDay.deleteMany({ where: { dayId } });
    if (stepA) await prisma.step.deleteMany({ where: { id: stepA, authorId: author } });
    if (stepB) await prisma.step.deleteMany({ where: { id: stepB, authorId: author } });
    if (dayId) await prisma.trainingDay.deleteMany({ where: { id: dayId, authorId: author } });
    await prisma.course.deleteMany({ where: { id: courseId, authorId: author } });
  }
  for (const id of [learner, native, foreign, author]) {
    if (!id) continue;
    const owner = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    if (owner && owner.username.startsWith(prefix)) await prisma.user.delete({ where: { id } });
  }
}
run("LEARN032 actual StepOnDay transaction binding in permanent WORK PostgreSQL", () => {
  beforeAll(async () => {
    const u = new URL(process.env.DATABASE_URL ?? "");
    if (
      !["127.0.0.1", "localhost"].includes(u.hostname) ||
      u.port !== "55921" ||
      u.pathname !== "/gafus_refactor_real_work_20261024"
    ) {
      throw new Error("REFUSE_NON_WORK_PG");
    }
    const database = await prisma.$queryRaw<{ db: string; version: string }[]>`
      SELECT current_database() AS db, current_setting('server_version_num') AS version`;
    expect(database).toEqual([{ db: "gafus_refactor_real_work_20261024", version: "180004" }]);
    author = (await syntheticUser("author")).id;
    learner = (await syntheticUser("learner")).id;
    native = (await syntheticUser("native")).id;
    foreign = (await syntheticUser("foreign")).id;
    courseType = "ag1_l032_" + randomBytes(4).toString("hex");
    const course = await prisma.course.create({
      data: {
        name: "AG1 fixture",
        type: courseType,
        trainingLevel: "BEGINNER",
        duration: "1",
        logoImg: "",
        authorId: author,
        isPrivate: true,
      },
    });
    courseId = course.id;
    dayId = (
      await prisma.trainingDay.create({
        data: {
          title: "AG1 bounded day",
          authorId: author,
        },
      })
    ).id;
    linkId = (
      await prisma.dayOnCourse.create({
        data: {
          courseId,
          dayId,
          order: 1,
        },
      })
    ).id;
    stepA = (
      await prisma.step.create({
        data: {
          title: "AG1 A",
          authorId: author,
          type: "TRAINING",
          durationSec: 60,
        },
      })
    ).id;
    stepB = (
      await prisma.step.create({
        data: {
          title: "AG1 B",
          authorId: author,
          type: "TRAINING",
          durationSec: 60,
        },
      })
    ).id;
    occurrenceA = (await prisma.stepOnDay.create({ data: { dayId, stepId: stepA, order: 10 } })).id;
    occurrenceB = (await prisma.stepOnDay.create({ data: { dayId, stepId: stepB, order: 30 } })).id;
    for (const id of [learner, native])
      await prisma.courseAccess.create({ data: { courseId, userId: id } });
  });
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
  it("actual READ B at displayed index 1 and actor-specific private denial", async () => {
    const detail = await getTrainingDayWithMonetizedSteps(learner, courseType, linkId, {
      createIfMissing: false,
      platform: "ANDROID",
    });
    expect(detail?.steps.map((s) => [s.id, s.order])).toEqual([
      [stepA, 10],
      [stepB, 30],
    ]);
    await expect(
      requireCourseStepOperationAccess({
        userId: foreign,
        platform: "ANDROID",
        expectedCourseId: courseId,
        dayOnCourseId: linkId,
        stepIndex: 1,
        expectedStepOnDayId: occurrenceB,
        expectedStepId: stepB,
      }),
    ).rejects.toThrow("COURSE_ACCESS_DENIED");
    expect(await prisma.userTraining.count({ where: { userId: learner } })).toBe(0);
  });
  it("after trainer reorder index1 now A, opt-in B still writes only B by locked occurrence", async () => {
    await prisma.stepOnDay.update({ where: { id: occurrenceA }, data: { order: 40 } });
    await prisma.stepOnDay.update({ where: { id: occurrenceB }, data: { order: 10 } });
    await requireCourseStepOperationAccess({
      userId: learner,
      platform: "ANDROID",
      expectedCourseId: courseId,
      dayOnCourseId: linkId,
      stepIndex: 1,
      expectedStepOnDayId: occurrenceB,
      expectedStepId: stepB,
    });
    await updateStepAndDay(
      learner,
      linkId,
      1,
      { type: "start", remainingSec: 40 },
      {
        expectedCourseId: courseId,
        expectedStepOnDayId: occurrenceB,
        expectedStepId: stepB,
      },
    );
    const steps = await prisma.userStep.findMany({
      where: {
        userTraining: { userId: learner, dayOnCourseId: linkId },
      },
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].stepOnDayId).toBe(occurrenceB);
    expect(steps[0].status).toBe("IN_PROGRESS");
    expect(steps[0].remainingSec).toBe(40);
    const actual = await getTrainingDayWithUserSteps(learner, courseType, linkId, {
      createIfMissing: false,
    });
    expect(actual?.steps.map((s) => [s.id, s.status])).toEqual([
      [stepB, "IN_PROGRESS"],
      [stepA, "NOT_STARTED"],
    ]);
  });
  it("stale expected Step.id / wrong course denies before UserStep write", async () => {
    const before = await prisma.userStep.count({ where: { userTraining: { userId: learner } } });
    await expect(
      updateStepAndDay(
        learner,
        linkId,
        1,
        { type: "complete" },
        {
          expectedCourseId: courseId,
          expectedStepOnDayId: occurrenceB,
          expectedStepId: stepA,
        },
      ),
    ).rejects.toThrow("STALE_STEP_BINDING");
    await expect(
      updateStepAndDay(
        learner,
        linkId,
        1,
        { type: "complete" },
        {
          expectedCourseId: "foreign-course",
          expectedStepOnDayId: occurrenceB,
          expectedStepId: stepB,
        },
      ),
    ).rejects.toThrow("STALE_STEP_BINDING");
    expect(await prisma.userStep.count({ where: { userTraining: { userId: learner } } })).toBe(
      before,
    );
  });
  it("bound pause/resume/complete and GET real SQL readback persist B status", async () => {
    const binding = {
      expectedCourseId: courseId,
      expectedStepOnDayId: occurrenceB,
      expectedStepId: stepB,
    };
    await updateStepAndDay(learner, linkId, 1, { type: "pause", remainingSec: 17 }, binding);
    const paused = await prisma.userStep.findFirst({
      where: { userTraining: { userId: learner }, stepOnDayId: occurrenceB },
    });
    expect(paused?.paused).toBe(true);
    expect(paused?.remainingSec).toBe(17);
    await updateStepAndDay(learner, linkId, 1, { type: "resume" }, binding);
    await updateStepAndDay(learner, linkId, 1, { type: "complete" }, binding);
    const done = await prisma.userStep.findFirst({
      where: { userTraining: { userId: learner }, stepOnDayId: occurrenceB },
    });
    expect(done?.status).toBe("COMPLETED");
    const detail = await getTrainingDayWithUserSteps(learner, courseType, linkId, {
      createIfMissing: false,
    });
    expect(detail?.steps[0]?.status).toBe("COMPLETED");
    expect(detail?.steps[1]?.status).toBe("NOT_STARTED");
  });
  it("unchanged unbound Native index path still targets current index1 A", async () => {
    await updateStepAndDay(native, linkId, 1, { type: "start", remainingSec: 20 });
    const rows = await prisma.userStep.findMany({ where: { userTraining: { userId: native } } });
    expect(rows).toHaveLength(1);
    expect(rows[0].stepOnDayId).toBe(occurrenceA);
  });
});
