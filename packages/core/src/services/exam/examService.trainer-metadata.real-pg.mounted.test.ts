/** AG1-001: existing Trainer Exam metadata composition -> real Core Prisma -> owned PG18. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { readTrainerExamMetadataApplication } from "../../../../../apps/api/src/modules/trainer-exam/composition/read-trainer-exam-metadata";
import { getPendingExamCount } from "./examService";

const forbiddenMedia = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("MEDIA_MUST_NOT_RUN");
  }),
);
const forbiddenPush = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("PUSH_MUST_NOT_RUN");
  }),
);
vi.mock("@gafus/cdn-upload", () => ({
  deleteFileFromCDN: forbiddenMedia,
  getExamVideoPath: forbiddenMedia,
  getRelativePathFromCDNUrl: forbiddenMedia,
  uploadBufferToCDN: forbiddenMedia,
}));
vi.mock("../notifications/immediatePushService", () => ({
  sendImmediatePushNotification: forbiddenPush,
}));

const database = "gafus_refactor_trainer_exam_meta_ag1_20261024";
const dir =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const tag = "ag1_trainer_exam_metadata_sql_20261024";
const ns = "ag1_trainer_exam_meta_20261024_";
const id = (x: string) => ns + x;
const f = {
  authorA: id("author_a"),
  authorB: id("author_b"),
  empty: id("author_empty"),
  studentA: id("student_a"),
  studentB: id("student_b"),
  courseA: id("course_a"),
  courseB: id("course_b"),
  dayA: id("day_a"),
  dayB: id("day_b"),
  dayLinkA: id("day_link_a"),
  dayLinkB: id("day_link_b"),
  manualA: id("manual_a"),
  autoA: id("auto_a"),
  manualB: id("manual_b"),
  linkAManual1: id("link_a_manual_1"),
  linkAManual2: id("link_a_manual_2"),
  linkAAuto: id("link_a_auto"),
  linkBManual: id("link_b_manual"),
  trainingA: id("training_a"),
  trainingB: id("training_b"),
  stepAPending1: id("step_a_pending_1"),
  stepAPending2: id("step_a_pending_2"),
  stepAAuto: id("step_a_auto"),
  stepBPending: id("step_b_pending"),
  stepACompleted: id("step_a_completed"),
  linkACompleted: id("link_a_completed"),
  bundleA: id("bundle_a"),
  bundleStepA: id("bundle_step_a"),
  scheduleA: id("schedule_a"),
  dailyTrainingA: id("daily_training_a"),
  dailyStepA: id("daily_step_a"),
  resultAPending1: id("result_a_pending_1"),
  resultAPending2: id("result_a_pending_2"),
  resultAAuto: id("result_a_auto"),
  resultACompleted: id("result_a_completed"),
  resultBPending: id("result_b_pending"),
  resultADaily: id("result_a_daily"),
};
const users = [f.authorA, f.authorB, f.empty, f.studentA, f.studentB];
const regularSteps = [
  f.stepAPending1,
  f.stepAPending2,
  f.stepAAuto,
  f.stepBPending,
  f.stepACompleted,
];
const regularLinks = [f.linkAManual1, f.linkAManual2, f.linkAAuto, f.linkBManual, f.linkACompleted];
const results = [
  f.resultAPending1,
  f.resultAPending2,
  f.resultAAuto,
  f.resultACompleted,
  f.resultBPending,
  f.resultADaily,
];
const iso = (day: number) => new Date(`2026-10-${day}T10:00:00.000Z`);
const secret = "FICTIONAL_PRIVATE_EXAM_REPORT_MUST_NOT_RETURN";
let seeded = false;

async function guard() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_TRAINER_EXAM_OWN_PG18).toBe("1");
  expect([
    url.protocol,
    url.hostname,
    url.port,
    url.pathname,
    url.searchParams.get("host"),
    url.searchParams.get("application_name"),
    url.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, tag, ""]);
  const got = await prisma.$queryRaw<
    {
      db: boolean;
      version: boolean;
      dir: boolean;
      socket: boolean;
      unix: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${dir} AS dir,
      current_setting('unix_socket_directories')=${socket} AS socket,
      current_setting('listen_addresses')='' AS unix,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
          OR application_name IS DISTINCT FROM ${tag})) AS outsiders
  `;
  expect(got).toEqual([
    { db: true, version: true, dir: true, socket: true, unix: true, outsiders: 0n },
  ]);
}

beforeAll(async () => {
  await guard();
  const empty = await prisma.$queryRaw<
    { users: bigint; courses: bigint; results: bigint; migration: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."Course") AS courses,
      (SELECT count(*) FROM public."ExamResult") AS results,
      (SELECT count(*) FROM public._prisma_migrations) AS migration
  `;
  expect(empty).toEqual([{ users: 0n, courses: 0n, results: 0n, migration: 0n }]);
  seeded = true;
  await prisma.user.createMany({
    data: users.map((u) => ({ id: u, username: u, password: "fictional-local-only" })),
  });
  // Accepted schema-only archive does not have Course.version; use only real archived columns.
  await prisma.$executeRaw`
    INSERT INTO public."Course" ("id","name","type","trainingLevel","duration","logoImg","authorId","updatedAt")
    VALUES (${f.courseA},'Fictional A course','ag1_exam_type_a','BEGINNER'::"TrainingLevel",'10 min','fictional',${f.authorA},CURRENT_TIMESTAMP),
           (${f.courseB},'Fictional B course','ag1_exam_type_b','BEGINNER'::"TrainingLevel",'10 min','fictional',${f.authorB},CURRENT_TIMESTAMP)
  `;
  await prisma.trainingDay.createMany({
    data: [
      { id: f.dayA, title: "Fictional A day", authorId: f.authorA },
      { id: f.dayB, title: "Fictional B day", authorId: f.authorB },
    ],
  });
  await prisma.dayOnCourse.createMany({
    data: [
      { id: f.dayLinkA, dayId: f.dayA, courseId: f.courseA, order: 0 },
      { id: f.dayLinkB, dayId: f.dayB, courseId: f.courseB, order: 0 },
    ],
  });
  await prisma.step.createMany({
    data: [
      {
        id: f.manualA,
        title: "Fictional manual A",
        type: "EXAMINATION",
        authorId: f.authorA,
        requiresWrittenFeedback: true,
      },
      {
        id: f.autoA,
        title: "Fictional automatic A",
        type: "EXAMINATION",
        authorId: f.authorA,
        hasTestQuestions: true,
      },
      {
        id: f.manualB,
        title: "Fictional manual B",
        type: "EXAMINATION",
        authorId: f.authorB,
        requiresVideoReport: true,
      },
    ],
  });
  await prisma.stepOnDay.createMany({
    data: [
      { id: f.linkAManual1, dayId: f.dayA, stepId: f.manualA, order: 0 },
      { id: f.linkAManual2, dayId: f.dayA, stepId: f.manualA, order: 1 },
      { id: f.linkAAuto, dayId: f.dayA, stepId: f.autoA, order: 2 },
      { id: f.linkACompleted, dayId: f.dayA, stepId: f.manualA, order: 3 },
      { id: f.linkBManual, dayId: f.dayB, stepId: f.manualB, order: 0 },
    ],
  });
  await prisma.userTraining.createMany({
    data: [
      { id: f.trainingA, userId: f.studentA, dayOnCourseId: f.dayLinkA, status: "IN_PROGRESS" },
      { id: f.trainingB, userId: f.studentB, dayOnCourseId: f.dayLinkB, status: "IN_PROGRESS" },
    ],
  });
  await prisma.userStep.createMany({
    data: [
      {
        id: f.stepAPending1,
        userTrainingId: f.trainingA,
        stepOnDayId: f.linkAManual1,
        status: "IN_PROGRESS",
      },
      {
        id: f.stepAPending2,
        userTrainingId: f.trainingA,
        stepOnDayId: f.linkAManual2,
        status: "IN_PROGRESS",
      },
      {
        id: f.stepAAuto,
        userTrainingId: f.trainingA,
        stepOnDayId: f.linkAAuto,
        status: "IN_PROGRESS",
      },
      {
        id: f.stepACompleted,
        userTrainingId: f.trainingA,
        stepOnDayId: f.linkACompleted,
        status: "COMPLETED",
      },
      {
        id: f.stepBPending,
        userTrainingId: f.trainingB,
        stepOnDayId: f.linkBManual,
        status: "IN_PROGRESS",
      },
    ],
  });
  await prisma.dailyCourseBundle.create({
    data: { id: f.bundleA, title: "Fictional daily A", authorId: f.authorA },
  });
  await prisma.dailyCourseBundleStep.create({
    data: { id: f.bundleStepA, bundleId: f.bundleA, stepId: f.manualA, order: 0 },
  });
  await prisma.dailyCourseSchedule.create({
    data: {
      id: f.scheduleA,
      bundleId: f.bundleA,
      date: iso(24),
      createdById: f.authorA,
      isPublished: true,
    },
  });
  await prisma.dailyCourseUserTraining.create({
    data: {
      id: f.dailyTrainingA,
      userId: f.studentA,
      scheduleId: f.scheduleA,
      status: "IN_PROGRESS",
    },
  });
  await prisma.dailyCourseUserStep.create({
    data: {
      id: f.dailyStepA,
      dailyCourseUserTrainingId: f.dailyTrainingA,
      bundleStepId: f.bundleStepA,
      status: "IN_PROGRESS",
    },
  });
  const base = {
    testAnswers: null,
    testScore: null,
    testMaxScore: null,
    videoReportUrl: null,
    writtenFeedback: null,
    overallScore: null,
    isPassed: null,
    trainerComment: null,
    reviewedAt: null,
    reviewedById: null,
    updatedAt: iso(24),
  };
  await prisma.examResult.createMany({
    data: [
      {
        ...base,
        id: f.resultAPending1,
        userStepId: f.stepAPending1,
        stepId: f.manualA,
        createdAt: iso(24),
        writtenFeedback: secret,
      },
      {
        ...base,
        id: f.resultAPending2,
        userStepId: f.stepAPending2,
        stepId: f.manualA,
        createdAt: iso(23),
        testAnswers: { q: 2 },
        reviewedById: null,
      },
      {
        ...base,
        id: f.resultAAuto,
        userStepId: f.stepAAuto,
        stepId: f.autoA,
        createdAt: iso(22),
        testAnswers: { auto: 1 },
      },
      {
        ...base,
        id: f.resultACompleted,
        userStepId: f.stepACompleted,
        stepId: f.manualA,
        createdAt: iso(21),
        videoReportUrl: "opaque-fictional://must-not-fetch",
      },
      {
        ...base,
        id: f.resultBPending,
        userStepId: f.stepBPending,
        stepId: f.manualB,
        createdAt: iso(25),
        videoReportUrl: "opaque-fictional://must-not-fetch",
      },
      {
        ...base,
        id: f.resultADaily,
        dailyCourseUserStepId: f.dailyStepA,
        stepId: f.manualA,
        createdAt: iso(26),
      },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await guard();
    if (seeded) {
      await prisma.examResult.deleteMany({ where: { id: { in: results } } });
      await prisma.dailyCourseUserStep.deleteMany({ where: { id: f.dailyStepA } });
      await prisma.dailyCourseUserTraining.deleteMany({ where: { id: f.dailyTrainingA } });
      await prisma.dailyCourseSchedule.deleteMany({ where: { id: f.scheduleA } });
      await prisma.dailyCourseBundleStep.deleteMany({ where: { id: f.bundleStepA } });
      await prisma.dailyCourseBundle.deleteMany({ where: { id: f.bundleA } });
      await prisma.userStep.deleteMany({ where: { id: { in: regularSteps } } });
      await prisma.userTraining.deleteMany({ where: { id: { in: [f.trainingA, f.trainingB] } } });
      await prisma.stepOnDay.deleteMany({ where: { id: { in: regularLinks } } });
      await prisma.step.deleteMany({ where: { id: { in: [f.manualA, f.autoA, f.manualB] } } });
      await prisma.dayOnCourse.deleteMany({ where: { id: { in: [f.dayLinkA, f.dayLinkB] } } });
      await prisma.trainingDay.deleteMany({ where: { id: { in: [f.dayA, f.dayB] } } });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE id IN (${f.courseA},${f.courseB})`;
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    expect(
      await prisma.$queryRaw<
        { users: bigint; courses: bigint; results: bigint; migrations: bigint }[]
      >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."Course") AS courses,
        (SELECT count(*) FROM public."ExamResult") AS results,
        (SELECT count(*) FROM public._prisma_migrations) AS migrations
    `,
    ).toEqual([{ users: 0n, courses: 0n, results: 0n, migrations: 0n }]);
    expect(forbiddenMedia).not.toHaveBeenCalled();
    expect(forbiddenPush).not.toHaveBeenCalled();
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

const summary = (actorUserId: string, isAdmin = false) =>
  readTrainerExamMetadataApplication.summary({ actorUserId, isAdmin });
const pending = (actorUserId: string, isAdmin = false) =>
  readTrainerExamMetadataApplication.pendingSummary({ actorUserId, isAdmin });
const keysSummary = [
  "id",
  "createdAt",
  "courseName",
  "stepTitle",
  "status",
  "hasTestQuestions",
  "requiresWrittenFeedback",
  "requiresVideoReport",
];
const keysPending = [
  "id",
  "stepTitle",
  "courseName",
  "dayTitle",
  "hasTestQuestions",
  "hasWrittenFeedback",
  "hasVideoReport",
  "submittedAt",
];

describe("AG1 trainer exam original read composition + Prisma PG18", () => {
  it("empty owner gets empty summary/pending; no pagination is applied", async () => {
    expect(await summary(f.empty)).toEqual([]);
    expect(await pending(f.empty)).toEqual([]);
  });
  it("summary: real ordinary and daily author scope, status, stable projection, ISO dates", async () => {
    const a = await summary(f.authorA);
    expect(a.map((v) => v.id)).toEqual([
      f.resultADaily,
      f.resultAPending1,
      f.resultAPending2,
      f.resultAAuto,
      f.resultACompleted,
    ]);
    for (const row of a) {
      expect(Object.keys(row).sort()).toEqual([...keysSummary].sort());
      expect(row.createdAt).toMatch(/^2026-10-\d{2}T10:00:00\.000Z$/);
      expect(JSON.stringify(row)).not.toContain(secret);
      expect(JSON.stringify(row)).not.toContain("opaque-fictional");
      expect(JSON.stringify(row)).not.toContain(f.studentA);
    }
    expect(a[0]).toMatchObject({ status: "IN_PROGRESS", courseName: "Курс дня" });
    expect(a[1]).toMatchObject({
      status: "IN_PROGRESS",
      stepTitle: "Fictional manual A",
      hasTestQuestions: false,
      requiresWrittenFeedback: true,
      requiresVideoReport: false,
    });
    expect(a[3]).toMatchObject({ status: "IN_PROGRESS", hasTestQuestions: true });
    expect(a[4]).toMatchObject({ status: "COMPLETED" });
    expect((await summary(f.authorB)).map((v) => v.id)).toEqual([f.resultBPending]);
    expect((await summary(f.authorA, true)).map((v) => v.id)).toEqual([
      f.resultADaily,
      f.resultBPending,
      f.resultAPending1,
      f.resultAPending2,
      f.resultAAuto,
      f.resultACompleted,
    ]);
  });
  it("pending: real ordinary only; automatic-only/completed/daily excluded, whitelist and ISO", async () => {
    const a = await pending(f.authorA);
    expect(a.map((v) => v.id)).toEqual([f.resultAPending1, f.resultAPending2]);
    expect((await pending(f.authorB)).map((v) => v.id)).toEqual([f.resultBPending]);
    expect((await pending(f.authorA, true)).map((v) => v.id)).toEqual([
      f.resultBPending,
      f.resultAPending1,
      f.resultAPending2,
    ]);
    for (const row of a) {
      expect(Object.keys(row).sort()).toEqual([...keysPending].sort());
      expect(row.submittedAt).toMatch(/^2026-10-\d{2}T10:00:00\.000Z$/);
      expect(JSON.stringify(row)).not.toContain(secret);
      expect(JSON.stringify(row)).not.toContain("opaque-fictional");
      expect(JSON.stringify(row)).not.toContain(f.studentA);
    }
    expect(a[0]).toMatchObject({
      hasTestQuestions: false,
      hasWrittenFeedback: true,
      hasVideoReport: false,
      courseName: "Fictional A course",
      dayTitle: "Fictional A day",
    });
  });
  it("Core pendingCount includes daily; pending-summary is intentionally ordinary-only", async () => {
    expect(await getPendingExamCount(f.authorA, false)).toBe(3);
    expect(await getPendingExamCount(f.authorB, false)).toBe(1);
    expect(await getPendingExamCount(f.authorA, true)).toBe(4);
    expect(await getPendingExamCount(f.empty, false)).toBe(0);
    expect(await pending(f.authorA)).toHaveLength(2);
  });
});
