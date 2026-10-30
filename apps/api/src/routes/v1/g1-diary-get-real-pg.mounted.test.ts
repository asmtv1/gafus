/** LEARN032/G3: registered Hono diary GET → real Core/Prisma PG18 → canonical JSON. */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";

// This route includes unrelated mutation/video/notification imports; none may run in diary GET.
const blocked = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("UNUSED_DIARY_GET_SIDE_EFFECT_FORBIDDEN");
  }),
);
vi.mock("@gafus/core/services/training", () => ({
  requireCourseStepOperationAccess: blocked,
  syncUserCourseStatusFromDays: blocked,
  validateTheoryStepForCompletion: blocked,
}));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  requirePremiumOrRewardedAccessForVideoUrl: blocked,
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {},
}));
vi.mock("@gafus/core/services/video", () => ({
  checkVideoAccess: blocked,
  getProgress: blocked,
  getVideoManifestInfo: blocked,
  saveProgress: blocked,
}));
vi.mock("@gafus/core/services/notifications", () => ({
  createStepNotificationForStepStart: blocked,
  getDayFromDayOnCourseId: blocked,
  pauseStepNotification: blocked,
  resetStepNotification: blocked,
  resumeStepNotification: blocked,
}));
vi.mock("@gafus/cdn-upload", () => ({
  downloadFileFromCDN: blocked,
  extractVideoIdFromCdnUrl: blocked,
  getSignedDownloadUrl: blocked,
  streamFileFromCDN: blocked,
}));
vi.mock("@gafus/video-access", () => ({
  getVideoAccessService: blocked,
  VIDEO_PLAYBACK_TOKEN_TTL_MINUTES: 720,
}));
vi.mock("../../lib/hlsManifest", () => ({ rewriteHlsManifest: blocked }));
vi.mock("../../modules/training/composition/read-training-day", () => ({
  readTrainingDayApplication: { execute: blocked },
}));
vi.mock("../../modules/training/composition/read-training-days", () => ({
  readTrainingDaysApplication: { execute: blocked },
}));
vi.mock("../../modules/training/composition/write-diary", () => ({
  writeDiaryApplication: { execute: blocked },
}));
vi.mock("../../modules/training/composition/write-step-progress", () => ({
  writeStepProgressApplication: { execute: blocked },
}));
// Actual read closure: diaryService -> actual courseService access check -> real Prisma.
// Only an unused Course logo write-side dependency is guarded, not the entitlement READ.
vi.mock("../../../../../packages/core/src/services/trainerCourse/courseVersionService", () => ({
  setCourseLogoVersioned: blocked,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), success: vi.fn() }),
}));
import { trainingRoutes } from "./training";

const database = "gafus_refactor_diary_hono_read_ag1_20261024";
const directory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_diary_hono_sql_20261024";
const id = (suffix: string) => `ag1_diary_hono_20261024_${suffix}`;
const f = {
  trainer: id("trainer"),
  a: id("learner_a"),
  b: id("learner_b"),
  empty: id("learner_empty"),
  public: id("public_course"),
  private: id("private_course"),
  dayFirst: id("day_first"),
  dayMiddle: id("day_middle"),
  dayLast: id("day_last"),
  dayPrivate: id("day_private"),
  linkFirst: "clwdayoc0000000000000001",
  linkMiddle: "clwdayoc0000000000000002",
  linkLast: "clwdayoc0000000000000003",
  linkPrivate: "clwdayoc0000000000000004",
  aFirst: id("entry_a_first"),
  aMiddle: id("entry_a_middle"),
  aLast: id("entry_a_last"),
  bFirst: id("entry_b_first"),
  aPrivate: id("entry_a_private"),
};
const users = [f.trainer, f.a, f.b, f.empty];
const days = [f.dayFirst, f.dayMiddle, f.dayLast, f.dayPrivate];
const links = [f.linkFirst, f.linkMiddle, f.linkLast, f.linkPrivate];
const entries = [f.aFirst, f.aMiddle, f.aLast, f.bFirst, f.aPrivate];
const publicType = "ag1_diary_hono_public_20261024";
const stamp = (d: number) => new Date(`2026-10-${String(d).padStart(2, "0")}T08:30:00.000Z`);
const privateText = "FICTIONAL_PRIVATE_DIARY_NOT_FOR_LEARNER_B";
let seeded = false;

const server = new Hono();
server.use("/api/v1/training/*", async (c, next) => {
  // Controlled test principal injection only. NO real JWT/security middleware claim.
  c.set("user", {
    id: c.req.header("x-own-test-principal") || f.a,
    role: "USER",
    username: "fictional-learner",
  });
  await next();
});
server.route("/api/v1/training", trainingRoutes); // Real registered route object; not full app boot.
const get = (query: string, actor = f.a) =>
  server.request(`/api/v1/training/diary${query}`, {
    headers: { "x-own-test-principal": actor },
  });

