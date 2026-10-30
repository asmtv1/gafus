/** LEARN032 G3: exact registered learner Daily GET today/day → original Core/PG18 → frozen JSON. */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
// The original Core source eagerly imports only unrelated trainer cache publication.
// On these GETs both ports must fail closed; no Core read, application or Prisma mocks.
const cacheCalls = vi.hoisted(() => ({
  invalidate: vi.fn(() => {
    throw Error("FORBIDDEN_DAILY_CACHE_MUTATION");
  }),
  publish: vi.fn(() => {
    throw Error("FORBIDDEN_DAILY_CONTENT_PUBLICATION");
  }),
}));
vi.mock("../../../../../packages/core/src/services/training/trainingDayContent", () => ({
  invalidateStepsContentCache: cacheCalls.invalidate,
}));
vi.mock("../../../../../packages/core/src/services/training/trainingContentRevision", () => ({
  publishCourseContentChange: cacheCalls.publish,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
import { dailyCourseRoutes } from "./daily-course";

const app = new Hono();
app.use("/api/v1/daily-course/*", async (c, next) => {
  c.set("user", {
    id: c.req.header("x-own-student-id") ?? fixture.a,
    username: "fictional-learner",
    role: "USER",
  });
  await next();
});
app.route("/api/v1/daily-course", dailyCourseRoutes);
const get = (path: string, actor = fixture.a) =>
  app.request("/api/v1/daily-course/" + path, { headers: { "x-own-student-id": actor } });
const only = (obj: Record<string, unknown>, fields: string[]) =>
  expect(Object.keys(obj).sort()).toEqual([...fields].sort());
const dayFields = [
  "scheduleId",
  "mskDate",
  "trainingDayId",
  "bundleId",
  "title",
  "description",
  "type",
  "userStatus",
  "steps",
];
const stepFields = [
  "id",
  "stepId",
  "stepIndex",
  "status",
  "remainingSec",
  "completedAt",
  "isPausedOnServer",
  "remainingSecOnServer",
  "step",
];
const nestedStepFields = [
  "id",
  "title",
  "description",
  "type",
  "durationSec",
  "estimatedDurationSec",
  "videoUrl",
  "imageUrls",
  "pdfUrls",
  "checklist",
  "requiresVideoReport",
  "requiresWrittenFeedback",
  "hasTestQuestions",
  "surveySlug",
  "order",
];

const database = "gafus_refactor_learner_daily_hono_read_ag1_20261024";
const dataDirectory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_learn032_daily_hono_read_20261024";
const frozenNow = new Date("2026-10-24T12:00:00.000Z");
const namespace = "ag1_learn032_daily_hono_read_20261024_";
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
const precreated = {
  training: id("precreated_user_training"),
  userStep: id("precreated_user_step"),
};
const completedAt = new Date("2026-10-24T09:30:00.000Z");
const readCounts = async () => ({
  trainings: await prisma.dailyCourseUserTraining.count(),
  userSteps: await prisma.dailyCourseUserStep.count(),
});

async function assertOwnTarget() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_LEARNER_DAILY_HONO_OWN_PG18).toBe("1");
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
  // Fixture owns this already-created progress; the two GET handlers must NOT create it.
  await prisma.dailyCourseUserTraining.create({
    data: {
      id: precreated.training,
      userId: fixture.a,
      scheduleId: fixture.today,
      status: "IN_PROGRESS",
      currentStepIndex: 1,
    },
  });
  await prisma.dailyCourseUserStep.create({
    data: {
      id: precreated.userStep,
      dailyCourseUserTrainingId: precreated.training,
      bundleStepId: fixture.link0,
      status: "COMPLETED",
      remainingSec: 0,
      createdAt: completedAt,
      updatedAt: completedAt,
    },
  });
}, 45000);

