/** AG1-090 LEARN032: original diary Core + real Prisma + fresh isolated PG18 schema. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import type { DiaryEntryWire } from "@gafus/types";
import { getDiaryEntries, saveDiaryEntry } from "./diaryService";
import { createReadDiaryApplication } from "../../../../../apps/api/src/modules/training/application/read-diary";
import { createWriteDiaryApplication } from "../../../../../apps/api/src/modules/training/application/write-diary";

// Prevent unused trainer Course.version commands from pulling Redis/cache providers.
// The actual courseService.checkCourseAccessById and its Core entitlement policy
// remain unmocked and use the real Prisma client for public/private access.
const versionCall = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("NO_TRAINER_COURSE_MUTATIONS");
  }),
);
vi.mock("../trainerCourse/courseVersionService", () => ({ setCourseLogoVersioned: versionCall }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const database = "gafus_refactor_diary_ag1_20261024";
const dataDirectory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_learn032_diary_20261024";
const root = "ag1_learn032_real_diary_20261024_";
const id = (suffix: string) => root + suffix;
const fixture = {
  author: id("author"),
  a: id("student_a"),
  b: id("student_b"),
  c: id("student_c"),
  publicCourse: id("course_public"),
  privateCourse: id("course_private"),
  dayFirst: id("day_first"),
  dayMiddle: id("day_middle"),
  dayLast: id("day_last"),
  dayPrivate: id("day_private"),
  linkFirst: id("link_first"),
  linkMiddle: id("link_middle"),
  linkLast: id("link_last"),
  linkPrivate: id("link_private"),
};
const actors = [fixture.author, fixture.a, fixture.b, fixture.c];
const days = [fixture.dayFirst, fixture.dayMiddle, fixture.dayLast, fixture.dayPrivate];
const links = [fixture.linkFirst, fixture.linkMiddle, fixture.linkLast, fixture.linkPrivate];
const publicType = "ag1_real_diary_public_20261024";
const privateType = "ag1_real_diary_private_20261024";
const privateText = "FICTIONAL_PRIVATE_DIARY_DO_NOT_SHOW_TO_B";
const readApp = createReadDiaryApplication({ readDiary: getDiaryEntries });
const writeApp = createWriteDiaryApplication({ save: saveDiaryEntry });
let seeded = false;

async function ownDatabaseGuard() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.G1_AG1_DIARY_OWN_PG18).toBe("1");
  expect([
    u.protocol,
    u.hostname,
    u.port,
    u.pathname,
    u.searchParams.get("host"),
    u.searchParams.get("application_name"),
    u.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, appTag, ""]);
  const records = await prisma.$queryRaw<
    {
      correctDatabase: boolean;
      correctVersion: boolean;
      correctData: boolean;
      unixOnly: boolean;
      correctSocket: boolean;
      others: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS "correctDatabase",
      current_setting('server_version_num')='180004' AS "correctVersion",
      current_setting('data_directory')=${dataDirectory} AS "correctData",
      current_setting('listen_addresses')='' AS "unixOnly",
      current_setting('unix_socket_directories')=${socket} AS "correctSocket",
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
         OR application_name IS DISTINCT FROM ${appTag})) AS others
  `;
  expect(records).toEqual([
    {
      correctDatabase: true,
      correctVersion: true,
      correctData: true,
      unixOnly: true,
      correctSocket: true,
      others: 0n,
    },
  ]);
}
const totalDiary = () =>
  prisma.diaryEntry.count({ where: { userId: { in: actors }, dayId: { in: days } } });
const fromJson = (
  entries: Awaited<ReturnType<typeof getDiaryEntries>>["entries"],
): DiaryEntryWire[] => JSON.parse(JSON.stringify(entries)) as DiaryEntryWire[];

beforeAll(async () => {
  await ownDatabaseGuard();
  const initial = await prisma.$queryRaw<
    { users: bigint; courses: bigint; entries: bigint; ledger: bigint; version: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."Course") AS courses,
      (SELECT count(*) FROM public."DiaryEntry") AS entries,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger,
      (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
        AND table_name='Course' AND column_name='version') AS version
  `;
  expect(initial).toEqual([{ users: 0n, courses: 0n, entries: 0n, ledger: 0n, version: 0n }]);
  await prisma.user.createMany({
    data: actors.map((actor) => ({ id: actor, username: actor, password: "fictional-only" })),
  });
  seeded = true;
  for (const [courseId, kind, courseType, isPrivate] of [
    [fixture.publicCourse, "public", publicType, false],
    [fixture.privateCourse, "private", privateType, true],
  ] as const) {
    // Fixture SQL only: use archive's real Course fields; no version/CAS workaround.
    await prisma.$executeRaw`
      INSERT INTO public."Course" ("id","name","type","trainingLevel", "duration",
        "logoImg","isPrivate","isPaid","authorId","updatedAt")
      VALUES (${courseId},${`Fictional ${kind}`},${courseType},
        'BEGINNER'::"TrainingLevel",'10 min','fictional-no-image',
        ${isPrivate},false,${fixture.author},CURRENT_TIMESTAMP)
    `;
  }
  await prisma.trainingDay.createMany({
    data: [
      { id: fixture.dayFirst, title: "First fictional day", authorId: fixture.author },
      { id: fixture.dayMiddle, title: "Middle fictional day", authorId: fixture.author },
      { id: fixture.dayLast, title: "Last fictional day", authorId: fixture.author },
      { id: fixture.dayPrivate, title: "Private fictional day", authorId: fixture.author },
    ],
  });
  // Insert deliberately out of day order; Core READ must order by DayOnCourse.order.
  await prisma.dayOnCourse.createMany({
    data: [
      { id: fixture.linkLast, courseId: fixture.publicCourse, dayId: fixture.dayLast, order: 2 },
      { id: fixture.linkFirst, courseId: fixture.publicCourse, dayId: fixture.dayFirst, order: 0 },
      {
        id: fixture.linkPrivate,
        courseId: fixture.privateCourse,
        dayId: fixture.dayPrivate,
        order: 0,
      },
      {
        id: fixture.linkMiddle,
        courseId: fixture.publicCourse,
        dayId: fixture.dayMiddle,
        order: 1,
      },
    ],
  });
  await prisma.courseAccess.create({
    data: { courseId: fixture.privateCourse, userId: fixture.a },
  });
}, 45000);

beforeEach(async () => {
  await ownDatabaseGuard();
  await prisma.diaryEntry.deleteMany({ where: { userId: { in: actors }, dayId: { in: days } } });
}, 30000);

afterAll(async () => {
  try {
    await ownDatabaseGuard();
    if (seeded) {
      await prisma.diaryEntry.deleteMany({
        where: { userId: { in: actors }, dayId: { in: days } },
      });
      await prisma.courseAccess.deleteMany({
        where: { courseId: fixture.privateCourse, userId: fixture.a },
      });
      await prisma.dayOnCourse.deleteMany({ where: { id: { in: links } } });
      await prisma.trainingDay.deleteMany({ where: { id: { in: days } } });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE id IN (${fixture.publicCourse}, ${fixture.privateCourse})`;
      await prisma.user.deleteMany({ where: { id: { in: actors } } });
    }
    const totals = await prisma.$queryRaw<
      {
        users: bigint;
        courses: bigint;
        days: bigint;
        links: bigint;
        accesses: bigint;
        entries: bigint;
        ledger: bigint;
      }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."Course") AS courses,
        (SELECT count(*) FROM public."TrainingDay") AS days,
        (SELECT count(*) FROM public."DayOnCourse") AS links,
        (SELECT count(*) FROM public."CourseAccess") AS accesses,
        (SELECT count(*) FROM public."DiaryEntry") AS entries,
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `;
    expect(totals).toEqual([
      { users: 0n, courses: 0n, days: 0n, links: 0n, accesses: 0n, entries: 0n, ledger: 0n },
    ]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

describe("LEARN032 real diary save/upsert/history on private owned PG18", () => {
  it("A writes same day twice: one actual unique row, updates content and preserves original ID", async () => {
    expect(await writeApp.execute(fixture.a, fixture.linkMiddle, "  First version  ")).toEqual({
      success: true,
    });
    const first = await prisma.diaryEntry.findUniqueOrThrow({
      where: { userId_dayId: { userId: fixture.a, dayId: fixture.dayMiddle } },
    });
    expect(first.content).toBe("First version");
    expect(await writeApp.execute(fixture.a, fixture.linkMiddle, "  Second version  ")).toEqual({
      success: true,
    });
    const updated = await prisma.diaryEntry.findUniqueOrThrow({
      where: { userId_dayId: { userId: fixture.a, dayId: fixture.dayMiddle } },
    });
    expect(updated.id).toBe(first.id);
    expect(updated.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(updated.content).toBe("Second version");
    expect(await totalDiary()).toBe(1);
    const read = await readApp.execute({ actorUserId: fixture.a, courseId: fixture.publicCourse });
    expect(read.error).toBeUndefined();
    expect(read.entries.map((e) => e.content)).toEqual(["Second version"]);
    expect(read.entries[0]).toMatchObject({
      dayId: fixture.dayMiddle,
      dayOnCourseId: fixture.linkMiddle,
      dayOrder: 1,
      dayTitle: "Middle fictional day",
    });
    expect(read.entries[0]?.createdAt).toBeInstanceOf(Date);
    const wire = fromJson(read.entries);
    expect(wire[0]?.createdAt).toBe(first.createdAt.toISOString());
    expect(wire[0]?.updatedAt).toBe(updated.updatedAt.toISOString());
    expect(Object.keys(wire[0] ?? {}).sort()).toEqual([
      "content",
      "createdAt",
      "dayId",
      "dayOnCourseId",
      "dayOrder",
      "dayTitle",
      "id",
      "updatedAt",
    ]);
    expect(versionCall).not.toHaveBeenCalled();
  });
  it("history is ordered by day, cutoff includes exactly days up to selected day", async () => {
    expect(await saveDiaryEntry(fixture.a, fixture.linkLast, "Final")).toEqual({ success: true });
    expect(await saveDiaryEntry(fixture.a, fixture.linkMiddle, "Middle")).toEqual({
      success: true,
    });
    expect(await saveDiaryEntry(fixture.a, fixture.linkFirst, "Start")).toEqual({ success: true });
    const full = await readApp.execute({ actorUserId: fixture.a, courseId: publicType });
    expect(full.entries.map((e) => [e.dayOrder, e.content, e.dayOnCourseId])).toEqual([
      [0, "Start", fixture.linkFirst],
      [1, "Middle", fixture.linkMiddle],
      [2, "Final", fixture.linkLast],
    ]);
    const cutoff = await readApp.execute({
      actorUserId: fixture.a,
      courseId: fixture.publicCourse,
      upToDayOnCourseId: fixture.linkMiddle,
    });
    expect(cutoff.entries.map((e) => e.content)).toEqual(["Start", "Middle"]);
    const firstOnly = await getDiaryEntries(fixture.a, fixture.publicCourse, fixture.linkFirst);
    expect(firstOnly.entries.map((e) => e.content)).toEqual(["Start"]);
    expect(
      (await getDiaryEntries(fixture.a, fixture.publicCourse, fixture.linkLast)).entries,
    ).toHaveLength(3);
    expect(
      fromJson(full.entries).every(
        (e) =>
          typeof e.createdAt === "string" &&
          typeof e.updatedAt === "string" &&
          e.createdAt.endsWith("Z"),
      ),
    ).toBe(true);
  });
  it("A and B have separate diary rows on same public day; C gets empty []", async () => {
    expect(await writeApp.execute(fixture.a, fixture.linkFirst, "A fictional history")).toEqual({
      success: true,
    });
    expect(await writeApp.execute(fixture.b, fixture.linkFirst, "B fictional history")).toEqual({
      success: true,
    });
    expect(await totalDiary()).toBe(2);
    expect(
      (await readApp.execute({ actorUserId: fixture.a, courseId: publicType })).entries.map(
        (e) => e.content,
      ),
    ).toEqual(["A fictional history"]);
    expect(
      (await readApp.execute({ actorUserId: fixture.b, courseId: publicType })).entries.map(
        (e) => e.content,
      ),
    ).toEqual(["B fictional history"]);
    expect(await readApp.execute({ actorUserId: fixture.c, courseId: publicType })).toEqual({
      entries: [],
    });
  });
  it("real private assignment allows A; B cannot save/read private and no data leak", async () => {
    expect(await writeApp.execute(fixture.a, fixture.linkPrivate, privateText)).toEqual({
      success: true,
    });
    expect(
      await writeApp.execute(fixture.b, fixture.linkPrivate, "foreign private attempt"),
    ).toEqual({ success: false, error: "Нет доступа к курсу" });
    const onlyA = await readApp.execute({ actorUserId: fixture.a, courseId: privateType });
    expect(onlyA.entries.map((e) => e.content)).toEqual([privateText]);
    const forbidden = await readApp.execute({
      actorUserId: fixture.b,
      courseId: fixture.privateCourse,
    });
    expect(forbidden).toEqual({ entries: [], error: "Нет доступа к курсу" });
    expect(JSON.stringify(forbidden)).not.toContain(privateText);
    expect(await prisma.diaryEntry.count({ where: { dayId: fixture.dayPrivate } })).toBe(1);
  });
  it("actual Core validation/not-found responses reject without diary INSERT", async () => {
    expect(await writeApp.execute(fixture.a, fixture.linkFirst, "    ")).toEqual({
      success: false,
      error: "Текст записи не может быть пустым",
    });
    expect(await writeApp.execute(fixture.a, fixture.linkFirst, "x".repeat(10001))).toEqual({
      success: false,
      error: "Текст записи не должен превышать 10000 символов",
    });
    expect(await writeApp.execute(fixture.a, id("missing_day_link"), "Fictional text")).toEqual({
      success: false,
      error: "День курса не найден",
    });
    expect(
      await readApp.execute({ actorUserId: fixture.a, courseId: "missing_course_type" }),
    ).toEqual({ entries: [], error: "Курс не найден" });
    expect(await totalDiary()).toBe(0);
  });
});
