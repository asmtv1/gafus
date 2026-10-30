/** AG1-001/TR014: registered four Hono GETs -> existing Core/Prisma PG18 -> frozen JSON. */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";

// Original dailyCourse service imports WRITE-side cache/revision helpers on this GET path.
// Fail-closed only these unused ports; target Core/Prisma/Hono are NEVER mocked.
const forbidden = vi.hoisted(() => ({
  invalidate: vi.fn(() => {
    throw Error("UNUSED_DAILY_WRITE_CACHE_FORBIDDEN");
  }),
  publish: vi.fn(() => {
    throw Error("UNUSED_DAILY_WRITE_PUBLISH_FORBIDDEN");
  }),
}));
vi.mock("../../../../../packages/core/src/services/training/trainingDayContent", () => ({
  invalidateStepsContentCache: forbidden.invalidate,
}));
vi.mock("../../../../../packages/core/src/services/training/trainingContentRevision", () => ({
  publishCourseContentChange: forbidden.publish,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
import { trainerDailyBundlesRoutes } from "./trainer-daily-bundles";

const database = "gafus_refactor_tr014_hono_four_ag1_20261024";
const directory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_tr014_hono_four_sql_20261024";
const prefix = "ag1_tr014_hono_realpg_20261024_";
const id = (suffix: string) => prefix + suffix;
const f = {
  a: id("trainer_a"),
  b: id("trainer_b"),
  empty: id("trainer_empty"),
  aTrain: id("step_a_train"),
  aExam: id("step_a_exam"),
  aForbidden: id("step_a_forbidden"),
  aNonDaily: id("step_a_not_daily"),
  bPractice: id("step_b_practice"),
  bTheory: id("step_b_theory"),
  aValid: id("bundle_a_valid"),
  aShort: id("bundle_a_one_link"),
  bValid: id("bundle_b_valid"),
  aLinkTrain: id("link_a_training"),
  aLinkExam: id("link_a_exam"),
  aLinkShort: id("link_a_short"),
  bLinkPractice: id("link_b_practice"),
  bLinkTheory: id("link_b_theory"),
  outsideA: id("schedule_a_outside"),
  firstA: id("schedule_a_first"),
  nextA: id("schedule_a_next"),
  insideB: id("schedule_b_inside"),
};
const users = [f.a, f.b, f.empty];
const steps = [f.aTrain, f.aExam, f.aForbidden, f.aNonDaily, f.bPractice, f.bTheory];
const bundles = [f.aValid, f.aShort, f.bValid];
const links = [f.aLinkTrain, f.aLinkExam, f.aLinkShort, f.bLinkPractice, f.bLinkTheory];
const schedules = [f.outsideA, f.firstA, f.nextA, f.insideB];
const stamp = (date: string) => new Date(`${date}T00:00:00.000Z`);
const ownerA = { id: f.a, role: "TRAINER" };
const ownerB = { id: f.b, role: "TRAINER" };
const ownerEmpty = { id: f.empty, role: "TRAINER" };
const admin = { id: f.empty, role: "ADMIN" };
const moderator = { id: f.empty, role: "MODERATOR" };
const unexpected = "FICTIONAL_SECRET_STEP_OR_BUNDLE_MEDIA_MUST_NOT_EXPOSE";
let seeded = false;

async function assertOwnedDB() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_TR014_HONO_OWN_PG18).toBe("1");
  expect([
    url.protocol,
    url.hostname,
    url.port,
    url.pathname,
    url.searchParams.get("host"),
    url.searchParams.get("application_name"),
    url.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, appTag, ""]);
  const rows = await prisma.$queryRaw<
    {
      db: boolean;
      version: boolean;
      dir: boolean;
      unix: boolean;
      socket: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${directory} AS dir,
      current_setting('listen_addresses')='' AS unix,
      current_setting('unix_socket_directories')=${socket} AS socket,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
          OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(rows).toEqual([
    { db: true, version: true, dir: true, unix: true, socket: true, outsiders: 0n },
  ]);
}

beforeAll(async () => {
  await assertOwnedDB();
  const initial = await prisma.$queryRaw<
    { u: bigint; s: bigint; b: bigint; c: bigint; m: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS u,
      (SELECT count(*) FROM public."Step") AS s,
      (SELECT count(*) FROM public."DailyCourseBundle") AS b,
      (SELECT count(*) FROM public."DailyCourseSchedule") AS c,
      (SELECT count(*) FROM public._prisma_migrations) AS m
  `;
  expect(initial).toEqual([{ u: 0n, s: 0n, b: 0n, c: 0n, m: 0n }]);
  seeded = true;
  await prisma.user.createMany({
    data: users.map((u) => ({ id: u, username: u, password: "fictional-only" })),
  });
  await prisma.step.createMany({
    data: [
      {
        id: f.aTrain,
        title: "A training",
        type: "TRAINING",
        authorId: f.a,
        isDailyCourse: true,
        durationSec: 90,
        updatedAt: stamp("2026-10-20"),
        description: unexpected,
      },
      {
        id: f.aExam,
        title: "A exam",
        type: "EXAMINATION",
        authorId: f.a,
        isDailyCourse: true,
        hasTestQuestions: true,
        requiresWrittenFeedback: true,
        durationSec: null,
        updatedAt: stamp("2026-10-24"),
      },
      {
        id: f.aForbidden,
        title: "A ineligible reporting",
        type: "TRAINING",
        authorId: f.a,
        isDailyCourse: true,
        requiresWrittenFeedback: true,
        updatedAt: stamp("2026-10-25"),
      },
      {
        id: f.aNonDaily,
        title: "A not daily",
        type: "TRAINING",
        authorId: f.a,
        isDailyCourse: false,
        updatedAt: stamp("2026-10-26"),
      },
      {
        id: f.bPractice,
        title: "B practice",
        type: "PRACTICE",
        authorId: f.b,
        isDailyCourse: true,
        durationSec: null,
        updatedAt: stamp("2026-10-22"),
      },
      {
        id: f.bTheory,
        title: "B theory",
        type: "THEORY",
        authorId: f.b,
        isDailyCourse: true,
        durationSec: 45,
        updatedAt: stamp("2026-10-21"),
      },
    ],
  });
  await prisma.dailyCourseBundle.createMany({
    data: [
      {
        id: f.aValid,
        title: "A eligible bundle",
        type: "daily",
        authorId: f.a,
        equipment: "Harness",
        description: "Fictional A description",
        updatedAt: stamp("2026-10-21"),
      },
      {
        id: f.aShort,
        title: "A one-step bundle",
        type: "daily",
        authorId: f.a,
        equipment: "",
        description: "",
        updatedAt: stamp("2026-10-23"),
      },
      {
        id: f.bValid,
        title: "B eligible bundle",
        type: "daily",
        authorId: f.b,
        equipment: "",
        description: "",
        updatedAt: stamp("2026-10-22"),
      },
    ],
  });
  await prisma.dailyCourseBundleStep.createMany({
    data: [
      { id: f.aLinkExam, bundleId: f.aValid, stepId: f.aExam, order: 1 },
      { id: f.aLinkTrain, bundleId: f.aValid, stepId: f.aTrain, order: 0 },
      { id: f.aLinkShort, bundleId: f.aShort, stepId: f.aTrain, order: 0 },
      { id: f.bLinkPractice, bundleId: f.bValid, stepId: f.bPractice, order: 0 },
      { id: f.bLinkTheory, bundleId: f.bValid, stepId: f.bTheory, order: 1 },
    ],
  });
  await prisma.dailyCourseSchedule.createMany({
    data: [
      {
        id: f.outsideA,
        bundleId: f.aValid,
        createdById: f.a,
        date: stamp("2026-10-19"),
        isPublished: false,
      },
      {
        id: f.firstA,
        bundleId: f.aShort,
        createdById: f.a,
        date: stamp("2026-10-20"),
        isPublished: true,
      },
      {
        id: f.nextA,
        bundleId: f.aValid,
        createdById: f.a,
        date: stamp("2026-10-22"),
        isPublished: false,
      },
      {
        id: f.insideB,
        bundleId: f.bValid,
        createdById: f.b,
        date: stamp("2026-10-21"),
        isPublished: true,
      },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await assertOwnedDB();
    if (seeded) {
      await prisma.dailyCourseSchedule.deleteMany({ where: { id: { in: schedules } } });
      await prisma.dailyCourseBundleStep.deleteMany({ where: { id: { in: links } } });
      await prisma.dailyCourseBundle.deleteMany({ where: { id: { in: bundles } } });
      await prisma.step.deleteMany({ where: { id: { in: steps } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    const remaining = await prisma.$queryRaw<
      { u: bigint; s: bigint; b: bigint; l: bigint; c: bigint; m: bigint }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS u,
      (SELECT count(*) FROM public."Step") AS s,
      (SELECT count(*) FROM public."DailyCourseBundle") AS b,
      (SELECT count(*) FROM public."DailyCourseBundleStep") AS l,
      (SELECT count(*) FROM public."DailyCourseSchedule") AS c,
      (SELECT count(*) FROM public._prisma_migrations) AS m
    `;
    expect(remaining).toEqual([{ u: 0n, s: 0n, b: 0n, l: 0n, c: 0n, m: 0n }]);
    expect(forbidden.invalidate).not.toHaveBeenCalled();
    expect(forbidden.publish).not.toHaveBeenCalled();
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

const app = new Hono();
app.use("/api/v1/trainer/daily-course/*", async (c, next) => {
  // Fixture-only actor seam, not real auth, JWT, middleware or a network listener.
  const incoming = c.req.header("x-own-test-role");
  const role =
    incoming === "TRAINER" ||
    incoming === "ADMIN" ||
    incoming === "MODERATOR" ||
    incoming === "USER"
      ? incoming
      : "TRAINER";
  c.set("user", { id: c.req.header("x-own-test-actor") ?? f.a, role, username: "fictional" });
  await next();
});
app.route("/api/v1/trainer/daily-course", trainerDailyBundlesRoutes);
type Actor = { id: string; role: string };
const get = (path: string, actor: Actor = ownerA) =>
  app.request("/api/v1/trainer/daily-course/" + path, {
    headers: { "x-own-test-actor": actor.id, "x-own-test-role": actor.role },
  });
const exact = (o: Record<string, unknown>, fields: string[]) =>
  expect(Object.keys(o).sort()).toEqual([...fields].sort());
const bundleKeys = [
  "id",
  "title",
  "type",
  "stepsCount",
  "authorId",
  "authorUsername",
  "equipment",
  "description",
  "steps",
];
const stepKeys = ["id", "title", "type", "durationSec", "authorId", "authorUsername"];
const candidateKeys = ["id", "title", "type", "stepsCount", "authorId", "authorUsername"];
const scheduleKeys = ["id", "date", "isPublished", "bundle", "createdBy"];

describe("TR014 registered four daily GET JSON via original Core & real PG18", () => {
  it("/bundles returns joined ordered steps and the nine-key canonical wire", async () => {
    const r = await get("bundles");
    expect(r.status).toBe(200);
    const body = await r.json();
    exact(body, ["success", "data"]);
    expect(body.success).toBe(true);
    expect(body.data.map((x: { id: string }) => x.id)).toEqual([f.aShort, f.aValid]);
    for (const bundle of body.data) {
      exact(bundle, bundleKeys);
      expect(bundle.stepsCount).toBe(bundle.steps.length);
      for (const step of bundle.steps) exact(step, ["id", "title", "type", "order"]);
    }
    expect(body.data[1].steps.map((x: { id: string }) => x.id)).toEqual([f.aTrain, f.aExam]);
    expect(body.data[1].steps.map((x: { order: number }) => x.order)).toEqual([0, 1]);
    expect(JSON.stringify(body)).not.toContain(unexpected);
    expect(
      (await (await get("bundles", ownerB)).json()).data.map((x: { id: string }) => x.id),
    ).toEqual([f.bValid]);
    expect(await (await get("bundles", ownerEmpty)).json()).toEqual({ success: true, data: [] });
  });
  it("/bundle-step-candidates and /candidates preserve eligibility, null duration & strict projection", async () => {
    const r = await get("bundle-step-candidates");
    expect(r.status).toBe(200);
    const steps = (await r.json()).data;
    expect(steps.map((x: { id: string }) => x.id)).toEqual([f.aExam, f.aTrain]);
    expect(steps.map((x: { durationSec: number | null }) => x.durationSec)).toEqual([null, 90]);
    for (const x of steps) exact(x, stepKeys);
    const c = await get("candidates");
    expect(c.status).toBe(200);
    const bundles = (await c.json()).data;
    expect(bundles.map((x: { id: string }) => x.id)).toEqual([f.aValid]);
    exact(bundles[0], candidateKeys);
    expect(bundles[0]).toMatchObject({ stepsCount: 2, authorId: f.a });
    expect(await (await get("bundle-step-candidates", ownerEmpty)).json()).toEqual({
      success: true,
      data: [],
    });
    expect(await (await get("candidates", ownerEmpty)).json()).toEqual({ success: true, data: [] });
    expect(
      (await (await get("candidates", admin)).json()).data.map((x: { id: string }) => x.id),
    ).toEqual([f.bValid, f.aValid]);
  });
  it("/schedule-range returns UTC date strings and existing nested whitelist, inclusive/empty", async () => {
    const path = "schedule-range?from=2026-10-20&to=2026-10-22";
    const r = await get(path);
    expect(r.status).toBe(200);
    const body = await r.json();
    exact(body, ["success", "data"]);
    expect(body.data.map((x: { date: string }) => x.date)).toEqual(["2026-10-20", "2026-10-22"]);
    expect(body.data.map((x: { isPublished: boolean }) => x.isPublished)).toEqual([true, false]);
    for (const row of body.data) {
      exact(row, scheduleKeys);
      exact(row.bundle, ["id", "title", "type", "stepsCount"]);
      exact(row.createdBy, ["id", "username"]);
      expect(row.date).toMatch(/^2026-10-[0-9]{2}$/);
    }
    expect(body.data.map((x: { bundle: { stepsCount: number } }) => x.bundle.stepsCount)).toEqual([
      1, 2,
    ]);
    expect(
      (await (await get(path, ownerB)).json()).data.map((x: { date: string }) => x.date),
    ).toEqual(["2026-10-21"]);
    expect(
      (await (await get(path, admin)).json()).data.map((x: { date: string }) => x.date),
    ).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
    expect(await (await get("schedule-range?from=2026-11-01&to=2026-11-03")).json()).toEqual({
      success: true,
      data: [],
    });
    // Existing dailyCourseRangeSchema checks YYYY-MM-DD syntax, not from<=to.
    // Original Core returns empty on reversed range; preserve 200/[] behavior.
    const reversed = await get("schedule-range?from=2026-10-22&to=2026-10-20");
    expect(reversed.status).toBe(200);
    expect(await reversed.json()).toEqual({ success: true, data: [] });
    expect((await get(path, moderator)).status).toBe(200);
  });
  it("registered invalid/missing/range query 400 and nonstaff 403, no writes", async () => {
    for (const path of [
      "bundles?x=1",
      "bundle-step-candidates?x=1",
      "candidates?x=1",
      "schedule-range?from=2026-10-20",
      "schedule-range?from=2026/10/22&to=2026-10-20",
      "schedule-range?from=2026-10-20&to=2026-10-22&extra=1",
    ]) {
      const r = await get(path);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({
        success: false,
        code: "BAD_QUERY",
        error: "Некорректный запрос",
      });
    }
    const user = { id: f.a, role: "USER" };
    for (const path of [
      "bundles",
      "bundle-step-candidates",
      "candidates",
      "schedule-range?from=2026-10-20&to=2026-10-22",
    ]) {
      const r = await get(path, user);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({
        success: false,
        code: "FORBIDDEN",
        error: "Недостаточно прав",
      });
    }
    expect(await prisma.dailyCourseBundle.count()).toBe(bundles.length);
    expect(await prisma.dailyCourseBundleStep.count()).toBe(links.length);
    expect(await prisma.dailyCourseSchedule.count()).toBe(schedules.length);
    expect(forbidden.invalidate).not.toHaveBeenCalled();
    expect(forbidden.publish).not.toHaveBeenCalled();
  });
});
