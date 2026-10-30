/** Signed outbox effect identity: genuine WORK SQL, deliberately mocked push queue. */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { updateStepAndDay } from "../training/trainingService.ts";
import {
  createBoundStepNotificationForStart,
  pauseBoundStepNotification,
  resumeBoundStepNotification,
  resetBoundStepNotification,
} from "./stepNotificationService.ts";
import {
  getEligiblePushNotificationJob,
  getPushNotificationForDelivery,
} from "./pushWorkerService.ts";

const sink = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn() }));
vi.mock("@gafus/queues", () => ({ pushQueue: { add: sink.add, remove: sink.remove } }));
const run = process.env.AG1_BOUND_NOTIF_WORK_PG === "1" ? describe : describe.skip;
const prefix = "ag1_bound_notifications_20261025_" + randomBytes(5).toString("hex");
let author = "",
  learner = "",
  foreign = "",
  courseId = "",
  dayId = "",
  docId = "",
  stepId = "",
  linkId = "";
const binding = () => ({ dayOnCourseId: docId, stepOnDayId: linkId, stepId });
let jobSeq = 0;
async function cleanup() {
  if (learner) await prisma.stepNotification.deleteMany({ where: { userId: learner } });
  if (docId) await prisma.userTraining.deleteMany({ where: { dayOnCourseId: docId } });
  if (courseId) {
    await prisma.dayOnCourse.deleteMany({ where: { courseId } });
    await prisma.courseAccess.deleteMany({ where: { courseId } });
  }
  if (dayId) await prisma.stepOnDay.deleteMany({ where: { dayId } });
  if (stepId) await prisma.step.deleteMany({ where: { id: stepId, authorId: author } });
  if (dayId) await prisma.trainingDay.deleteMany({ where: { id: dayId, authorId: author } });
  if (courseId) await prisma.course.deleteMany({ where: { id: courseId, authorId: author } });
  for (const uid of [learner, foreign, author])
    if (uid) {
      const row = await prisma.user.findUnique({ where: { id: uid }, select: { username: true } });
      if (row?.username.startsWith(prefix)) await prisma.user.delete({ where: { id: uid } });
    }
}
run("bound step notification actual WORK PG18 with isolated mock queue", () => {
  beforeAll(async () => {
    const u = new URL(process.env.DATABASE_URL ?? "");
    if (
      !["127.0.0.1", "localhost"].includes(u.hostname) ||
      u.port !== "55921" ||
      u.pathname !== "/gafus_refactor_real_work_20261024"
    )
      throw Error("REFUSE_NON_WORK_PG");
    const rows = await prisma.$queryRaw<{ db: string; version: string }[]>`
      SELECT current_database() AS db, current_setting('server_version_num') AS version`;
    expect(rows).toEqual([{ db: "gafus_refactor_real_work_20261024", version: "180004" }]);
    sink.add.mockImplementation(async () => ({ id: "mock-sink-job-" + ++jobSeq }));
    sink.remove.mockResolvedValue(undefined);
    author = (
      await prisma.user.create({
        data: {
          username: prefix + "_author",
          password: "not-for-login",
          registrationPending: false,
          role: "TRAINER",
        },
      })
    ).id;
    learner = (
      await prisma.user.create({
        data: {
          username: prefix + "_learner",
          password: "not-for-login",
          registrationPending: false,
          role: "USER",
        },
      })
    ).id;
    foreign = (
      await prisma.user.create({
        data: {
          username: prefix + "_foreign",
          password: "not-for-login",
          registrationPending: false,
          role: "USER",
        },
      })
    ).id;
    courseId = (
      await prisma.course.create({
        data: {
          name: "AG1 bound notification acceptance",
          type: prefix,
          trainingLevel: "BEGINNER",
          duration: "1",
          logoImg: "",
          authorId: author,
          isPrivate: true,
        },
      })
    ).id;
    dayId = (
      await prisma.trainingDay.create({ data: { title: "AG1 source day", authorId: author } })
    ).id;
    docId = (await prisma.dayOnCourse.create({ data: { dayId, courseId, order: 1 } })).id;
    stepId = (
      await prisma.step.create({
        data: {
          title: "AG1 synthetic stable timeout",
          authorId: author,
          type: "TRAINING",
          durationSec: 120,
        },
      })
    ).id;
    linkId = (await prisma.stepOnDay.create({ data: { dayId, stepId, order: 7 } })).id;
    await prisma.pushSubscription.create({
      data: {
        userId: learner,
        endpoint: "https://fake-push.invalid/" + prefix,
        keys: { p256dh: "fake", auth: "fake" },
      },
    });
  }, 30000);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, 30000);

  it("accepted Core step-start produces exactly one SQL row and fake queue event", async () => {
    const result = await updateStepAndDay(
      learner,
      docId,
      0,
      { type: "start", remainingSec: 90 },
      { expectedStepOnDayId: linkId, expectedStepId: stepId, expectedCourseId: courseId },
    );
    expect(result.stepOnDayId).toBe(linkId);
    expect(result.stepId).toBe(stepId);
    expect(result.stepJustStarted).toBe(true);
    await expect(createBoundStepNotificationForStart(learner, binding(), 90)).resolves.toEqual({
      queued: true,
    });
    const rows = await prisma.stepNotification.findMany({
      where: { userId: learner, stepOnDayId: linkId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: learner,
      dayOnCourseId: docId,
      stepOnDayId: linkId,
      originalStepId: stepId,
      sent: false,
      paused: false,
      jobId: "mock-sink-job-1",
    });
    expect(sink.add).toHaveBeenCalledTimes(1);
    const eligible = await getEligiblePushNotificationJob(rows[0].id, rows[0].jobId!);
    expect(eligible?.id).toBe(rows[0].id);
  });

  it("concurrent and repeat bound starts cannot create a second SQL notification", async () => {
    const replay = await updateStepAndDay(
      learner,
      docId,
      0,
      { type: "start", remainingSec: 4 },
      { expectedStepOnDayId: linkId, expectedStepId: stepId, expectedCourseId: courseId },
    );
    expect(replay.stepJustStarted).toBe(false);
    const repeat = await Promise.all([
      createBoundStepNotificationForStart(learner, binding(), 90),
      createBoundStepNotificationForStart(learner, binding(), 90),
    ]);
    expect(repeat.every((r) => r.queued === false && r.reason === "ALREADY_PENDING")).toBe(true);
    expect(
      await prisma.stepNotification.count({ where: { userId: learner, stepOnDayId: linkId } }),
    ).toBe(1);
    expect(sink.add).toHaveBeenCalledTimes(1);
    const userStep = await prisma.userStep.findFirst({
      where: {
        stepOnDayId: linkId,
        userTraining: { userId: learner, dayOnCourseId: docId },
      },
    });
    expect(userStep?.remainingSec).toBe(90);
  });

  it("foreign actor cannot pause or erase owner's notification", async () => {
    await pauseBoundStepNotification(foreign, binding(), 12);
    await resetBoundStepNotification(foreign, binding());
    const found = await prisma.stepNotification.findFirst({
      where: { userId: learner, stepOnDayId: linkId },
    });
    expect(found?.paused).toBe(false);
  });

  it("genuine progress pause blocks delivery and binds queue update to same occurrence", async () => {
    await updateStepAndDay(
      learner,
      docId,
      0,
      { type: "pause", remainingSec: 31 },
      { expectedStepOnDayId: linkId, expectedStepId: stepId, expectedCourseId: courseId },
    );
    await pauseBoundStepNotification(learner, binding(), 31);
    const row = await prisma.stepNotification.findFirst({
      where: { userId: learner, stepOnDayId: linkId },
    });
    expect(row?.paused).toBe(true);
    expect(row?.remainingSec).toBe(31);
    expect(row?.jobId).toBeNull();
    expect(sink.remove).toHaveBeenCalledWith("mock-sink-job-1");
    expect(await getPushNotificationForDelivery(row!.id)).toBeNull();
  });

  it("resume gets persisted remaining time, then completion drops stale SQL event", async () => {
    await updateStepAndDay(
      learner,
      docId,
      0,
      { type: "resume" },
      { expectedStepOnDayId: linkId, expectedStepId: stepId, expectedCourseId: courseId },
    );
    await resumeBoundStepNotification(learner, binding());
    const row = await prisma.stepNotification.findFirst({
      where: { userId: learner, stepOnDayId: linkId },
    });
    expect(row?.paused).toBe(false);
    expect(row?.jobId).toBe("mock-sink-job-2");
    expect(row?.endTs).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(sink.add).toHaveBeenCalledTimes(2);
    await updateStepAndDay(
      learner,
      docId,
      0,
      { type: "complete" },
      { expectedStepOnDayId: linkId, expectedStepId: stepId, expectedCourseId: courseId },
    );
    expect(await getEligiblePushNotificationJob(row!.id, row!.jobId!)).toBeNull();
    await resetBoundStepNotification(learner, binding());
    expect(
      await prisma.stepNotification.count({ where: { userId: learner, stepOnDayId: linkId } }),
    ).toBe(0);
    expect(sink.remove).toHaveBeenCalledWith("mock-sink-job-2");
  });
});
