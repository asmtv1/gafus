/** LEARN032 / AG1: original registered ordinary Training days+day READ → current applications → real PG18. */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";

// These are *unused* imports of OTHER training routes: fail-closed side-effect ports.
// Real ordinary Training application, original Core, access policy and Prisma remain unmocked.
const denied = vi.hoisted(() => ({
  video: vi.fn(() => {
    throw Error("UNUSED_VIDEO_BOUNDARY");
  }),
  notify: vi.fn(() => {
    throw Error("UNUSED_NOTIFICATION_BOUNDARY");
  }),
  cdn: vi.fn(() => {
    throw Error("UNUSED_CDN_BOUNDARY");
  }),
  token: vi.fn(() => {
    throw Error("UNUSED_VIDEO_ACCESS_BOUNDARY");
  }),
}));
vi.mock("@gafus/core/services/video", () => ({
  checkVideoAccess: denied.video,
  getProgress: denied.video,
  getVideoManifestInfo: denied.video,
  saveProgress: denied.video,
}));
vi.mock("@gafus/core/services/notifications", () => ({
  createStepNotificationForStepStart: denied.notify,
  getDayFromDayOnCourseId: denied.notify,
  pauseStepNotification: denied.notify,
  resetStepNotification: denied.notify,
  resumeStepNotification: denied.notify,
}));
vi.mock("@gafus/cdn-upload", () => ({
  downloadFileFromCDN: denied.cdn,
  extractVideoIdFromCdnUrl: denied.cdn,
  getSignedDownloadUrl: denied.cdn,
  streamFileFromCDN: denied.cdn,
}));
vi.mock("@gafus/video-access", () => ({
  getVideoAccessService: denied.token,
  VIDEO_PLAYBACK_TOKEN_TTL_MINUTES: 1, // unused constant for unrelated media route
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
import { trainingRoutes } from "./training";

const db = "gafus_refactor_training_forward_verified_ag1_20261024";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const dataDir =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const appTag = "ag1_training_forward_verified_sql_20261024";
const id = (s: string) => `cag1trainfw20261024${s}`;
const f = {
  author: id("author"),
  a: id("studentA"),
  b: id("studentB"),
  course: id("course"),
  courseType: "ag1_training_forward_free_20261024",
  day: id("day"),
  dayLink: id("dayLink"),
  step0: id("firstStep"),
  step1: id("secondStep"),
  link0: id("firstLink"),
  link1: id("secondLink"),
  userTraining: id("userTraining"),
  userStep: id("userStep"),
};
const stamp = new Date("2026-10-24T09:30:00.000Z");
let seeded = false;
const app = new Hono();
app.use("/api/v1/training/*", async (c, next) => {
  c.set("user", { id: c.req.header("x-own-actor") ?? f.a, role: "USER", username: "fictional" });
  await next();
});
app.route("/api/v1/training", trainingRoutes);
const get = (path: string, actor = f.a) =>
  app.request("/api/v1/training/" + path, {
    headers: { "x-own-actor": actor },
  });
const dayQuery = `day?courseType=${encodeURIComponent(f.courseType)}&dayOnCourseId=${f.dayLink}&createIfMissing=false`;
const daysQuery = `days?type=${encodeURIComponent(f.courseType)}`;
const only = (object: Record<string, unknown>, fields: string[]) =>
  expect(Object.keys(object).sort()).toEqual([...fields].sort());
const dayItemFields = [
  "trainingDayId",
  "dayOnCourseId",
  "title",
  "type",
  "courseId",
  "userStatus",
  "estimatedDuration",
  "theoryMinutes",
  "equipment",
  "isLocked",
  "showCoursePathExport",
];
const listFields = [
  "trainingDays",
  "courseDescription",
  "courseId",
  "courseVideoUrl",
  "courseEquipment",
  "courseTrainingLevel",
  "courseIsPersonalized",
  "userCoursePersonalization",
];
const detailFields = [
  "trainingDayId",
  "dayOnCourseId",
  "displayDayNumber",
  "title",
  "type",
  "showCoursePathExport",
  "courseId",
  "description",
  "duration",
  "userStatus",
  "steps",
];
const stepFields = [
  "id",
  "videoUrl",
  "pdfUrls",
  "imageUrls",
  "title",
  "description",
  "durationSec",
  "estimatedDurationSec",
  "status",
  "order",
  "isPausedOnServer",
  "type",
  "checklist",
  "requiresVideoReport",
  "requiresWrittenFeedback",
  "hasTestQuestions",
  "surveySlug",
  "userStepId",
  "locked",
];
const counts = async () => ({
  userTrainings: await prisma.userTraining.count(),
  userSteps: await prisma.userStep.count(),
  courses: await prisma.course.count(),
  dayLinks: await prisma.dayOnCourse.count(),
});
async function guard() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_TRAINING_FORWARD_OWN_PG18).toBe("1");
  expect([
    u.protocol,
    u.hostname,
    u.port,
    u.pathname,
    u.searchParams.get("host"),
    u.searchParams.get("application_name"),
    u.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${db}`, socket, appTag, ""]);
  const rows = await prisma.$queryRaw<
    {
      db: boolean;
      version: boolean;
      dataDir: boolean;
      sock: boolean;
      noTcp: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${db} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${dataDir} AS "dataDir",
      current_setting('unix_socket_directories')=${socket} AS sock,
      current_setting('listen_addresses')='' AS "noTcp",
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${db}
          OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(rows).toEqual([
    { db: true, version: true, dataDir: true, sock: true, noTcp: true, outsiders: 0n },
  ]);
}
beforeAll(async () => {
  await guard();
  expect(await counts()).toEqual({ userTrainings: 0, userSteps: 0, courses: 0, dayLinks: 0 });
  expect(
    await prisma.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM public._prisma_migrations`,
  ).toEqual([{ c: 0n }]);
  await prisma.user.createMany({
    data: [f.author, f.a, f.b].map((uid) => ({
      id: uid,
      username: uid,
      password: "fictional",
      role: uid === f.author ? "TRAINER" : "USER",
    })),
  });
  seeded = true;
  // The 173-table archived production-shaped schema omits Course.version.
  // This INSERT uses ONLY actual archived columns; no ALTER/migration/mapper workaround.
  await prisma.$executeRaw`
    INSERT INTO public."Course" ("id","name","type","authorId",
      "trainingLevel","duration","logoImg","isPaid","isPrivate","isPersonalized",
      "description","equipment","updatedAt")
    VALUES (${f.course},'Fictional free training',${f.courseType},${f.author},
      'BEGINNER','1 day','',false,false,false,'Fictional free course', 'Harness',CURRENT_TIMESTAMP)
  `;
  await prisma.trainingDay.create({
    data: {
      id: f.day,
      title: "Fictional day",
      authorId: f.author,
      description: "Fictional read-only day",
      equipment: "Harness",
      showCoursePathExport: true,
    },
  });
  await prisma.dayOnCourse.create({
    data: { id: f.dayLink, courseId: f.course, dayId: f.day, order: 1 },
  });
  await prisma.step.createMany({
    data: [
      {
        id: f.step0,
        authorId: f.author,
        title: "First exercise",
        description: "Plain fictional step",
        type: "TRAINING",
        durationSec: 90,
        estimatedDurationSec: 90,
        videoUrl: null,
        imageUrls: [],
        pdfUrls: [],
      },
      {
        id: f.step1,
        authorId: f.author,
        title: "Theory follow-up",
        description: "Second plain step",
        type: "THEORY",
        durationSec: 0,
        estimatedDurationSec: 0,
        videoUrl: null,
        imageUrls: [],
        pdfUrls: [],
      },
    ],
  });
  await prisma.stepOnDay.createMany({
    data: [
      { id: f.link1, stepId: f.step1, dayId: f.day, order: 1 },
      { id: f.link0, stepId: f.step0, dayId: f.day, order: 0 },
    ],
  });
  // Progress is PREEXISTING. GET read-only must never backfill the second occurrence.
  await prisma.userTraining.create({
    data: { id: f.userTraining, userId: f.a, dayOnCourseId: f.dayLink, status: "IN_PROGRESS" },
  });
  await prisma.userStep.create({
    data: {
      id: f.userStep,
      userTrainingId: f.userTraining,
      stepOnDayId: f.link0,
      status: "COMPLETED",
      createdAt: stamp,
      updatedAt: stamp,
    },
  });
}, 45000);
afterAll(async () => {
  try {
    await guard();
    if (seeded) {
      await prisma.userStep.deleteMany({ where: { id: f.userStep } });
      await prisma.userTraining.deleteMany({ where: { id: f.userTraining } });
      await prisma.stepOnDay.deleteMany({ where: { id: { in: [f.link0, f.link1] } } });
      await prisma.dayOnCourse.deleteMany({ where: { id: f.dayLink } });
      await prisma.step.deleteMany({ where: { id: { in: [f.step0, f.step1] } } });
      await prisma.trainingDay.deleteMany({ where: { id: f.day } });
      await prisma.course.deleteMany({ where: { id: f.course } });
      await prisma.user.deleteMany({ where: { id: { in: [f.author, f.a, f.b] } } });
    }
    expect(await counts()).toEqual({ userTrainings: 0, userSteps: 0, courses: 0, dayLinks: 0 });
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.step.count()).toBe(0);
    expect(
      await prisma.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM public._prisma_migrations`,
    ).toEqual([{ c: 0n }]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

describe("LEARN032 original registered ordinary Training READ via current application and PG18", () => {
  it("current registered /days renders canonical list on free public production-shaped SQL", async () => {
    const r = await get(daysQuery);
    expect(r.status).toBe(200);
    const j = await r.json();
    only(j, ["success", "data"]);
    only(j.data, listFields);
    expect(j.data).toMatchObject({
      courseId: f.course,
      courseDescription: "Fictional free course",
      courseVideoUrl: null,
      courseEquipment: "Harness",
      courseTrainingLevel: "BEGINNER",
      courseIsPersonalized: false,
      userCoursePersonalization: null,
    });
    expect(j.data.trainingDays).toHaveLength(1);
    only(j.data.trainingDays[0], dayItemFields);
    // Original Training list projects the DayOnCourse occurrence ID in BOTH ID slots.
    // Unlike /training/day detail, this established wire does not expose the raw Day ID.
    expect(j.data.trainingDays[0]).toMatchObject({
      trainingDayId: f.dayLink,
      dayOnCourseId: f.dayLink,
      courseId: f.course,
      title: "Fictional day",
      isLocked: false,
    });
    expect(await counts()).toEqual({ userTrainings: 1, userSteps: 1, courses: 1, dayLinks: 1 });
  });
  it("current registered /day read-only uses original StepOnDay IDs, statuses/nulls and exact wire", async () => {
    const r = await get(dayQuery);
    expect(r.status).toBe(200);
    const j = await r.json();
    only(j, ["success", "data"]);
    only(j.data, detailFields);
    expect(j.data).toMatchObject({
      trainingDayId: f.day,
      dayOnCourseId: f.dayLink,
      courseId: f.course,
      title: "Fictional day",
      duration: "1 day",
      displayDayNumber: 1,
      userStatus: "IN_PROGRESS",
      showCoursePathExport: true,
    });
    expect(j.data.steps).toHaveLength(2);
    for (const item of j.data.steps) {
      expect(Object.keys(item).every((k: string) => stepFields.includes(k))).toBe(true);
      for (const must of [
        "id",
        "title",
        "description",
        "status",
        "order",
        "locked",
        "isPausedOnServer",
      ]) {
        expect(Object.hasOwn(item, must)).toBe(true);
      }
      expect(item.locked).toBe(false);
      expect(item.videoUrl).toBe("");
    }
    expect(j.data.steps[0]).toMatchObject({
      id: f.step0,
      userStepId: f.userStep,
      order: 0,
      status: "COMPLETED",
      isPausedOnServer: false,
    });
    expect(j.data.steps[1]).toMatchObject({ id: f.step1, order: 1, status: "NOT_STARTED" });
    expect(j.data.steps[1]).not.toHaveProperty("userStepId");
    expect(j.data.steps[1]).not.toHaveProperty("remainingSecOnServer");
    expect(j.data.steps[0]).not.toHaveProperty("completedAt");
    expect(await counts()).toEqual({ userTrainings: 1, userSteps: 1, courses: 1, dayLinks: 1 });
  });
  it("second user has same free course but no progress created; existing canonical null list", async () => {
    const days = await get(daysQuery, f.b);
    expect(days.status).toBe(200);
    const list = await days.json();
    expect(list.data.trainingDays).toHaveLength(1);
    expect(list.data.trainingDays[0].userStatus).toBe("NOT_STARTED");
    const day = await get(dayQuery, f.b);
    expect(day.status).toBe(200);
    const detail = await day.json();
    expect(detail.data.userStatus).toBe("NOT_STARTED");
    expect(detail.data.steps.map((s: { status: string }) => s.status)).toEqual([
      "NOT_STARTED",
      "NOT_STARTED",
    ]);
    for (const s of detail.data.steps) expect(s).not.toHaveProperty("userStepId");
    const absent = await get("days?type=fictional_nonexistent_type");
    expect(absent.status).toBe(200);
    expect((await absent.json()).data).toEqual({
      trainingDays: [],
      courseDescription: null,
      courseId: null,
      courseVideoUrl: null,
      courseEquipment: null,
      courseTrainingLevel: null,
      courseIsPersonalized: false,
      userCoursePersonalization: null,
    });
    expect(await counts()).toEqual({ userTrainings: 1, userSteps: 1, courses: 1, dayLinks: 1 });
  });
  it("no media/notification/CDN calls or GET writes", async () => {
    expect(await prisma.stepOnDay.count()).toBe(2);
    expect(await prisma.userStep.count()).toBe(1);
    for (const fn of Object.values(denied)) expect(fn).not.toHaveBeenCalled();
  });
});
