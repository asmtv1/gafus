/** AG1: opted-in DailyCourse immutable bundle occurrence against permanent WORK PG18. */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  getDailyCourseDayWithUserSteps,
  updateDailyCourseStepAndDay,
} from "./dailyCourseService.ts";

const run = process.env.AG1_DAILY_BOUND_WORK_PG === "1" ? describe : describe.skip;
const prefix = "ag1_dc_binding_20261025_" + randomBytes(5).toString("hex");
let trainer = "";
let learner = "";
let other = "";
let bundle = "";
let otherBundle = "";
let scheduleId = "";
let stepA = "";
let stepB = "";
let stepC = "";
let linkA = "";
let linkB = "";
let linkC = "";
let foreignLink = "";
const testDate = new Date("2012-06-04T00:00:00.000Z");

async function progress(userId: string) {
  return prisma.dailyCourseUserStep.findMany({
    where: { dailyCourseUserTraining: { userId, scheduleId } },
    select: { bundleStepId: true, status: true, remainingSec: true },
  });
}
async function cleanup() {
  if (scheduleId)
    await prisma.dailyCourseSchedule.deleteMany({
      where: { id: scheduleId, createdById: trainer },
    });
  if (bundle)
    await prisma.dailyCourseBundle.deleteMany({ where: { id: bundle, authorId: trainer } });
  if (otherBundle)
    await prisma.dailyCourseBundle.deleteMany({ where: { id: otherBundle, authorId: trainer } });
  for (const id of [stepA, stepB, stepC])
    if (id) await prisma.step.deleteMany({ where: { id, authorId: trainer } });
  for (const id of [learner, other, trainer]) {
    if (!id) continue;
    const check = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    if (check?.username.startsWith(prefix)) await prisma.user.delete({ where: { id } });
  }
}
run("daily-course stable bundle occurrence, actual permanent WORK PostgreSQL", () => {
  beforeAll(async () => {
    const u = new URL(process.env.DATABASE_URL ?? "");
    if (
      !["127.0.0.1", "localhost"].includes(u.hostname) ||
      u.port !== "55921" ||
      u.pathname !== "/gafus_refactor_real_work_20261024"
    )
      throw Error("REFUSE_NOT_PERMANENT_WORK_PG");
    const meta = await prisma.$queryRaw<{ name: string; version: string }[]>`
      SELECT current_database() AS name, current_setting('server_version_num') AS version`;
    expect(meta).toEqual([{ name: "gafus_refactor_real_work_20261024", version: "180004" }]);
    // NEVER overwrite pre-existing schedule using the globally unique date.
    const occupied = await prisma.dailyCourseSchedule.findFirst({
      where: { date: testDate },
      select: { id: true },
    });
    if (occupied) throw Error("NONPROD_TEST_DATE_OCCUPIED");

    trainer = (
      await prisma.user.create({
        data: {
          username: prefix + "_trainer",
          password: "fixture-not-login",
          registrationPending: false,
          role: "TRAINER",
        },
      })
    ).id;
    learner = (
      await prisma.user.create({
        data: {
          username: prefix + "_learner",
          password: "fixture-not-login",
          registrationPending: false,
          role: "USER",
        },
      })
    ).id;
    other = (
      await prisma.user.create({
        data: {
          username: prefix + "_other",
          password: "fixture-not-login",
          registrationPending: false,
          role: "USER",
        },
      })
    ).id;
    stepA = (
      await prisma.step.create({
        data: {
          authorId: trainer,
          title: "AG1 binding A",
          type: "TRAINING",
          durationSec: 90,
          estimatedDurationSec: 90,
          isDailyCourse: true,
        },
      })
    ).id;
    stepB = (
      await prisma.step.create({
        data: {
          authorId: trainer,
          title: "AG1 binding B",
          type: "PRACTICE",
          durationSec: 120,
          estimatedDurationSec: 120,
          isDailyCourse: true,
        },
      })
    ).id;
    stepC = (
      await prisma.step.create({
        data: {
          authorId: trainer,
          title: "AG1 binding C",
          type: "TRAINING",
          durationSec: 45,
          estimatedDurationSec: 45,
          isDailyCourse: true,
        },
      })
    ).id;
    bundle = (
      await prisma.dailyCourseBundle.create({
        data: { authorId: trainer, title: "AG1 stable nonprod daily bundle", type: "daily_course" },
      })
    ).id;
    otherBundle = (
      await prisma.dailyCourseBundle.create({
        data: {
          authorId: trainer,
          title: "AG1 foreign nonprod daily bundle",
          type: "daily_course",
        },
      })
    ).id;
    linkA = (
      await prisma.dailyCourseBundleStep.create({
        data: { bundleId: bundle, stepId: stepA, order: 0 },
      })
    ).id;
    linkB = (
      await prisma.dailyCourseBundleStep.create({
        data: { bundleId: bundle, stepId: stepB, order: 1 },
      })
    ).id;
    foreignLink = (
      await prisma.dailyCourseBundleStep.create({
        data: { bundleId: otherBundle, stepId: stepB, order: 0 },
      })
    ).id;
    scheduleId = (
      await prisma.dailyCourseSchedule.create({
        data: { date: testDate, bundleId: bundle, createdById: trainer, isPublished: true },
      })
    ).id;
  }, 30000);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, 30000);

  it("read-only GET shows exact bundle occurrence ids and never materializes UserTraining", async () => {
    const result = await getDailyCourseDayWithUserSteps(learner, scheduleId, {
      createIfMissing: false,
    });
    expect(result?.steps.map((s) => [s.bundleStepId, s.stepId])).toEqual([
      [linkA, stepA],
      [linkB, stepB],
    ]);
    expect(
      await prisma.dailyCourseUserTraining.count({ where: { userId: learner, scheduleId } }),
    ).toBe(0);
  });

  it("reorder between GET and bound POST updates B only regardless stale stepIndex", async () => {
    await prisma.dailyCourseBundleStep.update({ where: { id: linkA }, data: { order: 3 } });
    await prisma.dailyCourseBundleStep.update({ where: { id: linkB }, data: { order: 0 } });
    await prisma.dailyCourseBundleStep.update({ where: { id: linkA }, data: { order: 1 } });
    const result = await updateDailyCourseStepAndDay(
      learner,
      scheduleId,
      1,
      { type: "start", remainingSec: 30 },
      { expectedBundleStepId: linkB, expectedStepId: stepB },
    );
    expect(result.stepJustCompleted).toBe(false);
    expect(await progress(learner)).toEqual([
      { bundleStepId: linkB, status: "IN_PROGRESS", remainingSec: 30 },
    ]);
    const get = await getDailyCourseDayWithUserSteps(learner, scheduleId, {
      createIfMissing: false,
    });
    expect(get?.steps.map((s) => [s.bundleStepId, s.status])).toEqual([
      [linkB, "IN_PROGRESS"],
      [linkA, "NOT_STARTED"],
    ]);
  });

  it("stale/wrong/foreign pair conflict without writing another step", async () => {
    for (const binding of [
      { expectedBundleStepId: linkB, expectedStepId: stepA },
      { expectedBundleStepId: foreignLink, expectedStepId: stepB },
      { expectedBundleStepId: "ag1-deleted-nonexistent", expectedStepId: stepA },
    ]) {
      await expect(
        updateDailyCourseStepAndDay(learner, scheduleId, 0, { type: "complete" }, binding),
      ).rejects.toThrow("STALE_DAILY_STEP_BINDING");
      expect(await progress(learner)).toEqual([
        { bundleStepId: linkB, status: "IN_PROGRESS", remainingSec: 30 },
      ]);
    }
  });

  it("negotiated countdown is from persisted updatedAt and remainingSec, not arbitrary request timestamps", async () => {
    const before = await getDailyCourseDayWithUserSteps(learner, scheduleId, {
      createIfMissing: false,
    });
    expect(typeof before?.serverNow).toBe("string");
    expect(Number.isFinite(Date.parse(before!.serverNow!))).toBe(true);
    const stepBefore = before!.steps.find((s) => s.bundleStepId === linkB);
    expect(stepBefore?.timerSnapshot?.remainingSecAtServerNow).toBeGreaterThanOrEqual(28);
    expect(stepBefore?.timerSnapshot?.remainingSecAtServerNow).toBeLessThanOrEqual(30);
    expect(typeof stepBefore?.timerSnapshot?.expiresAt).toBe("string");
    const persisted = await prisma.dailyCourseUserStep.findFirst({
      where: { bundleStepId: linkB, dailyCourseUserTraining: { userId: learner, scheduleId } },
      select: { id: true, remainingSec: true, updatedAt: true },
    });
    expect(persisted?.remainingSec).toBe(30);
    const expiry = new Date(persisted!.updatedAt.getTime() + persisted!.remainingSec! * 1000);
    expect(stepBefore?.timerSnapshot?.expiresAt).toBe(expiry.toISOString());
    await prisma.dailyCourseUserStep.update({
      where: { id: persisted!.id },
      data: { updatedAt: new Date(Date.now() - 7000) },
    });
    const elapsed = await getDailyCourseDayWithUserSteps(learner, scheduleId, {
      createIfMissing: false,
    });
    const remaining = elapsed?.steps.find((s) => s.bundleStepId === linkB)?.timerSnapshot
      ?.remainingSecAtServerNow;
    expect(remaining).toBeGreaterThanOrEqual(21);
    expect(remaining).toBeLessThanOrEqual(24);
    const notStarted = elapsed?.steps.find((s) => s.bundleStepId === linkA);
    expect(notStarted?.timerSnapshot).toEqual({ remainingSecAtServerNow: null, expiresAt: null });
  });

  it("paused snapshot freezes real persisted seconds and resume uses actual saved timestamp", async () => {
    const bound = { expectedBundleStepId: linkB, expectedStepId: stepB };
    await updateDailyCourseStepAndDay(
      learner,
      scheduleId,
      0,
      { type: "pause", remainingSec: 12 },
      bound,
    );
    const paused = await getDailyCourseDayWithUserSteps(learner, scheduleId, {
      createIfMissing: false,
    });
    const pausedTimer = paused?.steps.find((s) => s.bundleStepId === linkB)?.timerSnapshot;
    expect(pausedTimer).toEqual({ remainingSecAtServerNow: 12, expiresAt: null });
    await updateDailyCourseStepAndDay(learner, scheduleId, 0, { type: "resume" }, bound);
    const resumed = await getDailyCourseDayWithUserSteps(learner, scheduleId, {
      createIfMissing: false,
    });
    const runningTimer = resumed?.steps.find((s) => s.bundleStepId === linkB)?.timerSnapshot;
    expect(runningTimer?.remainingSecAtServerNow).toBeGreaterThanOrEqual(11);
    expect(runningTimer?.remainingSecAtServerNow).toBeLessThanOrEqual(12);
    expect(Number.isFinite(Date.parse(runningTimer?.expiresAt ?? ""))).toBe(true);
  });

  it("duplicate completion has exactly one actual completion transition", async () => {
    const first = await updateDailyCourseStepAndDay(
      learner,
      scheduleId,
      0,
      { type: "complete" },
      { expectedBundleStepId: linkB, expectedStepId: stepB },
    );
    const replay = await updateDailyCourseStepAndDay(
      learner,
      scheduleId,
      0,
      { type: "complete" },
      { expectedBundleStepId: linkB, expectedStepId: stepB },
    );
    expect([first.stepJustCompleted, replay.stepJustCompleted]).toEqual([true, false]);
    expect(await progress(learner)).toEqual([
      { bundleStepId: linkB, status: "COMPLETED", remainingSec: null },
    ]);
  });

  it("delete/insert after an earlier read never redirects stale A to replacement C", async () => {
    await prisma.dailyCourseBundleStep.delete({ where: { id: linkA } });
    linkC = (
      await prisma.dailyCourseBundleStep.create({
        data: { bundleId: bundle, stepId: stepC, order: 1 },
      })
    ).id;
    await expect(
      updateDailyCourseStepAndDay(
        learner,
        scheduleId,
        1,
        { type: "start", remainingSec: 25 },
        { expectedBundleStepId: linkA, expectedStepId: stepA },
      ),
    ).rejects.toThrow("STALE_DAILY_STEP_BINDING");
    expect(await progress(learner)).toEqual([
      { bundleStepId: linkB, status: "COMPLETED", remainingSec: null },
    ]);
    expect(
      (await getDailyCourseDayWithUserSteps(learner, scheduleId, { createIfMissing: false }))
        ?.steps[1].bundleStepId,
    ).toBe(linkC);
  });

  it("concurrent bound completion yields one row, one completion, other replay", async () => {
    const op = () =>
      updateDailyCourseStepAndDay(
        other,
        scheduleId,
        1,
        { type: "complete" },
        { expectedBundleStepId: linkC, expectedStepId: stepC },
      );
    const results = await Promise.all([op(), op()]);
    expect(results.filter((r) => r.stepJustCompleted)).toHaveLength(1);
    expect(await progress(other)).toEqual([
      { bundleStepId: linkC, status: "COMPLETED", remainingSec: null },
    ]);
  });
});
