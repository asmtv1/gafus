/** AG1-001/TR013: original composed Trainer visible-steps Core Prisma READ against owned PG18. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { readVisibleStepsApplication } from "../../../../../apps/api/src/modules/trainer-steps/composition/read-visible-steps";

// Original Core file also imports write-side publication. None may execute during READ.
const forbidden = vi.hoisted(() => ({
  invalidate: vi.fn(() => {
    throw Error("STEP_WRITE_INVALIDATION_FORBIDDEN");
  }),
  publish: vi.fn(() => {
    throw Error("STEP_WRITE_PUBLICATION_FORBIDDEN");
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

const database = "gafus_refactor_visible_steps_ag1_20261024";
const directory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_tr013_visible_steps_sql_20261024";
const p = "ag1_tr013_visible_steps_pg18_20261024_";
const id = (suffix: string) => p + suffix;
const f = {
  a: id("trainer_a"),
  b: id("trainer_b"),
  c: id("trainer_c"),
  empty: id("trainer_empty"),
  profileB: id("profile_b"),
  profileC: id("profile_c"),
  normalANew: id("a_normal_new"),
  normalAOld: id("a_normal_old"),
  dailyA: id("a_daily"),
  normalB: id("b_normal"),
  dailyB: id("b_daily"),
  normalC: id("c_normal"),
  dayA: id("day_a"),
  dayB: id("day_b"),
  linkA: id("step_day_a"),
  linkB: id("step_day_b"),
  coursePublic: id("course_public"),
  coursePrivate: id("course_private"),
  courseB: id("course_b"),
  dayCoursePublic: id("day_course_public"),
  dayCoursePrivate: id("day_course_private"),
  dayCourseB: id("day_course_b"),
};
const users = [f.a, f.b, f.c, f.empty];
const steps = [f.normalANew, f.normalAOld, f.dailyA, f.normalB, f.dailyB, f.normalC];
const days = [f.dayA, f.dayB];
const daySteps = [f.linkA, f.linkB];
const dayCourses = [f.dayCoursePublic, f.dayCoursePrivate, f.dayCourseB];
const stamp = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`);
const media = "opaque-fictional://must-not-fetch";
const marker = "FICTIONAL_PRIVATE_AUTHOR_EMAIL_MUST_NOT_LEAK";
const read = (actorUserId: string, allowMixed: boolean, isDailyCourse = false) =>
  readVisibleStepsApplication.execute({ actorUserId, allowMixed, isDailyCourse });
let seeded = false;

async function guard() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_VISIBLE_STEPS_OWN_PG18).toBe("1");
  expect([
    u.protocol,
    u.hostname,
    u.port,
    u.pathname,
    u.searchParams.get("host"),
    u.searchParams.get("application_name"),
    u.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, appTag, ""]);
  const db = await prisma.$queryRaw<
    {
      name: boolean;
      version: boolean;
      data: boolean;
      socket: boolean;
      unix: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS name,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${directory} AS data,
      current_setting('unix_socket_directories')=${socket} AS socket,
      current_setting('listen_addresses')='' AS unix,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
          OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(db).toEqual([
    { name: true, version: true, data: true, socket: true, unix: true, outsiders: 0n },
  ]);
}

beforeAll(async () => {
  await guard();
  expect(
    await prisma.$queryRaw<{ u: bigint; s: bigint; d: bigint; c: bigint; m: bigint }[]>`
    SELECT (SELECT count(*) FROM public."User") AS u,
      (SELECT count(*) FROM public."Step") AS s,
      (SELECT count(*) FROM public."TrainingDay") AS d,
      (SELECT count(*) FROM public."Course") AS c,
      (SELECT count(*) FROM public._prisma_migrations) AS m
  `,
  ).toEqual([{ u: 0n, s: 0n, d: 0n, c: 0n, m: 0n }]);
  seeded = true;
  await prisma.user.createMany({
    data: users.map((u) => ({ id: u, username: u, password: "fictional-only" })),
  });
  await prisma.userProfile.createMany({
    data: [
      { id: f.profileB, userId: f.b, fullName: null, about: marker },
      { id: f.profileC, userId: f.c, fullName: "Fictional C Trainer" },
    ],
  });
  await prisma.step.createMany({
    data: [
      {
        id: f.normalANew,
        authorId: f.a,
        title: "A recent regular",
        type: "TRAINING",
        description: "A described regular step",
        durationSec: 120,
        estimatedDurationSec: 180,
        videoUrl: media,
        imageUrls: [media + "/image"],
        pdfUrls: [media + "/document"],
        checklist: { example: "fictional", count: 1 },
        surveySlug: null,
        isDailyCourse: false,
        createdAt: stamp(24),
        updatedAt: stamp(25),
      },
      {
        id: f.normalAOld,
        authorId: f.a,
        title: "A earlier regular",
        type: "PRACTICE",
        description: "",
        durationSec: null,
        estimatedDurationSec: null,
        checklist: null,
        isDailyCourse: false,
        createdAt: stamp(20),
        updatedAt: stamp(20),
      },
      {
        id: f.dailyA,
        authorId: f.a,
        title: "A daily-only",
        type: "THEORY",
        isDailyCourse: true,
        createdAt: stamp(22),
        updatedAt: stamp(23),
      },
      {
        id: f.normalB,
        authorId: f.b,
        title: "B regular",
        type: "SURVEY",
        isDailyCourse: false,
        createdAt: stamp(23),
        updatedAt: stamp(23),
      },
      {
        id: f.dailyB,
        authorId: f.b,
        title: "B daily-only",
        type: "EXAMINATION",
        isDailyCourse: true,
        createdAt: stamp(21),
        updatedAt: stamp(21),
      },
      {
        id: f.normalC,
        authorId: f.c,
        title: "C regular",
        type: "BREAK",
        isDailyCourse: false,
        createdAt: stamp(19),
        updatedAt: stamp(19),
      },
    ],
  });
  await prisma.trainingDay.createMany({
    data: [
      { id: f.dayA, authorId: f.a, title: "A linked day" },
      { id: f.dayB, authorId: f.b, title: "B linked day" },
    ],
  });
  await prisma.stepOnDay.createMany({
    data: [
      { id: f.linkA, dayId: f.dayA, stepId: f.normalANew, order: 0 },
      { id: f.linkB, dayId: f.dayB, stepId: f.normalB, order: 0 },
    ],
  });
  // Use archived schema columns; original production-derived clone lacks Course.version.
  await prisma.$executeRaw`
    INSERT INTO public."Course" ("id","name","type","trainingLevel","duration","logoImg","shortDesc","authorId","updatedAt","isPrivate","isPaid")
    VALUES
      (${f.coursePublic},'Fictional open','vis_steps_public','BEGINNER'::"TrainingLevel",'10 min','public-logo','Public intro',${f.a},CURRENT_TIMESTAMP,false,false),
      (${f.coursePrivate},'Fictional private','vis_steps_private','BEGINNER'::"TrainingLevel",'15 min','private-logo','Private intro',${f.a},CURRENT_TIMESTAMP,true,true),
      (${f.courseB},'Fictional B','vis_steps_b','BEGINNER'::"TrainingLevel",'20 min','b-logo','B intro',${f.b},CURRENT_TIMESTAMP,false,false)
  `;
  await prisma.dayOnCourse.createMany({
    data: [
      { id: f.dayCoursePrivate, dayId: f.dayA, courseId: f.coursePrivate, order: 1 },
      { id: f.dayCoursePublic, dayId: f.dayA, courseId: f.coursePublic, order: 0 },
      { id: f.dayCourseB, dayId: f.dayB, courseId: f.courseB, order: 0 },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await guard();
    if (seeded) {
      await prisma.dayOnCourse.deleteMany({ where: { id: { in: dayCourses } } });
      await prisma.stepOnDay.deleteMany({ where: { id: { in: daySteps } } });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE id IN (${f.coursePublic},${f.coursePrivate},${f.courseB})`;
      await prisma.trainingDay.deleteMany({ where: { id: { in: days } } });
      await prisma.step.deleteMany({ where: { id: { in: steps } } });
      await prisma.userProfile.deleteMany({ where: { id: { in: [f.profileB, f.profileC] } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    expect(
      await prisma.$queryRaw<
        { u: bigint; p: bigint; s: bigint; d: bigint; c: bigint; l: bigint; m: bigint }[]
      >`
      SELECT (SELECT count(*) FROM public."User") AS u,
        (SELECT count(*) FROM public."UserProfile") AS p,
        (SELECT count(*) FROM public."Step") AS s,
        (SELECT count(*) FROM public."TrainingDay") AS d,
        (SELECT count(*) FROM public."Course") AS c,
        (SELECT count(*) FROM public."StepOnDay") AS l,
        (SELECT count(*) FROM public._prisma_migrations) AS m
    `,
    ).toEqual([{ u: 0n, p: 0n, s: 0n, d: 0n, c: 0n, l: 0n, m: 0n }]);
    expect(forbidden.invalidate).not.toHaveBeenCalled();
    expect(forbidden.publish).not.toHaveBeenCalled();
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

const expectedKeys = [
  "id",
  "title",
  "description",
  "durationSec",
  "estimatedDurationSec",
  "type",
  "videoUrl",
  "imageUrls",
  "pdfUrls",
  "checklist",
  "surveySlug",
  "isDailyCourse",
  "authorId",
  "createdAt",
  "updatedAt",
  "author",
  "stepLinks",
];
const keys = (x: Record<string, unknown>, expected: string[]) =>
  expect(Object.keys(x).sort()).toEqual([...expected].sort());

describe("AG1 original Trainer visible steps Core Prisma PG18", () => {
  it("regular source scope A/B/C, mixed authors, empty owner, createdAt DESC without pagination", async () => {
    expect((await read(f.a, false)).map((x) => x.id)).toEqual([f.normalANew, f.normalAOld]);
    expect((await read(f.b, false)).map((x) => x.id)).toEqual([f.normalB]);
    expect((await read(f.c, false)).map((x) => x.id)).toEqual([f.normalC]);
    expect(await read(f.empty, false)).toEqual([]);
    const all = await read(f.empty, true);
    expect(all.map((x) => x.id)).toEqual([f.normalANew, f.normalB, f.normalAOld, f.normalC]);
    for (const x of all) {
      keys(x, expectedKeys);
      expect(x.isDailyCourse).toBe(false);
      expect(x.createdAt).toMatch(/^2026-10-\d{2}T10:00:00\.000Z$/);
      expect(x.updatedAt).toMatch(/^2026-10-\d{2}T10:00:00\.000Z$/);
      expect(JSON.stringify(x)).not.toContain(marker);
    }
  });
  it("isDailyCourse option true; mixed and authored selection are independent", async () => {
    expect((await read(f.a, false, true)).map((x) => x.id)).toEqual([f.dailyA]);
    expect((await read(f.b, false, true)).map((x) => x.id)).toEqual([f.dailyB]);
    expect(await read(f.c, false, true)).toEqual([]);
    expect((await read(f.empty, true, true)).map((x) => x.id)).toEqual([f.dailyA, f.dailyB]);
    expect((await read(f.a, true, true)).map((x) => x.id)).toEqual([f.dailyA, f.dailyB]);
    expect(await read(f.empty, true, false)).toHaveLength(4);
  });
  it("nullable fields/author relations, opaque media preserved but never fetched, JSON dates", async () => {
    const a = (await read(f.a, false))[0]!;
    expect(a.author).toEqual({ username: f.a, profile: null });
    expect(a.durationSec).toBe(120);
    expect(a.estimatedDurationSec).toBe(180);
    expect(a.videoUrl).toBe(media);
    expect(a.imageUrls).toEqual([media + "/image"]);
    expect(a.pdfUrls).toEqual([media + "/document"]);
    expect(a.checklist).toEqual({ example: "fictional", count: 1 });
    expect(a.updatedAt).toBe(stamp(25).toISOString());
    const old = (await read(f.a, false))[1]!;
    expect(old.durationSec).toBeNull();
    expect(old.estimatedDurationSec).toBeNull();
    expect(old.videoUrl).toBeNull();
    expect(old.checklist).toBeNull();
    expect(old.surveySlug).toBeNull();
    expect((await read(f.b, false))[0]?.author).toEqual({
      username: f.b,
      profile: { fullName: null },
    });
    expect((await read(f.c, false))[0]?.author).toEqual({
      username: f.c,
      profile: { fullName: "Fictional C Trainer" },
    });
  });
  it("real nested StepOnDay→DayOnCourse includes public and private metadata whitelist only", async () => {
    const a = (await read(f.a, false))[0]!;
    expect(a.stepLinks).toHaveLength(1);
    keys(a.stepLinks[0]!, ["day"]);
    keys(a.stepLinks[0]!.day, ["dayLinks"]);
    const courseLinks = a.stepLinks[0]!.day.dayLinks;
    expect(courseLinks).toHaveLength(2);
    expect(courseLinks.map((x) => x.course.name).sort()).toEqual([
      "Fictional open",
      "Fictional private",
    ]);
    for (const link of courseLinks) {
      keys(link, ["course"]);
      keys(link.course, ["id", "name", "shortDesc", "logoImg"]);
    }
    expect((await read(f.a, false))[1]?.stepLinks).toEqual([]);
    expect((await read(f.b, false))[0]?.stepLinks[0]?.day.dayLinks[0]?.course.name).toBe(
      "Fictional B",
    );
    expect(await prisma.step.count()).toBe(steps.length);
    expect(await prisma.stepOnDay.count()).toBe(daySteps.length);
    expect(forbidden.invalidate).not.toHaveBeenCalled();
    expect(forbidden.publish).not.toHaveBeenCalled();
  });
});
