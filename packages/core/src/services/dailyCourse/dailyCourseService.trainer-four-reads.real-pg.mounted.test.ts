/** AG1-001/TR014: four existing Trainer Daily READs through original Core + real owned PG18. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { readTrainerDailyApplication } from "../../../../../apps/api/src/modules/trainer-daily/composition/read-trainer-daily";

// Existing dailyCourseService imports write-side invalidation, but no READ may invoke it.
const forbidden = vi.hoisted(() => ({
  invalidate: vi.fn(() => {
    throw Error("WRITE_CACHE_INVALIDATION_FORBIDDEN");
  }),
  publish: vi.fn(() => {
    throw Error("WRITE_REVISION_PUBLICATION_FORBIDDEN");
  }),
}));
vi.mock("../training/trainingDayContent", () => ({
  invalidateStepsContentCache: forbidden.invalidate,
}));
vi.mock("../training/trainingContentRevision", () => ({
  publishCourseContentChange: forbidden.publish,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));

const database = "gafus_refactor_tr014_four_read_ag1_20261024";
const directory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_tr014_four_read_sql_20261024";
const prefix = "ag1_tr014_four_realpg_20261024_";
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
  expect(process.env.AG1_TR014_FOUR_OWN_PG18).toBe("1");
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
const expectKeys = (v: Record<string, unknown>, keys: string[]) =>
  expect(Object.keys(v).sort()).toEqual([...keys].sort());

describe("AG1 TR014 four actual Trainer Daily Core reads on separate PG18", () => {
  it("bundles: trainer scope, elevated global, updatedAt desc and nested order + safe whitelist", async () => {
    const a = await readTrainerDailyApplication.bundles(ownerA);
    expect(a.map((x) => x.id)).toEqual([f.aShort, f.aValid]);
    expect((await readTrainerDailyApplication.bundles(ownerB)).map((x) => x.id)).toEqual([
      f.bValid,
    ]);
    expect(await readTrainerDailyApplication.bundles(ownerEmpty)).toEqual([]);
    expect((await readTrainerDailyApplication.bundles(admin)).map((x) => x.id)).toEqual([
      f.aShort,
      f.bValid,
      f.aValid,
    ]);
    expect(await readTrainerDailyApplication.bundles(moderator)).toHaveLength(3);
    expect(a[1]?.steps.map((s) => s.id)).toEqual([f.aTrain, f.aExam]);
    expect(a[1]?.steps.map((s) => s.order)).toEqual([0, 1]);
    expect(a[0]).toMatchObject({ stepsCount: 1, equipment: "", description: "" });
    for (const x of a) {
      expectKeys(x, bundleKeys);
      expect(x.stepsCount).toBe(x.steps.length);
      for (const step of x.steps) expectKeys(step, ["id", "title", "type", "order"]);
      expect(JSON.stringify(x)).not.toContain(unexpected);
    }
  });
  it("bundle-step-candidates: only daily eligible steps, exam exception, nullable duration", async () => {
    const a = await readTrainerDailyApplication.bundleStepCandidates(ownerA);
    expect(a.map((x) => x.id)).toEqual([f.aExam, f.aTrain]);
    expect(a.map((x) => x.durationSec)).toEqual([null, 90]);
    expect(
      (await readTrainerDailyApplication.bundleStepCandidates(ownerB)).map((x) => x.id),
    ).toEqual([f.bPractice, f.bTheory]);
    expect(await readTrainerDailyApplication.bundleStepCandidates(ownerEmpty)).toEqual([]);
    expect(
      (await readTrainerDailyApplication.bundleStepCandidates(admin)).map((x) => x.id),
    ).toEqual([f.aExam, f.bPractice, f.bTheory, f.aTrain]);
    for (const x of a) {
      expectKeys(x, stepKeys);
      expect(JSON.stringify(x)).not.toContain(unexpected);
    }
  });
  it("calendar candidates: original validateDailyCourseStepLinks excludes one-step bundle", async () => {
    const a = await readTrainerDailyApplication.candidates(ownerA);
    expect(a.map((x) => x.id)).toEqual([f.aValid]);
    expect(a[0]?.stepsCount).toBe(2);
    expect((await readTrainerDailyApplication.candidates(ownerB)).map((x) => x.id)).toEqual([
      f.bValid,
    ]);
    expect(await readTrainerDailyApplication.candidates(ownerEmpty)).toEqual([]);
    expect((await readTrainerDailyApplication.candidates(admin)).map((x) => x.id)).toEqual([
      f.bValid,
      f.aValid,
    ]);
    for (const x of a) {
      expectKeys(x, candidateKeys);
      expect(JSON.stringify(x)).not.toContain(unexpected);
    }
  });
  it("schedule-range: inclusive UTC date keys, sorting, authors and unpublished rows", async () => {
    const range = { from: "2026-10-20", to: "2026-10-22" };
    const a = await readTrainerDailyApplication.scheduleRange(ownerA, range);
    expect(a.map((x) => x.id)).toEqual([f.firstA, f.nextA]);
    expect(a.map((x) => x.date)).toEqual(["2026-10-20", "2026-10-22"]);
    expect(a.map((x) => x.isPublished)).toEqual([true, false]);
    expect(a.map((x) => x.bundle.stepsCount)).toEqual([1, 2]);
    expect(a[0]?.createdBy).toEqual({ id: f.a, username: f.a });
    expect(
      (await readTrainerDailyApplication.scheduleRange(ownerB, range)).map((x) => x.id),
    ).toEqual([f.insideB]);
    expect(await readTrainerDailyApplication.scheduleRange(ownerEmpty, range)).toEqual([]);
    expect(
      (await readTrainerDailyApplication.scheduleRange(admin, range)).map((x) => x.id),
    ).toEqual([f.firstA, f.insideB, f.nextA]);
    expect(await readTrainerDailyApplication.scheduleRange(moderator, range)).toHaveLength(3);
    expect(
      await readTrainerDailyApplication.scheduleRange(admin, {
        from: "2026-11-01",
        to: "2026-11-03",
      }),
    ).toEqual([]);
    for (const x of a) {
      expectKeys(x, scheduleKeys);
      expectKeys(x.bundle, ["id", "title", "type", "stepsCount"]);
      expectKeys(x.createdBy, ["id", "username"]);
      expect(JSON.stringify(x)).not.toContain(unexpected);
    }
  });
});