afterAll(async () => {
  try {
    await assertOwnTarget();
    if (seeded) {
      await prisma.dailyCourseUserStep.deleteMany({ where: { id: precreated.userStep } });
      await prisma.dailyCourseUserTraining.deleteMany({ where: { id: precreated.training } });
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

describe("LEARN032 registered learner Daily GET today & read-only day real SQL JSON", () => {
  it("/today uses Moscow date, precreated persisted progress and frozen JSON", async () => {
    const r = await get("today");
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    const j = await r.json();
    only(j, ["success", "data"]);
    expect(j.success).toBe(true);
    only(j.data, ["mskDate", "scheduleId", "userStatus", "day", "stepsSummary"]);
    only(j.data.day, [
      "id",
      "title",
      "description",
      "type",
      "estimatedDuration",
      "theoryMinutes",
      "stepsCount",
    ]);
    only(j.data.stepsSummary, ["total", "completed"]);
    expect(j.data).toMatchObject({
      mskDate: "2026-10-24",
      scheduleId: fixture.today,
      day: { id: fixture.bundle, title: "Fictional daily course", stepsCount: 2 },
      stepsSummary: { total: 2, completed: 1 },
    });
    expect(["IN_PROGRESS", "PAUSED"]).toContain(j.data.userStatus);
    expect(await readCounts()).toEqual({ trainings: 1, userSteps: 1 });
  });
  it("/day?createIfMissing=false reads precreated + missing step without backfilling", async () => {
    const r = await get("day?scheduleId=" + fixture.today + "&createIfMissing=false");
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    const j = await r.json();
    only(j, ["success", "data"]);
    only(j.data, dayFields);
    expect(j.data).toMatchObject({
      scheduleId: fixture.today,
      mskDate: "2026-10-24",
      trainingDayId: fixture.bundle,
      bundleId: fixture.bundle,
      title: "Fictional daily course",
    });
    expect(j.data.steps).toHaveLength(2);
    for (const item of j.data.steps) {
      const allowed =
        item.remainingSecOnServer === undefined
          ? stepFields.filter((x) => x !== "remainingSecOnServer")
          : stepFields;
      only(item, allowed);
      only(item.step, nestedStepFields);
    }
    expect(j.data.steps[0]).toMatchObject({
      id: precreated.userStep,
      stepId: fixture.step0,
      stepIndex: 0,
      status: "COMPLETED",
      completedAt: completedAt.toISOString(),
      isPausedOnServer: false,
    });
    expect(j.data.steps[1]).toMatchObject({
      id: fixture.step1,
      stepId: fixture.step1,
      stepIndex: 1,
      status: "NOT_STARTED",
      completedAt: null,
      remainingSec: null,
      isPausedOnServer: false,
    });
    expect(j.data.steps.map((x: { step: { order: number } }) => x.step.order)).toEqual([0, 1]);
    expect(await readCounts()).toEqual({ trainings: 1, userSteps: 1 });
  });
  it("uninitialized actor B gets today/day projections but no rows; unpublished and missing day are 404", async () => {
    const today = await get("today", fixture.b);
    expect(today.status).toBe(200);
    expect((await today.json()).data).toMatchObject({
      scheduleId: fixture.today,
      userStatus: "NOT_STARTED",
      stepsSummary: { total: 2, completed: 0 },
    });
    const day = await get("day?scheduleId=" + fixture.today + "&createIfMissing=false", fixture.b);
    expect(day.status).toBe(200);
    const dj = await day.json();
    expect(dj.data.userStatus).toBe("NOT_STARTED");
    expect(dj.data.steps.map((s: { status: string }) => s.status)).toEqual([
      "NOT_STARTED",
      "NOT_STARTED",
    ]);
    for (const schedule of [fixture.yesterday, fixture.tomorrow, "fictional-missing-schedule"]) {
      const r = await get("day?scheduleId=" + schedule + "&createIfMissing=false");
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({
        success: false,
        error: "Курс дня не найден",
        code: "NOT_FOUND",
      });
    }
    const invalid = await get("day?createIfMissing=false");
    expect(invalid.status).toBe(400);
    expect(await readCounts()).toEqual({ trainings: 1, userSteps: 1 });
  });
  it("in-process GETs cause no writes or cache publication", async () => {
    expect(await prisma.dailyCourseUserTraining.count()).toBe(1);
    expect(await prisma.dailyCourseUserStep.count()).toBe(1);
    expect(await prisma.dailyCourseSchedule.count()).toBe(3);
    expect(await prisma.dailyCourseBundleStep.count()).toBe(2);
    expect(cacheCalls.invalidate).not.toHaveBeenCalled();
    expect(cacheCalls.publish).not.toHaveBeenCalled();
  });
});
