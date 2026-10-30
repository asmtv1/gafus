/** LEARN032: real Prisma + private PostgreSQL18 Survey READ, NO submit. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { createReadSurveysApplication } from "../../../../../apps/api/src/modules/surveys/application/read-surveys";
import { getSurveyComparison, getSurveyResponse, getSurveyTemplate } from "./surveyService";

const forbidden = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("NO_TRAINER_SIDE_EFFECT");
  }),
);
vi.mock("../trainerCourse/courseVersionService", () => ({ setCourseLogoVersioned: forbidden }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
}));
const database = "gafus_refactor_survey_comparison_ag1_20261024";
const dataDir =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_survey_comparison_20261024";
const id = (suffix: string) => `ag1_survey_comp_20261024_${suffix}`;
const user = { trainer: id("trainer"), a: id("a"), b: id("b") };
const course = { first: id("course1"), second: id("course2") };
const steps = {
  i0: id("initial_0"),
  i1: id("initial_1"),
  f0: id("final_0"),
  f1: id("final_1"),
  oi: id("other_initial"),
  of: id("other_final"),
  ci: id("course2_initial"),
  cf: id("course2_final"),
};
const users = Object.values(user),
  courses = Object.values(course),
  stepIds = Object.values(steps);
const family = "dog-home-alone",
  otherFamily = "synthetic-other-family";
const now = new Date("2026-10-24T12:00:00.000Z");
const app = createReadSurveysApplication({
  comparison: getSurveyComparison,
  response: getSurveyResponse,
  template: getSurveyTemplate,
});
let seeded = false;

async function guard() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_SURVEY_COMPARISON_PG18).toBe("1");
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
      dir: boolean;
      noTcp: boolean;
      sock: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${dataDir} AS dir,
      current_setting('listen_addresses')='' AS "noTcp",
      current_setting('unix_socket_directories')=${socket} AS sock,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
          OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(rows).toEqual([
    { db: true, version: true, dir: true, noTcp: true, sock: true, outsiders: 0n },
  ]);
}
type Seed = {
  key: string;
  owner: string;
  courseId: string;
  stepId: string;
  familySlug: string;
  phase: "INITIAL" | "FINAL";
  answers: Record<string, unknown>;
  at: string;
};
const record = (
  key: string,
  owner: string,
  courseId: string,
  stepId: string,
  familySlug: string,
  phase: "INITIAL" | "FINAL",
  answers: Record<string, unknown>,
  at: string,
): Seed => ({ key, owner, courseId, stepId, familySlug, phase, answers, at });
async function insert(rows: Seed[]) {
  await prisma.surveyResponse.createMany({
    data: rows.map((x) => ({
      id: id(x.key),
      userId: x.owner,
      courseId: x.courseId,
      stepId: x.stepId,
      surveySlug: x.phase === "INITIAL" ? "dog-home-alone-initial" : "dog-home-alone-final",
      surveyFamilySlug: x.familySlug,
      phase: x.phase,
      surveyVersion: 1,
      answers: x.answers as Record<string, string | number | boolean | null | string[]>,
      submittedAt: new Date(x.at),
    })),
  });
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  await guard();
  const empty = await prisma.$queryRaw<
    { users: bigint; courses: bigint; steps: bigint; responses: bigint; ledger: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."Course") AS courses,
      (SELECT count(*) FROM public."Step") AS steps,
      (SELECT count(*) FROM public."SurveyResponse") AS responses,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger
  `;
  expect(empty).toEqual([{ users: 0n, courses: 0n, steps: 0n, responses: 0n, ledger: 0n }]);
  await prisma.user.createMany({
    data: users.map((u) => ({ id: u, username: u, password: "fiction-only" })),
  });
  seeded = true;
  // Production-shaped archive lacks Course.version; only actual columns, fixture-only.
  for (const [index, cid] of courses.entries()) {
    await prisma.$executeRaw`
      INSERT INTO public."Course" ("id","name","type","trainingLevel",
       "duration","logoImg","authorId","updatedAt") VALUES
      (${cid},${`Synthetic comparison ${index}`},${`ag1_survey_comp_${index}`},
       'BEGINNER'::"TrainingLevel",'10 min','fiction-only',${user.trainer},CURRENT_TIMESTAMP)
    `;
  }
  await prisma.step.createMany({
    data: stepIds.map((sid, i) => ({
      id: sid,
      authorId: user.trainer,
      title: `Synthetic questionnaire ${i}`,
      type: "SURVEY",
      surveySlug: [0, 1, 4, 6].includes(i) ? "dog-home-alone-initial" : "dog-home-alone-final",
    })),
  });
}, 45000);

beforeEach(async () => {
  await guard();
  vi.setSystemTime(now);
  expect(await prisma.surveyResponse.count()).toBe(0);
});
afterEach(async () => {
  await guard();
  await prisma.surveyResponse.deleteMany({
    where: { userId: { in: [user.a, user.b] }, courseId: { in: courses } },
  });
  vi.setSystemTime(now);
});
afterAll(async () => {
  try {
    await guard();
    if (seeded) {
      await prisma.surveyResponse.deleteMany({
        where: { userId: { in: [user.a, user.b] }, courseId: { in: courses } },
      });
      await prisma.step.deleteMany({ where: { id: { in: stepIds } } });
      for (const cid of courses)
        await prisma.$executeRaw`DELETE FROM public."Course" WHERE "id"=${cid}`;
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    const empty = await prisma.$queryRaw<
      { users: bigint; courses: bigint; steps: bigint; responses: bigint; ledger: bigint }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."Course") AS courses,
        (SELECT count(*) FROM public."Step") AS steps,
        (SELECT count(*) FROM public."SurveyResponse") AS responses,
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `;
    expect(empty).toEqual([{ users: 0n, courses: 0n, steps: 0n, responses: 0n, ledger: 0n }]);
  } finally {
    await prisma.$disconnect();
    vi.useRealTimers();
  }
}, 45000);

describe("original Survey BEFORE/AFTER and response real Core+Prisma PG18", () => {
  it("empty, initial-only and final-only cannot produce comparison", async () => {
    expect(await app.getComparison(user.a, course.first, family)).toBeNull();
    expect(await app.getResponse(user.a, steps.i0)).toBeNull();
    await insert([
      record(
        "initialOnly",
        user.a,
        course.first,
        steps.i0,
        family,
        "INITIAL",
        { concern: "fiction" },
        "2026-10-20T09:00:00Z",
      ),
    ]);
    expect(await app.getComparison(user.a, course.first, family)).toBeNull();
    await prisma.surveyResponse.delete({ where: { id: id("initialOnly") } });
    await insert([
      record(
        "finalOnly",
        user.a,
        course.first,
        steps.f0,
        family,
        "FINAL",
        { concern: "fiction" },
        "2026-10-21T09:00:00Z",
      ),
    ]);
    expect(await app.getComparison(user.a, course.first, family)).toBeNull();
    expect(await prisma.surveyResponse.count()).toBe(1);
    expect(forbidden).not.toHaveBeenCalled();
  });
  it("pair projects scalar, boolean, ordered array, null and missing through JSON", async () => {
    const before = {
      scalar: "short",
      bool: false,
      array: ["a", "b"],
      sameNull: null,
      onlyBefore: "old",
      nullVsMissing: null,
      sameNumber: 3,
    };
    const after = {
      scalar: "long",
      bool: true,
      array: ["b", "a"],
      sameNull: null,
      onlyAfter: "new",
      sameNumber: 3,
    };
    await insert([
      record(
        "pairFinal",
        user.a,
        course.first,
        steps.f0,
        family,
        "FINAL",
        after,
        "2026-10-23T11:00:00Z",
      ),
      record(
        "pairInitial",
        user.a,
        course.first,
        steps.i0,
        family,
        "INITIAL",
        before,
        "2026-10-20T09:00:00Z",
      ),
    ]);
    const actual = await app.getComparison(user.a, course.first, family);
    expect(actual?.familySlug).toBe(family);
    expect(actual?.initialSubmittedAt).toBe("2026-10-20T09:00:00.000Z");
    expect(actual?.finalSubmittedAt).toBe("2026-10-23T11:00:00.000Z");
    const byId = Object.fromEntries(actual?.items.map((item) => [item.questionId, item]) ?? []);
    expect(Object.keys(byId).sort()).toEqual(Object.keys({ ...before, ...after }).sort());
    expect(byId.scalar).toEqual({
      questionId: "scalar",
      before: "short",
      after: "long",
      changed: true,
    });
    expect(byId.bool).toEqual({ questionId: "bool", before: false, after: true, changed: true });
    expect(byId.array).toEqual({
      questionId: "array",
      before: ["a", "b"],
      after: ["b", "a"],
      changed: true,
    });
    expect(byId.sameNull).toEqual({
      questionId: "sameNull",
      before: null,
      after: null,
      changed: false,
    });
    expect(byId.onlyBefore).toEqual({
      questionId: "onlyBefore",
      before: "old",
      after: null,
      changed: true,
    });
    expect(byId.onlyAfter).toEqual({
      questionId: "onlyAfter",
      before: null,
      after: "new",
      changed: true,
    });
    expect(byId.nullVsMissing).toEqual({
      questionId: "nullVsMissing",
      before: null,
      after: null,
      changed: false,
    });
    expect(byId.sameNumber).toEqual({
      questionId: "sameNumber",
      before: 3,
      after: 3,
      changed: false,
    });
    expect(JSON.parse(JSON.stringify(actual))).toEqual(actual);
    expect(await prisma.surveyResponse.count()).toBe(2);
  });
  it("picks first submitted INITIAL and first FINAL even when inserted last", async () => {
    await insert([
      record(
        "lateFinal",
        user.a,
        course.first,
        steps.f1,
        family,
        "FINAL",
        { choice: "late final" },
        "2026-10-23T11:00:00Z",
      ),
      record(
        "lateInitial",
        user.a,
        course.first,
        steps.i1,
        family,
        "INITIAL",
        { choice: "late initial" },
        "2026-10-21T11:00:00Z",
      ),
      record(
        "earlyFinal",
        user.a,
        course.first,
        steps.f0,
        family,
        "FINAL",
        { choice: "early final" },
        "2026-10-22T11:00:00Z",
      ),
      record(
        "earlyInitial",
        user.a,
        course.first,
        steps.i0,
        family,
        "INITIAL",
        { choice: "early initial" },
        "2026-10-20T11:00:00Z",
      ),
    ]);
    expect(await app.getComparison(user.a, course.first, family)).toEqual({
      familySlug: family,
      initialSubmittedAt: "2026-10-20T11:00:00.000Z",
      finalSubmittedAt: "2026-10-22T11:00:00.000Z",
      items: [
        { questionId: "choice", before: "early initial", after: "early final", changed: true },
      ],
    });
  });
  it("exact user/course/family filter isolates comparisons and response owner", async () => {
    await insert([
      record(
        "aInitial",
        user.a,
        course.first,
        steps.i0,
        family,
        "INITIAL",
        { who: "A" },
        "2026-10-20T09:00:00Z",
      ),
      record(
        "aFinal",
        user.a,
        course.first,
        steps.f0,
        family,
        "FINAL",
        { who: "A after" },
        "2026-10-21T09:00:00Z",
      ),
      record(
        "bInitial",
        user.b,
        course.first,
        steps.i0,
        family,
        "INITIAL",
        { who: "B" },
        "2026-10-20T08:00:00Z",
      ),
      record(
        "bFinal",
        user.b,
        course.first,
        steps.f0,
        family,
        "FINAL",
        { who: "B after" },
        "2026-10-21T08:00:00Z",
      ),
      record(
        "otherInitial",
        user.a,
        course.first,
        steps.oi,
        otherFamily,
        "INITIAL",
        { who: "other family" },
        "2026-10-19T07:00:00Z",
      ),
      record(
        "otherFinal",
        user.a,
        course.first,
        steps.of,
        otherFamily,
        "FINAL",
        { who: "other family after" },
        "2026-10-21T07:00:00Z",
      ),
      record(
        "course2Initial",
        user.a,
        course.second,
        steps.ci,
        family,
        "INITIAL",
        { who: "other course" },
        "2026-10-18T07:00:00Z",
      ),
      record(
        "course2Final",
        user.a,
        course.second,
        steps.cf,
        family,
        "FINAL",
        { who: "other course after" },
        "2026-10-21T06:00:00Z",
      ),
    ]);
    const a = await app.getComparison(user.a, course.first, family);
    const b = await app.getComparison(user.b, course.first, family);
    const other = await app.getComparison(user.a, course.first, otherFamily);
    const second = await app.getComparison(user.a, course.second, family);
    expect(a?.items).toEqual([{ questionId: "who", before: "A", after: "A after", changed: true }]);
    expect(b?.items).toEqual([{ questionId: "who", before: "B", after: "B after", changed: true }]);
    expect(other?.items).toEqual([
      { questionId: "who", before: "other family", after: "other family after", changed: true },
    ]);
    expect(second?.items).toEqual([
      { questionId: "who", before: "other course", after: "other course after", changed: true },
    ]);
    expect(await app.getComparison(user.b, course.second, family)).toBeNull();
    expect(await app.getComparison(user.b, course.first, otherFamily)).toBeNull();
    const own = await app.getResponse(user.a, steps.i0);
    const different = await app.getResponse(user.b, steps.i0);
    expect(own?.id).toBe(id("aInitial"));
    expect(own?.answers).toEqual({ who: "A" });
    expect(different?.id).toBe(id("bInitial"));
    expect(different?.answers).toEqual({ who: "B" });
    expect(await app.getResponse(user.b, steps.oi)).toBeNull();
    expect(await app.getResponse(user.a, steps.i1)).toBeNull();
    expect(await prisma.surveyResponse.count()).toBe(8);
  });
  it("response DTO exact 24h inclusive boundary and ISO JSON; original template lookup", async () => {
    const submittedAt = "2026-10-23T12:00:00.000Z";
    await insert([
      record(
        "window",
        user.a,
        course.first,
        steps.i0,
        family,
        "INITIAL",
        { flag: true, options: ["fiction-only"] },
        submittedAt,
      ),
    ]);
    expect(app.getTemplate("dog-home-alone-initial")).toMatchObject({
      slug: "dog-home-alone-initial",
      familySlug: family,
      phase: "INITIAL",
      version: 1,
    });
    expect(app.getTemplate("unknown-fictional-slug")).toBeNull();
    const original = await app.getResponse(user.a, steps.i0);
    expect(original).toEqual({
      id: id("window"),
      userId: user.a,
      courseId: course.first,
      stepId: steps.i0,
      petId: null,
      surveySlug: "dog-home-alone-initial",
      surveyFamilySlug: family,
      phase: "INITIAL",
      surveyVersion: 1,
      answers: { flag: true, options: ["fiction-only"] },
      submittedAt,
      editableUntil: "2026-10-24T12:00:00.000Z",
      canEdit: true,
    });
    expect(JSON.parse(JSON.stringify(original))).toEqual(original);
    vi.setSystemTime(new Date("2026-10-24T12:00:00.001Z"));
    expect(await app.getResponse(user.a, steps.i0)).toMatchObject({
      id: id("window"),
      canEdit: false,
      editableUntil: "2026-10-24T12:00:00.000Z",
    });
    expect(await prisma.surveyResponse.count()).toBe(1);
  });
});