async function guardOwnDatabase() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_DIARY_HONO_OWN_PG18).toBe("1");
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
      unix: boolean;
      sock: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${directory} AS dir,
      current_setting('listen_addresses')='' AS unix,
      current_setting('unix_socket_directories')=${socket} AS sock,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
          OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(rows).toEqual([
    { db: true, version: true, dir: true, unix: true, sock: true, outsiders: 0n },
  ]);
}

beforeAll(async () => {
  await guardOwnDatabase();
  expect(
    await prisma.$queryRaw<{ u: bigint; c: bigint; d: bigint; l: bigint; e: bigint; m: bigint }[]>`
    SELECT (SELECT count(*) FROM public."User") AS u,
      (SELECT count(*) FROM public."Course") AS c,
      (SELECT count(*) FROM public."TrainingDay") AS d,
      (SELECT count(*) FROM public."DayOnCourse") AS l,
      (SELECT count(*) FROM public."DiaryEntry") AS e,
      (SELECT count(*) FROM public._prisma_migrations) AS m
  `,
  ).toEqual([{ u: 0n, c: 0n, d: 0n, l: 0n, e: 0n, m: 0n }]);
  await prisma.user.createMany({
    data: users.map((u) => ({ id: u, username: u, password: "fictional-only" })),
  });
  seeded = true;
  // Original production-shaped schema-only archive omits later Course.version.
  await prisma.$executeRaw`
    INSERT INTO public."Course" ("id","name","type","trainingLevel","duration", "logoImg","authorId","updatedAt","isPrivate","isPaid")
    VALUES (${f.public},'Fictional public','ag1_diary_hono_public_20261024','BEGINNER'::"TrainingLevel",'10 min','fixture',${f.trainer},CURRENT_TIMESTAMP,false,false),
      (${f.private},'Fictional private','ag1_diary_hono_private_20261024','BEGINNER'::"TrainingLevel",'10 min','fixture',${f.trainer},CURRENT_TIMESTAMP,true,false)
  `;
  await prisma.trainingDay.createMany({
    data: [
      { id: f.dayFirst, authorId: f.trainer, title: "First fictional" },
      { id: f.dayMiddle, authorId: f.trainer, title: "Middle fictional" },
      { id: f.dayLast, authorId: f.trainer, title: "Last fictional" },
      { id: f.dayPrivate, authorId: f.trainer, title: "Private fictional" },
    ],
  });
  await prisma.dayOnCourse.createMany({
    data: [
      { id: f.linkLast, courseId: f.public, dayId: f.dayLast, order: 2 },
      { id: f.linkFirst, courseId: f.public, dayId: f.dayFirst, order: 0 },
      { id: f.linkPrivate, courseId: f.private, dayId: f.dayPrivate, order: 0 },
      { id: f.linkMiddle, courseId: f.public, dayId: f.dayMiddle, order: 1 },
    ],
  });
  await prisma.courseAccess.create({ data: { courseId: f.private, userId: f.a } });
  await prisma.diaryEntry.createMany({
    data: [
      {
        id: f.aLast,
        userId: f.a,
        dayId: f.dayLast,
        content: "A last",
        createdAt: stamp(19),
        updatedAt: stamp(21),
      },
      {
        id: f.aMiddle,
        userId: f.a,
        dayId: f.dayMiddle,
        content: "A middle",
        createdAt: stamp(18),
        updatedAt: stamp(18),
      },
      {
        id: f.aFirst,
        userId: f.a,
        dayId: f.dayFirst,
        content: "A first",
        createdAt: stamp(17),
        updatedAt: stamp(22),
      },
      {
        id: f.bFirst,
        userId: f.b,
        dayId: f.dayFirst,
        content: "B personal",
        createdAt: stamp(17),
        updatedAt: stamp(17),
      },
      {
        id: f.aPrivate,
        userId: f.a,
        dayId: f.dayPrivate,
        content: privateText,
        createdAt: stamp(20),
        updatedAt: stamp(20),
      },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await guardOwnDatabase();
    if (seeded) {
      await prisma.diaryEntry.deleteMany({ where: { id: { in: entries } } });
      await prisma.courseAccess.deleteMany({ where: { courseId: f.private, userId: f.a } });
      await prisma.dayOnCourse.deleteMany({ where: { id: { in: links } } });
      await prisma.trainingDay.deleteMany({ where: { id: { in: days } } });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE "id" IN (${f.public},${f.private})`;
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    expect(
      await prisma.$queryRaw<
        { u: bigint; c: bigint; d: bigint; l: bigint; e: bigint; a: bigint; m: bigint }[]
      >`
      SELECT (SELECT count(*) FROM public."User") AS u,
        (SELECT count(*) FROM public."Course") AS c,
        (SELECT count(*) FROM public."TrainingDay") AS d,
        (SELECT count(*) FROM public."DayOnCourse") AS l,
        (SELECT count(*) FROM public."DiaryEntry") AS e,
        (SELECT count(*) FROM public."CourseAccess") AS a,
        (SELECT count(*) FROM public._prisma_migrations) AS m
    `,
    ).toEqual([{ u: 0n, c: 0n, d: 0n, l: 0n, e: 0n, a: 0n, m: 0n }]);
    expect(blocked).not.toHaveBeenCalled();
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

const entryKeys = [
  "id",
  "content",
  "createdAt",
  "updatedAt",
  "dayId",
  "dayOnCourseId",
  "dayOrder",
  "dayTitle",
];
const exact = (record: Record<string, unknown>, keys: string[]) =>
  expect(Object.keys(record).sort()).toEqual([...keys].sort());

describe("LEARN032 original registered diary GET + real Core/PG JSON wire", () => {
  it("registered GET by course ID and type returns exact eight-field ISO JSON order", async () => {
    for (const ref of [f.public, publicType]) {
      const response = await get(`?courseId=${ref}`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({ success: true });
      exact(data, ["success", "data"]);
      exact(data.data, ["entries"]);
      expect(data.data.entries.map((x: { dayOrder: number }) => x.dayOrder)).toEqual([0, 1, 2]);
      expect(data.data.entries.map((x: { content: string }) => x.content)).toEqual([
        "A first",
        "A middle",
        "A last",
      ]);
      for (const row of data.data.entries) {
        exact(row, entryKeys);
        expect(row.createdAt).toMatch(/^2026-10-\d{2}T08:30:00\.000Z$/);
        expect(row.updatedAt).toMatch(/^2026-10-\d{2}T08:30:00\.000Z$/);
      }
      expect(data.data.entries[0]).toMatchObject({
        id: f.aFirst,
        dayId: f.dayFirst,
        dayOnCourseId: f.linkFirst,
        dayOrder: 0,
        dayTitle: "First fictional",
        createdAt: stamp(17).toISOString(),
        updatedAt: stamp(22).toISOString(),
      });
    }
  });
  it("cutoff CUID is inclusive and original Zod query rejects missing/invalid values", async () => {
    const response = await get(`?courseId=${f.public}&upToDayOnCourseId=${f.linkMiddle}`);
    expect(response.status).toBe(200);
    expect((await response.json()).data.entries.map((x: { id: string }) => x.id)).toEqual([
      f.aFirst,
      f.aMiddle,
    ]);
    const first = await get(`?courseId=${f.public}&upToDayOnCourseId=${f.linkFirst}`);
    expect((await first.json()).data.entries.map((x: { id: string }) => x.id)).toEqual([f.aFirst]);
    for (const query of ["", "?courseId=", `?courseId=${f.public}&upToDayOnCourseId=not-a-cuid`]) {
      const invalid = await get(query);
      expect(invalid.status).toBe(400);
    }
    expect(await prisma.diaryEntry.count()).toBe(entries.length);
  });
  it("real own-entry isolation, empty actor and private access denied unchanged", async () => {
    const b = await get(`?courseId=${f.public}`, f.b);
    expect(b.status).toBe(200);
    const bj = await b.json();
    expect(bj.data.entries.map((x: { content: string }) => x.content)).toEqual(["B personal"]);
    expect(JSON.stringify(bj)).not.toContain("A first");
    expect(JSON.stringify(bj)).not.toContain(privateText);
    const empty = await get(`?courseId=${f.public}`, f.empty);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ success: true, data: { entries: [] } });
    const aPrivate = await get(`?courseId=${f.private}`, f.a);
    expect(aPrivate.status).toBe(200);
    expect((await aPrivate.json()).data.entries.map((x: { content: string }) => x.content)).toEqual(
      [privateText],
    );
    const denied = await get(`?courseId=${f.private}`, f.b);
    expect(denied.status).toBe(403);
    const deniedJson = await denied.json();
    expect(deniedJson).toEqual({ success: false, error: "Нет доступа к курсу" });
    expect(JSON.stringify(deniedJson)).not.toContain(privateText);
  });
  it("unknown course original GET error, no writes or unused side effects", async () => {
    const missing = await get("?courseId=fictional-unknown-course");
    expect(missing.status).toBe(403);
    expect(await missing.json()).toEqual({ success: false, error: "Курс не найден" });
    expect(await prisma.diaryEntry.count()).toBe(entries.length);
    expect(await prisma.courseAccess.count()).toBe(1);
    expect(blocked).not.toHaveBeenCalled();
  });
});
