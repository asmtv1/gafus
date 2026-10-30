/** AG1-001: existing trainer getVisibleDays through composed read and real owned PG18. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { readVisibleDaysApplication } from "../../../../../apps/api/src/modules/trainer-days/composition/read-visible-days";

// Original service also imports write-side invalidators. They must never execute during READ.
const forbidden = vi.hoisted(() => ({
  invalidate: vi.fn(() => {
    throw Error("WRITE_INVALIDATION_FORBIDDEN");
  }),
  publish: vi.fn(() => {
    throw Error("WRITE_PUBLICATION_FORBIDDEN");
  }),
}));
vi.mock("../training/trainingDayContent", () => ({
  invalidateTrainingDaysContentCache: forbidden.invalidate,
}));
vi.mock("../training/trainingContentRevision", () => ({
  publishCourseContentChange: forbidden.publish,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));

const database = "gafus_refactor_visible_days_ag1_20261024";
const directory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_visible_days_sql_20261024";
const ns = "ag1_visible_days_pg18_20261024_";
const id = (part: string) => ns + part;
const f = {
  a: id("trainer_a"),
  b: id("trainer_b"),
  c: id("trainer_c"),
  empty: id("trainer_empty"),
  profileB: id("profile_b"),
  profileC: id("profile_c"),
  dayANew: id("day_a_new"),
  dayAOld: id("day_a_old"),
  dayB: id("day_b"),
  dayC: id("day_c"),
  stepA1: id("step_a_one"),
  stepA2: id("step_a_two"),
  stepB: id("step_b"),
  linkA1: id("link_a_one"),
  linkA2: id("link_a_two"),
  linkB: id("link_b"),
  courseAPublic: id("course_a_public"),
  courseAPrivate: id("course_a_private"),
  courseB: id("course_b"),
  dayLinkPublic: id("day_link_a_public"),
  dayLinkPrivate: id("day_link_a_private"),
  dayLinkB: id("day_link_b"),
};
const actors = [f.a, f.b, f.c, f.empty];
const days = [f.dayANew, f.dayAOld, f.dayB, f.dayC];
const steps = [f.stepA1, f.stepA2, f.stepB];
const stepLinks = [f.linkA1, f.linkA2, f.linkB];
const dayLinks = [f.dayLinkPublic, f.dayLinkPrivate, f.dayLinkB];
const stamp = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`);
const privateMarker = "FICTIONAL_PRIVATE_STEP_CONTENT_NOT_IN_DTO";
let seeded = false;

async function guard() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_VISIBLE_DAYS_OWN_PG18).toBe("1");
  expect([
    u.protocol,
    u.hostname,
    u.port,
    u.pathname,
    u.searchParams.get("host"),
    u.searchParams.get("application_name"),
    u.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, appTag, ""]);
  const result = await prisma.$queryRaw<
    {
      db: boolean;
      version: boolean;
      data: boolean;
      unix: boolean;
      sock: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${directory} AS data,
      current_setting('listen_addresses')='' AS unix,
      current_setting('unix_socket_directories')=${socket} AS sock,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
          OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(result).toEqual([
    { db: true, version: true, data: true, unix: true, sock: true, outsiders: 0n },
  ]);
}

beforeAll(async () => {
  await guard();
  expect(
    await prisma.$queryRaw<{ u: bigint; d: bigint; s: bigint; c: bigint; m: bigint }[]>`
    SELECT (SELECT count(*) FROM public."User") AS u,
      (SELECT count(*) FROM public."TrainingDay") AS d,
      (SELECT count(*) FROM public."Step") AS s,
      (SELECT count(*) FROM public."Course") AS c,
      (SELECT count(*) FROM public._prisma_migrations) AS m
  `,
  ).toEqual([{ u: 0n, d: 0n, s: 0n, c: 0n, m: 0n }]);
  seeded = true;
  await prisma.user.createMany({
    data: actors.map((user) => ({ id: user, username: user, password: "fictional-only" })),
  });
  await prisma.userProfile.createMany({
    data: [
      { id: f.profileB, userId: f.b, fullName: null, avatarUrl: "opaque-fictional://private" },
      { id: f.profileC, userId: f.c, fullName: "Fictional Trainer C" },
    ],
  });
  await prisma.trainingDay.createMany({
    data: [
      {
        id: f.dayANew,
        authorId: f.a,
        title: "A recent course day",
        equipment: "Harness",
        description: "A day info",
        type: "regular",
        showCoursePathExport: true,
        shareProgressAcrossCourses: true,
        createdAt: stamp(24),
        updatedAt: stamp(24),
      },
      {
        id: f.dayAOld,
        authorId: f.a,
        title: "A older unlinked day",
        createdAt: stamp(20),
        updatedAt: stamp(21),
      },
      {
        id: f.dayB,
        authorId: f.b,
        title: "B day",
        createdAt: stamp(23),
        updatedAt: stamp(23),
        showCoursePathExport: false,
        shareProgressAcrossCourses: false,
      },
      { id: f.dayC, authorId: f.c, title: "C day", createdAt: stamp(22), updatedAt: stamp(22) },
    ],
  });
  await prisma.step.createMany({
    data: [
      {
        id: f.stepA1,
        authorId: f.a,
        title: "A first step",
        type: "TRAINING",
        description: privateMarker,
      },
      { id: f.stepA2, authorId: f.a, title: "A second step", type: "PRACTICE" },
      { id: f.stepB, authorId: f.b, title: "B only step", type: "THEORY" },
    ],
  });
  // Source Core returns links by order, not insertion sequence.
  await prisma.stepOnDay.createMany({
    data: [
      { id: f.linkA2, dayId: f.dayANew, stepId: f.stepA2, order: 2 },
      { id: f.linkA1, dayId: f.dayANew, stepId: f.stepA1, order: 0 },
      { id: f.linkB, dayId: f.dayB, stepId: f.stepB, order: 0 },
    ],
  });
  // Archived production-shaped fixture lacks Course.version; use actual archived columns only.
  await prisma.$executeRaw`
    INSERT INTO public."Course" ("id","name","type","trainingLevel","duration", "logoImg","authorId","updatedAt","isPrivate","isPaid")
    VALUES
      (${f.courseAPublic},'A public free','visible_a_public','BEGINNER'::"TrainingLevel",'10 min','fictional',${f.a},CURRENT_TIMESTAMP,false,false),
      (${f.courseAPrivate},'A private paid','visible_a_private','BEGINNER'::"TrainingLevel",'15 min','fictional',${f.a},CURRENT_TIMESTAMP,true,true),
      (${f.courseB},'B public free','visible_b_public','BEGINNER'::"TrainingLevel",'20 min','fictional',${f.b},CURRENT_TIMESTAMP,false,false)
  `;
  await prisma.dayOnCourse.createMany({
    data: [
      { id: f.dayLinkPrivate, dayId: f.dayANew, courseId: f.courseAPrivate, order: 1 },
      { id: f.dayLinkPublic, dayId: f.dayANew, courseId: f.courseAPublic, order: 0 },
      { id: f.dayLinkB, dayId: f.dayB, courseId: f.courseB, order: 0 },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await guard();
    if (seeded) {
      await prisma.dayOnCourse.deleteMany({ where: { id: { in: dayLinks } } });
      await prisma.stepOnDay.deleteMany({ where: { id: { in: stepLinks } } });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE id IN (${f.courseAPublic},${f.courseAPrivate},${f.courseB})`;
      await prisma.step.deleteMany({ where: { id: { in: steps } } });
      await prisma.trainingDay.deleteMany({ where: { id: { in: days } } });
      await prisma.userProfile.deleteMany({ where: { id: { in: [f.profileB, f.profileC] } } });
      await prisma.user.deleteMany({ where: { id: { in: actors } } });
    }
    expect(
      await prisma.$queryRaw<
        { u: bigint; p: bigint; d: bigint; s: bigint; c: bigint; m: bigint }[]
      >`
      SELECT (SELECT count(*) FROM public."User") AS u,
        (SELECT count(*) FROM public."UserProfile") AS p,
        (SELECT count(*) FROM public."TrainingDay") AS d,
        (SELECT count(*) FROM public."Step") AS s,
        (SELECT count(*) FROM public."Course") AS c,
        (SELECT count(*) FROM public._prisma_migrations) AS m
    `,
    ).toEqual([{ u: 0n, p: 0n, d: 0n, s: 0n, c: 0n, m: 0n }]);
    expect(forbidden.invalidate).not.toHaveBeenCalled();
    expect(forbidden.publish).not.toHaveBeenCalled();
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

const read = (actorUserId: string, elevated = false) =>
  readVisibleDaysApplication.execute({ actorUserId, elevated });
const dayKeys = [
  "id",
  "title",
  "equipment",
  "description",
  "type",
  "authorId",
  "showCoursePathExport",
  "shareProgressAcrossCourses",
  "createdAt",
  "updatedAt",
  "author",
  "stepLinks",
  "dayLinks",
];
const keys = (row: Record<string, unknown>, expected: string[]) =>
  expect(Object.keys(row).sort()).toEqual([...expected].sort());

describe("AG1 original Trainer visible days Core Prisma SQL", () => {
  it("source author scope: A/B/C independent, empty owner empty, elevated all, createdAt DESC", async () => {
    const a = await read(f.a);
    expect(a.map((d) => d.id)).toEqual([f.dayANew, f.dayAOld]);
    expect((await read(f.b)).map((d) => d.id)).toEqual([f.dayB]);
    expect((await read(f.c)).map((d) => d.id)).toEqual([f.dayC]);
    expect(await read(f.empty)).toEqual([]);
    expect((await read(f.empty, true)).map((d) => d.id)).toEqual([
      f.dayANew,
      f.dayB,
      f.dayC,
      f.dayAOld,
    ]);
    expect(a[0]).toMatchObject({ showCoursePathExport: true, shareProgressAcrossCourses: true });
    expect(a[1]).toMatchObject({
      showCoursePathExport: false,
      shareProgressAcrossCourses: false,
      stepLinks: [],
      dayLinks: [],
    });
    for (const day of [...a, ...(await read(f.empty, true))]) {
      keys(day, dayKeys);
      expect(day.createdAt).toMatch(/^2026-10-\d{2}T10:00:00\.000Z$/);
      expect(day.updatedAt).toMatch(/^2026-10-\d{2}T10:00:00\.000Z$/);
      expect(JSON.stringify(day)).not.toContain(privateMarker);
      expect(JSON.stringify(day)).not.toContain("opaque-fictional");
    }
  });
  it("nullable author profile: absent profile, present/null fullName, populated fullName", async () => {
    expect((await read(f.a))[0]?.author).toEqual({ username: f.a, profile: null });
    expect((await read(f.b))[0]?.author).toEqual({ username: f.b, profile: { fullName: null } });
    expect((await read(f.c))[0]?.author).toEqual({
      username: f.c,
      profile: { fullName: "Fictional Trainer C" },
    });
    for (const day of await read(f.empty, true)) {
      keys(day.author, ["username", "profile"]);
      if (day.author.profile !== null) keys(day.author.profile, ["fullName"]);
    }
  });
  it("step and course join ordering and exact whitelists; private course not an author filter", async () => {
    const a = (await read(f.a))[0]!;
    expect(a.stepLinks.map((x) => x.id)).toEqual([f.linkA1, f.linkA2]);
    expect(a.stepLinks.map((x) => x.order)).toEqual([0, 2]);
    expect(a.stepLinks.map((x) => x.step.title)).toEqual(["A first step", "A second step"]);
    expect(a.dayLinks.map((x) => x.id)).toEqual([f.dayLinkPublic, f.dayLinkPrivate]);
    expect(a.dayLinks.map((x) => x.course.name)).toEqual(["A public free", "A private paid"]);
    for (const link of a.stepLinks) {
      keys(link, ["id", "order", "step"]);
      keys(link.step, ["id", "title"]);
    }
    for (const link of a.dayLinks) {
      keys(link, ["id", "order", "course"]);
      keys(link.course, ["id", "name"]);
    }
    const elevated = await read(f.empty, true);
    expect(elevated[1]?.stepLinks.map((x) => x.step.title)).toEqual(["B only step"]);
  });
  it("Core read does not mutate the fictional rows or access unused cache/publication", async () => {
    const before = await prisma.trainingDay.count();
    await read(f.a);
    await read(f.b);
    await read(f.empty, true);
    expect(await prisma.trainingDay.count()).toBe(before);
    expect(await prisma.stepOnDay.count()).toBe(stepLinks.length);
    expect(await prisma.dayOnCourse.count()).toBe(dayLinks.length);
    expect(forbidden.invalidate).not.toHaveBeenCalled();
    expect(forbidden.publish).not.toHaveBeenCalled();
  });
});
