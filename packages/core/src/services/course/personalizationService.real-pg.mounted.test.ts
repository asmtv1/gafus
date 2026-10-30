/** COURSE030: original personalization Core/application → real Prisma → own PG18. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import { saveCoursePersonalization } from "./personalizationService";
import { createWriteCoursePersonalizationApplication } from "../../../../../apps/api/src/modules/courses/application/write-personalization";

const database = "gafus_refactor_personalization_ag1_20261024";
const dataDir =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_course030_personalization_20261024";
const prefix = "ag1_personal_sql_20261024_";
const id = (part: string) => prefix + part;
const fixture = {
  author: id("trainer"),
  a: id("student_a"),
  b: id("student_b"),
  personalized: id("course_personalized"),
  regular: id("course_regular"),
};
const actors = [fixture.author, fixture.a, fixture.b];
const courses = [fixture.personalized, fixture.regular];
const start = new Date("2031-02-03T09:00:00.000Z");
const finish = new Date("2031-02-06T18:00:00.000Z");
const app = createWriteCoursePersonalizationApplication({ persist: saveCoursePersonalization });
const save = (
  actorUserId: string,
  courseId: string,
  payload: Parameters<typeof saveCoursePersonalization>[2],
) => app.execute({ actorUserId, courseId, payload });
const original = {
  userDisplayName: "Fictional A",
  userGender: "female" as const,
  petName: "Fictional dog",
};
let seeded = false;

async function assertOwnDb() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.G1_AG1_PERSONALIZATION_PG18).toBe("1");
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
      own: boolean;
      version: boolean;
      dataDir: boolean;
      noTcp: boolean;
      socket: boolean;
      others: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS own,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${dataDir} AS "dataDir",
      current_setting('listen_addresses')='' AS "noTcp",
      current_setting('unix_socket_directories')=${socket} AS socket,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
          OR application_name IS DISTINCT FROM ${appTag})) AS others
  `;
  expect(rows).toEqual([
    { own: true, version: true, dataDir: true, noTcp: true, socket: true, others: 0n },
  ]);
}
const get = async (actor: string, course = fixture.personalized) =>
  prisma.userCourse.findUnique({
    where: { userId_courseId: { userId: actor, courseId: course } },
  });
const ownRows = async () =>
  prisma.userCourse.count({ where: { courseId: { in: courses }, userId: { in: actors } } });

beforeAll(async () => {
  await assertOwnDb();
  const empty = await prisma.$queryRaw<
    { users: bigint; courses: bigint; progress: bigint; ledger: bigint; version: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."Course") AS courses,
      (SELECT count(*) FROM public."UserCourse") AS progress,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger,
      (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
        AND table_name='Course' AND column_name='version') AS version
  `;
  expect(empty).toEqual([{ users: 0n, courses: 0n, progress: 0n, ledger: 0n, version: 0n }]);
  await prisma.user.createMany({
    data: actors.map((actor) => ({
      id: actor,
      username: actor,
      password: "fictional-only",
    })),
  });
  seeded = true;
  // Course fixture only uses existing archive DDL columns; no ALTER/CAS bypass.
  for (const [courseId, kind, flag] of [
    [fixture.personalized, "personalized", true],
    [fixture.regular, "regular", false],
  ] as const) {
    await prisma.$executeRaw`
      INSERT INTO public."Course" ("id","name","type","trainingLevel", "duration",
        "logoImg","isPersonalized","authorId","updatedAt")
      VALUES (${courseId},${`Fictional ${kind}`},${`ag1_personal_${kind}`},
        'BEGINNER'::"TrainingLevel",'10 min','synthetic-no-media',
        ${flag},${fixture.author},CURRENT_TIMESTAMP)
    `;
  }
  await prisma.userCourse.create({
    data: {
      userId: fixture.b,
      courseId: fixture.personalized,
      status: "COMPLETED",
      startedAt: start,
      completedAt: finish,
      userDisplayName: "Existing B",
      userGender: "male",
      petName: "Existing B pet",
      petGender: "female",
      petNameGen: "B gen",
    },
  });
}, 45000);

beforeEach(async () => {
  await assertOwnDb();
  await prisma.userCourse.deleteMany({ where: { userId: fixture.a, courseId: { in: courses } } });
}, 30000);

afterAll(async () => {
  try {
    await assertOwnDb();
    if (seeded) {
      await prisma.userCourse.deleteMany({
        where: { userId: { in: actors }, courseId: { in: courses } },
      });
      await prisma.$executeRaw`
        DELETE FROM public."Course" WHERE id IN (${fixture.personalized},${fixture.regular})
      `;
      await prisma.user.deleteMany({ where: { id: { in: actors } } });
    }
    const rows = await prisma.$queryRaw<
      { users: bigint; courses: bigint; progress: bigint; ledger: bigint }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."Course") AS courses,
        (SELECT count(*) FROM public."UserCourse") AS progress,
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `;
    expect(rows).toEqual([{ users: 0n, courses: 0n, progress: 0n, ledger: 0n }]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

describe("COURSE030 existing Core + application personalization with real PG18", () => {
  it("create through existing application: all omitted nullable forms become NULL, default progress, no duplicates", async () => {
    expect(await save(fixture.a, fixture.personalized, original)).toEqual({ success: true });
    const first = await get(fixture.a);
    expect(first).toMatchObject({
      userId: fixture.a,
      courseId: fixture.personalized,
      userDisplayName: "Fictional A",
      userGender: "female",
      petName: "Fictional dog",
      status: "NOT_STARTED",
      startedAt: null,
      completedAt: null,
      petGender: null,
      petNameGen: null,
      petNameDat: null,
      petNameAcc: null,
      petNameIns: null,
      petNamePre: null,
    });
    expect(await save(fixture.a, fixture.personalized, original)).toEqual({ success: true });
    expect(await get(fixture.a)).toMatchObject({ createdAt: first?.createdAt });
    expect(
      await prisma.userCourse.count({
        where: { userId: fixture.a, courseId: fixture.personalized },
      }),
    ).toBe(1);
    expect(await ownRows()).toBe(2);
  });

  it("existing completed progress dates/status preserved while every nullable declension and gender updates", async () => {
    await prisma.userCourse.create({
      data: {
        userId: fixture.a,
        courseId: fixture.personalized,
        status: "COMPLETED",
        startedAt: start,
        completedAt: finish,
        userDisplayName: "old",
        userGender: "male",
        petName: "old dog",
        petGender: "female",
        petNameGen: "old gen",
        petNameDat: "old dat",
        petNameAcc: "old acc",
        petNameIns: "old ins",
        petNamePre: "old pre",
      },
    });
    const before = await get(fixture.a);
    const all = {
      userDisplayName: "Second fictional name",
      userGender: "female" as const,
      petName: "Another fictional dog",
      petGender: "male" as const,
      petNameGen: "Gen",
      petNameDat: "Dat",
      petNameAcc: "Acc",
      petNameIns: "Ins",
      petNamePre: "Pre",
    };
    expect(await save(fixture.a, fixture.personalized, all)).toEqual({ success: true });
    const after = await get(fixture.a);
    expect(after).toMatchObject({
      ...all,
      status: "COMPLETED",
      startedAt: start,
      completedAt: finish,
    });
    expect(after?.createdAt).toEqual(before?.createdAt);
    expect(
      await prisma.userCourse.count({
        where: { userId: fixture.a, courseId: fixture.personalized },
      }),
    ).toBe(1);
    // Optional and explicit null values reset nullable fields, do not touch progress.
    expect(
      await saveCoursePersonalization(fixture.a, fixture.personalized, {
        userDisplayName: "Third name",
        userGender: "male",
        petName: "Third dog",
        petGender: null,
        petNameGen: null,
        petNameDat: null,
        petNameAcc: null,
        petNameIns: null,
        petNamePre: null,
      }),
    ).toEqual({ success: true });
    expect(await get(fixture.a)).toMatchObject({
      userDisplayName: "Third name",
      userGender: "male",
      petName: "Third dog",
      status: "COMPLETED",
      startedAt: start,
      completedAt: finish,
      petGender: null,
      petNameGen: null,
      petNameDat: null,
      petNameAcc: null,
      petNameIns: null,
      petNamePre: null,
    });
    expect(await ownRows()).toBe(2);
  });

  it("B's existing record/progress isolated from A updates; B own personalization retains progress", async () => {
    const beforeB = await get(fixture.b);
    expect(beforeB).toMatchObject({
      userDisplayName: "Existing B",
      status: "COMPLETED",
      startedAt: start,
      completedAt: finish,
    });
    await save(fixture.a, fixture.personalized, { ...original, petName: "A-only dog" });
    expect(await get(fixture.b)).toEqual(beforeB);
    expect(
      await save(fixture.b, fixture.personalized, {
        userDisplayName: "B changed",
        userGender: "male",
        petName: "B private fictional dog",
        petNameDat: "B dat",
      }),
    ).toEqual({ success: true });
    expect(await get(fixture.a)).toMatchObject({ petName: "A-only dog" });
    expect(await get(fixture.b)).toMatchObject({
      userDisplayName: "B changed",
      petName: "B private fictional dog",
      petNameDat: "B dat",
      petGender: null,
      petNameGen: null,
      status: "COMPLETED",
      startedAt: start,
      completedAt: finish,
    });
    expect(await ownRows()).toBe(2);
  });

  it("nonpersonalized and nonexistent courses return original refusal without any new UserCourse", async () => {
    const beforeB = await get(fixture.b);
    expect(await save(fixture.a, fixture.regular, original)).toEqual({
      success: false,
      error: "Курс не поддерживает персонализацию",
    });
    expect(await save(fixture.a, id("course_missing"), original)).toEqual({
      success: false,
      error: "Курс не поддерживает персонализацию",
    });
    expect(await get(fixture.a, fixture.regular)).toBeNull();
    expect(await get(fixture.a)).toBeNull();
    expect(await ownRows()).toBe(1);
    expect(await get(fixture.b)).toEqual(beforeB);
  });
});
