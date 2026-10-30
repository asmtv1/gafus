/** LEARN032: learner Daily Course real Core→Prisma→isolated production-shaped PG18. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  getDailyCourseDayWithUserSteps,
  getMoscowDateKey,
  getTodayDailyCourse,
  updateDailyCourseStepAndDay,
} from "./dailyCourseService";
import { createReadTodayDailyCourseApplication } from "../../../../../apps/api/src/modules/learner-daily/application/read-today-daily-course";
import { createDayAndStepCommandsApplication } from "../../../../../apps/api/src/modules/learner-daily/application/day-and-step-commands";

// Unused trainer/media cache publication ports are fail-closed. Real Daily Course
// READ and transaction methods, Prisma, statuses, timer rules are NOT mocked.
const cacheCalls = vi.hoisted(() => ({
  invalidate: vi.fn(() => {
    throw Error("FORBIDDEN_CACHE_INVALIDATION");
  }),
  publish: vi.fn(() => {
    throw Error("FORBIDDEN_REDIS_PUBLICATION");
  }),
}));
vi.mock("../training/trainingDayContent", () => ({
  invalidateStepsContentCache: cacheCalls.invalidate,
}));
vi.mock("../training/trainingContentRevision", () => ({
  publishCourseContentChange: cacheCalls.publish,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));

const database = "gafus_refactor_daily_lifecycle_ag1_20261024";
const dataDirectory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_learn032_daily_real_20261024";
const frozenNow = new Date("2026-10-24T12:00:00.000Z");
const namespace = "ag1_learn032_daily_sql_20261024_";
const id = (suffix: string) => namespace + suffix;
const fixture = {
  trainer: id("trainer"),
  a: id("student_a"),
  b: id("student_b"),
  bundle: id("bundle"),
  step0: id("step_training"),
  step1: id("step_practice"),
  link0: id("link_training"),
  link1: id("link_practice"),
  yesterday: id("schedule_yesterday"),
  today: id("schedule_today"),
  tomorrow: id("schedule_tomorrow"),
};
const users = [fixture.trainer, fixture.a, fixture.b];
const steps = [fixture.step0, fixture.step1];
const links = [fixture.link0, fixture.link1];
const schedules = [fixture.yesterday, fixture.today, fixture.tomorrow];
let seeded = false;
const dayApp = createDayAndStepCommandsApplication({
  readOrCreateDay: getDailyCourseDayWithUserSteps,
  updateStep: updateDailyCourseStepAndDay,
});
const todayApp = createReadTodayDailyCourseApplication({
  readToday: (actorUserId) => getTodayDailyCourse(actorUserId, frozenNow),
});
const counts = async () => ({
  trainings: await prisma.dailyCourseUserTraining.count({
    where: { scheduleId: { in: schedules } },
  }),
  userSteps: await prisma.dailyCourseUserStep.count({
    where: { dailyCourseUserTraining: { scheduleId: { in: schedules } } },
  }),
});
const byActor = async (actorUserId: string) =>
  prisma.dailyCourseUserTraining.findUnique({
    where: { userId_scheduleId: { userId: actorUserId, scheduleId: fixture.today } },
    include: { steps: true },
  });
const readA = async (createIfMissing = false) =>
  dayApp.getDay(fixture.a, fixture.today, { createIfMissing });

async function assertOwnTarget() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.G1_AG1_DAILY_OWN_PG18).toBe("1");
  expect([
    u.protocol,
    u.hostname,
    u.port,
    u.pathname,
    u.searchParams.get("host"),
    u.searchParams.get("application_name"),
    u.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, appTag, ""]);
  const rows = await prisma.$queryRaw<
    {
      db: boolean;
      version: boolean;
      dataDir: boolean;
      noTcp: boolean;
      privateSocket: boolean;
      others: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${dataDirectory} AS "dataDir",
      current_setting('listen_addresses')='' AS "noTcp",
      current_setting('unix_socket_directories')=${socket} AS "privateSocket",
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
          OR application_name IS DISTINCT FROM ${appTag})) AS others
  `;
  expect(rows).toEqual([
    { db: true, version: true, dataDir: true, noTcp: true, privateSocket: true, others: 0n },
  ]);
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(frozenNow);
  await assertOwnTarget();
  const initial = await prisma.$queryRaw<
    {
      users: bigint;
      bundle: bigint;
      steps: bigint;
      schedules: bigint;
      trainings: bigint;
      ledger: bigint;
    }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."DailyCourseBundle") AS bundle,
      (SELECT count(*) FROM public."Step") AS steps,
      (SELECT count(*) FROM public."DailyCourseSchedule") AS schedules,
      (SELECT count(*) FROM public."DailyCourseUserTraining") AS trainings,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger
  `;
  expect(initial).toEqual([
    { users: 0n, bundle: 0n, steps: 0n, schedules: 0n, trainings: 0n, ledger: 0n },
  ]);
  await prisma.user.createMany({
    data: users.map((id) => ({ id, username: id, password: "fictional-only" })),
  });
  seeded = true;
  await prisma.step.createMany({
    data: [
      {
        id: fixture.step0,
        authorId: fixture.trainer,
        title: "Fictional timer training",
        type: "TRAINING",
        durationSec: 120,
        estimatedDurationSec: 120,
        isDailyCourse: true,
      },
      {
        id: fixture.step1,
        authorId: fixture.trainer,
        title: "Fictional practice",
        type: "PRACTICE",
        durationSec: 240,
        estimatedDurationSec: 240,
        isDailyCourse: true,
      },
    ],
  });
  await prisma.dailyCourseBundle.create({
    data: {
      id: fixture.bundle,
      title: "Fictional daily course",
      description: "Daily course fiction",
      authorId: fixture.trainer,
    },
  });
  await prisma.dailyCourseBundleStep.createMany({
    data: [
      { id: fixture.link1, bundleId: fixture.bundle, stepId: fixture.step1, order: 1 },
      { id: fixture.link0, bundleId: fixture.bundle, stepId: fixture.step0, order: 0 },
    ],
  });
  await prisma.dailyCourseSchedule.createMany({
    data: [
      {
        id: fixture.yesterday,
        bundleId: fixture.bundle,
        createdById: fixture.trainer,
        date: new Date("2026-10-23T00:00:00.000Z"),
        isPublished: false,
      },
      {
        id: fixture.today,
        bundleId: fixture.bundle,
        createdById: fixture.trainer,
        date: new Date("2026-10-24T00:00:00.000Z"),
        isPublished: true,
      },
      {
        id: fixture.tomorrow,
        bundleId: fixture.bundle,
        createdById: fixture.trainer,
        date: new Date("2026-10-25T00:00:00.000Z"),
        isPublished: true,
      },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await assertOwnTarget();
    if (seeded) {
      await prisma.dailyCourseSchedule.deleteMany({ where: { id: { in: schedules } } });
      await prisma.dailyCourseBundleStep.deleteMany({ where: { id: { in: links } } });
      await prisma.dailyCourseBundle.deleteMany({ where: { id: fixture.bundle } });
      await prisma.step.deleteMany({ where: { id: { in: steps } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    const result = await prisma.$queryRaw<
      {
        users: bigint;
        steps: bigint;
        bundle: bigint;
        links: bigint;
        schedules: bigint;
        training: bigint;
        userSteps: bigint;
        ledger: bigint;
      }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."Step") AS steps,
        (SELECT count(*) FROM public."DailyCourseBundle") AS bundle,
        (SELECT count(*) FROM public."DailyCourseBundleStep") AS links,
        (SELECT count(*) FROM public."DailyCourseSchedule") AS schedules,
        (SELECT count(*) FROM public."DailyCourseUserTraining") AS training,
        (SELECT count(*) FROM public."DailyCourseUserStep") AS "userSteps",
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `;
    expect(result).toEqual([
      {
        users: 0n,
        steps: 0n,
        bundle: 0n,
        links: 0n,
        schedules: 0n,
        training: 0n,
        userSteps: 0n,
        ledger: 0n,
      },
    ]);
  } finally {
    await prisma.$disconnect();
    vi.useRealTimers();
  }
}, 45000);

describe("LEARN032 real Daily Course Today→Day→step lifecycle", () => {
  it("fixed Moscow Today, published/unpublished/absent dates and actor privacy", async () => {
    expect(getMoscowDateKey(new Date("2026-10-23T20:59:59.000Z"))).toBe("2026-10-23");
    expect(getMoscowDateKey(new Date("2026-10-23T21:00:00.000Z"))).toBe("2026-10-24");
    const today = await todayApp.execute(fixture.a);
    expect(today).toMatchObject({
      mskDate: "2026-10-24",
      scheduleId: fixture.today,
      userStatus: "NOT_STARTED",
      stepsSummary: { total: 2, completed: 0 },
      day: { id: fixture.bundle, stepsCount: 2, title: "Fictional daily course" },
    });
    expect((await todayApp.execute(fixture.b)).stepsSummary).toEqual({ total: 2, completed: 0 });
    expect(
      await getTodayDailyCourse(fixture.a, new Date("2026-10-23T12:00:00.000Z")),
    ).toMatchObject({
      mskDate: "2026-10-23",
      scheduleId: null,
      day: null,
      userStatus: "NOT_STARTED",
      stepsSummary: { total: 0, completed: 0 },
    });
    expect(
      await getTodayDailyCourse(fixture.a, new Date("2026-10-22T12:00:00.000Z")),
    ).toMatchObject({ mskDate: "2026-10-22", scheduleId: null, day: null });
    expect(
      (await getTodayDailyCourse(fixture.a, new Date("2026-10-25T12:00:00.000Z"))).scheduleId,
    ).toBe(fixture.tomorrow);
    expect(await counts()).toEqual({ trainings: 0, userSteps: 0 });
    expect(cacheCalls.invalidate).not.toHaveBeenCalled();
    expect(cacheCalls.publish).not.toHaveBeenCalled();
  });

  it("GET /day createIfMissing=false is fully read-only; true initializes only A and idempotent", async () => {
    const uncreated = await readA(false);
    expect(uncreated).toMatchObject({
      scheduleId: fixture.today,
      userStatus: "NOT_STARTED",
      steps: [{ status: "NOT_STARTED" }, { status: "NOT_STARTED" }],
    });
    expect(await counts()).toEqual({ trainings: 0, userSteps: 0 });
    const created = await readA(true);
    expect(created?.steps).toHaveLength(2);
    expect(await counts()).toEqual({ trainings: 1, userSteps: 2 });
    const a = await byActor(fixture.a);
    expect(a).toMatchObject({ status: "NOT_STARTED", currentStepIndex: 0 });
    expect(a?.steps.map((s) => s.status)).toEqual(["NOT_STARTED", "NOT_STARTED"]);
    expect(await dayApp.getDay(fixture.a, fixture.today, { createIfMissing: true })).toMatchObject({
      scheduleId: fixture.today,
      steps: [{ status: "NOT_STARTED" }, { status: "NOT_STARTED" }],
    });
    expect(await counts()).toEqual({ trainings: 1, userSteps: 2 });
    const b = await dayApp.getDay(fixture.b, fixture.today, { createIfMissing: false });
    expect(b?.userStatus).toBe("NOT_STARTED");
    expect(await byActor(fixture.b)).toBeNull();
  });

  it("real start→pause→resume→reset→start→complete both steps; GET/Today reflect server state", async () => {
    const action = (index: number, operation: Parameters<typeof updateDailyCourseStepAndDay>[3]) =>
      dayApp.updateStep(fixture.a, fixture.today, index, operation);
    expect(await action(0, { type: "start", remainingSec: 110 })).toEqual({
      allCompleted: false,
      stepJustCompleted: false,
    });
    let day = await readA(false);
    expect(day?.steps[0]).toMatchObject({
      status: "IN_PROGRESS",
      remainingSec: 110,
      isPausedOnServer: false,
    });
    expect(day?.userStatus).toBe("IN_PROGRESS");
    expect((await todayApp.execute(fixture.a)).userStatus).toBe("IN_PROGRESS");
    expect(await action(0, { type: "pause", remainingSec: 70 })).toEqual({
      allCompleted: false,
      stepJustCompleted: false,
    });
    day = await readA(false);
    expect(day?.steps[0]).toMatchObject({
      status: "IN_PROGRESS",
      remainingSec: 70,
      remainingSecOnServer: 70,
      isPausedOnServer: true,
    });
    expect(await action(0, { type: "resume" })).toEqual({
      allCompleted: false,
      stepJustCompleted: false,
    });
    expect((await readA(false))?.steps[0]).toMatchObject({
      isPausedOnServer: false,
      remainingSec: 70,
    });
    expect(await action(0, { type: "reset" })).toEqual({
      allCompleted: false,
      stepJustCompleted: false,
    });
    expect((await readA(false))?.steps[0]).toMatchObject({ status: "RESET", remainingSec: null });
    await action(0, { type: "start", remainingSec: 60 });
    expect(await action(0, { type: "complete" })).toEqual({
      allCompleted: false,
      stepJustCompleted: true,
    });
    expect((await readA(false))?.steps[0]).toMatchObject({
      status: "COMPLETED",
      completedAt: expect.any(String),
    });
    expect((await todayApp.execute(fixture.a)).stepsSummary).toEqual({ total: 2, completed: 1 });
    expect(await action(0, { type: "complete" })).toEqual({
      allCompleted: false,
      stepJustCompleted: false,
    });
    expect(await action(1, { type: "start", remainingSec: 180 })).toEqual({
      allCompleted: false,
      stepJustCompleted: false,
    });
    expect(await action(1, { type: "complete" })).toEqual({
      allCompleted: true,
      stepJustCompleted: true,
    });
    expect((await readA(false))?.userStatus).toBe("COMPLETED");
    expect(await todayApp.execute(fixture.a)).toMatchObject({
      userStatus: "COMPLETED",
      stepsSummary: { total: 2, completed: 2 },
    });
    expect(await byActor(fixture.a)).toMatchObject({ status: "COMPLETED", currentStepIndex: 1 });
    expect((await todayApp.execute(fixture.b)).stepsSummary).toEqual({ total: 2, completed: 0 });
    expect(await byActor(fixture.b)).toBeNull();
  });

  it("invalid schedule/index/timer or wrong transition rolls back, with no orphan actor training", async () => {
    await expect(
      dayApp.updateStep(fixture.b, fixture.today, 99, { type: "start", remainingSec: 1 }),
    ).rejects.toThrow("STEP_NOT_FOUND");
    await expect(
      dayApp.updateStep(fixture.b, fixture.today, 0, { type: "start", remainingSec: 121 }),
    ).rejects.toThrow("INVALID_TIMER");
    await expect(
      dayApp.updateStep(fixture.b, fixture.today, 0, { type: "pause", remainingSec: 11 }),
    ).rejects.toThrow("STEP_NOT_FOUND");
    await expect(dayApp.updateStep(fixture.b, fixture.today, 0, { type: "reset" })).rejects.toThrow(
      "STEP_NOT_FOUND",
    );
    await expect(
      dayApp.updateStep(fixture.b, fixture.tomorrow, 0, { type: "start", remainingSec: 1 }),
    ).rejects.toThrow("SCHEDULE_NOT_FOUND");
    await expect(
      dayApp.updateStep(fixture.b, fixture.yesterday, 0, { type: "complete" }),
    ).rejects.toThrow("SCHEDULE_NOT_FOUND");
    expect(await byActor(fixture.b)).toBeNull();
    expect(await counts()).toEqual({ trainings: 1, userSteps: 2 });
    await expect(
      dayApp.updateStep(fixture.a, fixture.today, 0, { type: "start", remainingSec: 1 }),
    ).rejects.toThrow("INVALID_STATE");
    expect((await readA(false))?.steps[0]?.status).toBe("COMPLETED");
    expect(await counts()).toEqual({ trainings: 1, userSteps: 2 });
  });

  it("unpublished/future Day are null without writes; different actor remains untouched", async () => {
    expect(await dayApp.getDay(fixture.a, fixture.yesterday, { createIfMissing: true })).toBeNull();
    expect(await dayApp.getDay(fixture.a, fixture.tomorrow, { createIfMissing: true })).toBeNull();
    expect(await dayApp.getDay(fixture.b, fixture.today, { createIfMissing: false })).toMatchObject(
      { userStatus: "NOT_STARTED" },
    );
    expect(await byActor(fixture.b)).toBeNull();
    expect(await counts()).toEqual({ trainings: 1, userSteps: 2 });
    expect(cacheCalls.invalidate).not.toHaveBeenCalled();
    expect(cacheCalls.publish).not.toHaveBeenCalled();
  });
});
