/** AG1-090 LEARN032: real original Achievements → Prisma → isolated PG18. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import type { AchievementDataWire } from "@gafus/types";
import { createReadAchievementsApplication } from "../../../../../apps/api/src/modules/achievements/application/read-achievements";
import { getUserTrainingDates } from "./datesService";
import { getAchievementStats } from "./statsService";

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));

const database = "gafus_refactor_achievements_ag1_20261024";
const dataDir =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_learn032_achievements_20261024";
const today = new Date("2026-10-24T12:00:00.000Z");
const ns = "ag1_ach_real_20261024_";
const id = (suffix: string) => ns + suffix;
const F = {
  trainer: id("trainer"),
  a: id("student_a"),
  b: id("student_b"),
  empty: id("student_empty"),
  first: id("course_first"),
  second: id("course_second"),
  unstarted: id("course_unstarted"),
};
const actors = [F.trainer, F.a, F.b, F.empty];
const courses = [F.first, F.second, F.unstarted];
const days = ["c1_0", "c1_1", "c2_0", "c2_1", "c2_2", "c3_0"].map(id);
const links = ["link_c1_0", "link_c1_1", "link_c2_0", "link_c2_1", "link_c2_2", "link_c3_0"].map(
  id,
);
const stepKeys = ["step_c1_0", "step_c1_1", "step_c2_0", "step_c2_1"].map(id);
const stepLinks = ["sl_c1_0", "sl_c1_1", "sl_c2_0", "sl_c2_1"].map(id);
const trainingKeys = ["a_c1_0", "a_c1_1", "a_c2_0", "a_c2_1", "b_c1_1"].map(id);
const userStepKeys = ["us_a_c1_0", "us_a_c1_1", "us_a_c2_0", "us_a_c2_1", "us_b_c1_1"].map(id);
const localDates = [
  new Date("2026-10-22T10:00:00.000Z"),
  new Date("2026-10-23T12:00:00.000Z"),
  new Date("2026-10-24T09:00:00.000Z"),
];
const readApp = createReadAchievementsApplication({
  readStats: getAchievementStats,
  readTrainingDates: getUserTrainingDates,
});
let seeded = false;

async function ownPg() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.G1_AG1_ACHIEVEMENTS_PG18).toBe("1");
  expect(process.env.TZ).toBe("Europe/London");
  expect([
    url.protocol,
    url.hostname,
    url.port,
    url.pathname,
    url.searchParams.get("host"),
    url.searchParams.get("application_name"),
    url.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, appTag, ""]);
  const row = await prisma.$queryRaw<
    {
      db: boolean;
      version: boolean;
      dataDir: boolean;
      noTcp: boolean;
      sock: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${dataDir} AS "dataDir",
      current_setting('listen_addresses')='' AS "noTcp",
      current_setting('unix_socket_directories')=${socket} AS sock,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
       AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
         OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(row).toEqual([
    { db: true, version: true, dataDir: true, noTcp: true, sock: true, outsiders: 0n },
  ]);
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(today);
  await ownPg();
  const before = await prisma.$queryRaw<
    { users: bigint; courses: bigint; trainings: bigint; steps: bigint; ledger: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."Course") AS courses,
      (SELECT count(*) FROM public."UserTraining") AS trainings,
      (SELECT count(*) FROM public."UserStep") AS steps,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger
  `;
  expect(before).toEqual([{ users: 0n, courses: 0n, trainings: 0n, steps: 0n, ledger: 0n }]);
  await prisma.user.createMany({
    data: actors.map((actor) => ({ id: actor, username: actor, password: "fictional-only" })),
  });
  seeded = true;
  for (const [idx, cid] of courses.entries()) {
    await prisma.$executeRaw`
      INSERT INTO public."Course" ("id","name","type","trainingLevel", "duration",
        "logoImg","authorId","updatedAt")
      VALUES (${cid},${`Fictional achievement course ${idx + 1}`},${`ach_sql_${idx + 1}`},
        'BEGINNER'::"TrainingLevel",'10 min','fictional-no-media',${F.trainer},CURRENT_TIMESTAMP)
    `;
  }
  await prisma.trainingDay.createMany({
    data: days.map((day, idx) => ({
      id: day,
      title: `Fictional lesson ${idx + 1}`,
      authorId: F.trainer,
    })),
  });
  await prisma.dayOnCourse.createMany({
    data: links.map((link, idx) => ({
      id: link,
      dayId: days[idx]!,
      courseId: idx < 2 ? F.first : idx < 5 ? F.second : F.unstarted,
      order: idx < 2 ? idx : idx < 5 ? idx - 2 : 0,
    })),
  });
  await prisma.step.createMany({
    data: stepKeys.map((step, idx) => ({
      id: step,
      title: `Fictional step ${idx + 1}`,
      authorId: F.trainer,
    })),
  });
  await prisma.stepOnDay.createMany({
    data: stepLinks.map((link, idx) => ({
      id: link,
      stepId: stepKeys[idx]!,
      dayId: days[[0, 1, 2, 3][idx]!]!,
      order: 0,
    })),
  });
  await prisma.userCourse.createMany({
    data: [
      { userId: F.a, courseId: F.first, status: "IN_PROGRESS" },
      { userId: F.a, courseId: F.second, status: "COMPLETED" },
      { userId: F.a, courseId: F.unstarted, status: "NOT_STARTED" },
      { userId: F.b, courseId: F.first, status: "IN_PROGRESS" },
    ],
  });
  await prisma.userTraining.createMany({
    data: [
      {
        id: trainingKeys[0]!,
        userId: F.a,
        dayOnCourseId: links[0]!,
        status: "COMPLETED",
        updatedAt: localDates[0],
      },
      {
        id: trainingKeys[1]!,
        userId: F.a,
        dayOnCourseId: links[1]!,
        status: "IN_PROGRESS",
        updatedAt: localDates[1],
      },
      {
        id: trainingKeys[2]!,
        userId: F.a,
        dayOnCourseId: links[2]!,
        status: "COMPLETED",
        updatedAt: localDates[1],
      },
      {
        id: trainingKeys[3]!,
        userId: F.a,
        dayOnCourseId: links[3]!,
        status: "COMPLETED",
        updatedAt: localDates[2],
      },
      {
        id: trainingKeys[4]!,
        userId: F.b,
        dayOnCourseId: links[1]!,
        status: "COMPLETED",
        updatedAt: localDates[2],
      },
    ],
  });
  await prisma.userStep.createMany({
    data: [
      {
        id: userStepKeys[0]!,
        userTrainingId: trainingKeys[0]!,
        stepOnDayId: stepLinks[0]!,
        status: "COMPLETED",
        updatedAt: localDates[0],
      },
      {
        id: userStepKeys[1]!,
        userTrainingId: trainingKeys[1]!,
        stepOnDayId: stepLinks[1]!,
        status: "COMPLETED",
        updatedAt: localDates[1],
      },
      {
        id: userStepKeys[2]!,
        userTrainingId: trainingKeys[2]!,
        stepOnDayId: stepLinks[2]!,
        status: "COMPLETED",
        updatedAt: localDates[1],
      },
      {
        id: userStepKeys[3]!,
        userTrainingId: trainingKeys[3]!,
        stepOnDayId: stepLinks[3]!,
        status: "COMPLETED",
        updatedAt: localDates[2],
      },
      {
        id: userStepKeys[4]!,
        userTrainingId: trainingKeys[4]!,
        stepOnDayId: stepLinks[1]!,
        status: "COMPLETED",
        updatedAt: localDates[2],
      },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await ownPg();
    if (seeded) {
      await prisma.userStep.deleteMany({ where: { id: { in: userStepKeys } } });
      await prisma.userTraining.deleteMany({ where: { id: { in: trainingKeys } } });
      await prisma.userCourse.deleteMany({
        where: { userId: { in: actors }, courseId: { in: courses } },
      });
      await prisma.stepOnDay.deleteMany({ where: { id: { in: stepLinks } } });
      await prisma.step.deleteMany({ where: { id: { in: stepKeys } } });
      await prisma.dayOnCourse.deleteMany({ where: { id: { in: links } } });
      await prisma.trainingDay.deleteMany({ where: { id: { in: days } } });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE id IN (${F.first},${F.second},${F.unstarted})`;
      await prisma.user.deleteMany({ where: { id: { in: actors } } });
    }
    const empty = await prisma.$queryRaw<
      {
        users: bigint;
        courses: bigint;
        days: bigint;
        trainings: bigint;
        steps: bigint;
        ledger: bigint;
      }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."Course") AS courses,
        (SELECT count(*) FROM public."TrainingDay") AS days,
        (SELECT count(*) FROM public."UserTraining") AS trainings,
        (SELECT count(*) FROM public."UserStep") AS steps,
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `;
    expect(empty).toEqual([
      { users: 0n, courses: 0n, days: 0n, trainings: 0n, steps: 0n, ledger: 0n },
    ]);
  } finally {
    await prisma.$disconnect();
    vi.useRealTimers();
  }
}, 45000);

describe("LEARN032 actual achievements Core/Prisma/PG18", () => {
  it("empty actor C has zero real stats, dates and only Date-domain lastUpdated", async () => {
    const stats = await readApp.stats({ actorUserId: F.empty });
    expect(stats).toMatchObject({
      totalCourses: 0,
      completedCourses: 0,
      inProgressCourses: 0,
      totalCompletedDays: 0,
      totalDays: 0,
      overallProgress: 0,
      totalTrainingTime: 0,
      averageCourseProgress: 0,
      longestStreak: 0,
      currentStreak: 0,
      version: "1.0.0",
    });
    expect(stats.lastUpdated).toBeInstanceOf(Date);
    expect(stats.achievements.length).toBeGreaterThan(0);
    expect(await readApp.trainingDates({ actorUserId: F.empty })).toEqual([]);
  });
  it("A real grouped progress excludes NOT_STARTED and counts only own completed course days", async () => {
    const stats = await readApp.stats({ actorUserId: F.a });
    expect(stats).toMatchObject({
      totalCourses: 2,
      completedCourses: 1,
      inProgressCourses: 1,
      totalCompletedDays: 3,
      totalDays: 5,
      overallProgress: 60,
      totalTrainingTime: 90,
      averageCourseProgress: 58,
      longestStreak: 3,
      currentStreak: 3,
      version: "1.0.0",
    });
    expect(await prisma.dayOnCourse.count({ where: { courseId: { in: courses } } })).toBe(6);
    expect(await prisma.userTraining.count({ where: { userId: F.a, status: "COMPLETED" } })).toBe(
      3,
    );
  });
  it("real completed Step and Day timestamps deduplicate using PROCESS LOCAL TZ, then serialize ISO wire", async () => {
    // 22/23/24 Oct 2026 are British Summer Time (UTC+01), NOT Moscow days.
    expect(new Date("2026-10-23T23:10:00Z").getDate()).toBe(24);
    const dates = await readApp.trainingDates({ actorUserId: F.a });
    expect(dates).toHaveLength(3);
    expect(dates.every((d) => d instanceof Date)).toBe(true);
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-10-23T23:00:00.000Z",
      "2026-10-22T23:00:00.000Z",
      "2026-10-21T23:00:00.000Z",
    ]);
    expect(
      await prisma.userStep.count({
        where: { userTraining: { userId: F.a }, status: "COMPLETED" },
      }),
    ).toBe(4);
    const stats = await readApp.stats({ actorUserId: F.a });
    const wire = JSON.parse(JSON.stringify(stats)) as AchievementDataWire;
    expect(wire.lastUpdated).toBe(today.toISOString());
    expect(typeof wire.lastUpdated).toBe("string");
    expect(wire.totalCompletedDays).toBe(3);
    expect(wire.achievements).toHaveLength(stats.achievements.length);
    for (const a of stats.achievements) {
      const w = wire.achievements.find((item) => item.id === a.id);
      expect(w).toBeDefined();
      if (a.unlockedAt) {
        expect(a.unlockedAt).toBeInstanceOf(Date);
        expect(w?.unlockedAt).toBe(a.unlockedAt.toISOString());
      } else {
        expect(w).not.toHaveProperty("unlockedAt");
      }
    }
  });
  it("B own dates/stats isolate A progress and C empty; no background writes", async () => {
    const b = await readApp.stats({ actorUserId: F.b });
    expect(b).toMatchObject({
      totalCourses: 1,
      completedCourses: 0,
      inProgressCourses: 1,
      totalCompletedDays: 1,
      totalDays: 2,
      overallProgress: 50,
      totalTrainingTime: 30,
      averageCourseProgress: 50,
      longestStreak: 1,
      currentStreak: 1,
    });
    expect((await readApp.trainingDates({ actorUserId: F.b })).map((d) => d.toISOString())).toEqual(
      ["2026-10-23T23:00:00.000Z"],
    );
    expect(await readApp.trainingDates({ actorUserId: F.empty })).toEqual([]);
    expect(await prisma.userTraining.count({ where: { userId: F.a } })).toBe(4);
    expect(await prisma.userTraining.count({ where: { userId: F.b } })).toBe(1);
    expect(await prisma.userTraining.count({ where: { userId: F.empty } })).toBe(0);
  });
});
