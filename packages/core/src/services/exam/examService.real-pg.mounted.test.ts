/** AG1-090: original Core getExamResult ordinary/daily + real owned PG18. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import type { ExamResultWire } from "../../../../types/src/data/exam";
import { createReadExamResultApplication } from "../../../../../apps/api/src/modules/exam/application/read-result";
import { getExamResult } from "./examService";

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
const parseLog = vi.hoisted(() => vi.fn());
vi.mock("@gafus/cdn-upload", () => ({
  deleteFileFromCDN: forbiddenMedia,
  getExamVideoPath: forbiddenMedia,
  getRelativePathFromCDNUrl: forbiddenMedia,
  uploadBufferToCDN: forbiddenMedia,
}));
vi.mock("../notifications/immediatePushService", () => ({
  sendImmediatePushNotification: forbiddenPush,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: parseLog, info: vi.fn(), warn: vi.fn(), success: vi.fn() }),
}));

const database = "gafus_refactor_exam_read_ag1_20261024";
const directory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const tag = "ag1_learn032_exam_read_20261024";
const ns = "ag1_exam_read_20261024_";
const id = (s: string) => ns + s;
const f = {
  author: id("trainer"),
  a: id("actor_a"),
  b: id("actor_b"),
  reviewer: id("reviewer"),
  noProfile: id("reviewer_no_profile"),
  course: id("course"),
  day: id("ordinary_day"),
  dayLink: id("ordinary_day_link"),
  step: id("exam_step"),
  stepLink: id("ordinary_step_link"),
  bundle: id("daily_bundle"),
  bundleLink: id("daily_bundle_link"),
  schedule: id("daily_schedule"),
  ta: id("ordinary_training_a"),
  tb: id("ordinary_training_b"),
  da: id("daily_training_a"),
  db: id("daily_training_b"),
  ordinaryValid: id("ordinary_valid"),
  ordinaryString: id("ordinary_string"),
  ordinaryMalformed: id("ordinary_malformed"),
  ordinaryMissing: id("ordinary_missing"),
  ordinaryNull: id("ordinary_null"),
  ordinaryB: id("ordinary_b"),
  dailyValid: id("daily_valid"),
  dailyMissing: id("daily_missing"),
  dailyB: id("daily_b"),
  examOrdinary: id("result_ordinary_valid"),
  examString: id("result_ordinary_string"),
  examMalformed: id("result_ordinary_malformed"),
  examNull: id("result_ordinary_null"),
  examB: id("result_ordinary_b"),
  examDaily: id("result_daily_valid"),
  examDailyB: id("result_daily_b"),
};
const actors = [f.author, f.a, f.b, f.reviewer, f.noProfile];
const ordinarySteps = [
  f.ordinaryValid,
  f.ordinaryString,
  f.ordinaryMalformed,
  f.ordinaryMissing,
  f.ordinaryNull,
  f.ordinaryB,
];
const dailySteps = [f.dailyValid, f.dailyMissing, f.dailyB];
// Real schema requires a separate link per StepOnDay order and unique learner
// (userTrainingId,stepOnDayId), likewise daily bundleStep uniqueness per training.
const ordinaryLinks = ordinarySteps.map((_, i) => id(`ordinary_step_link_${i}`));
const dailyLinks = dailySteps.map((_, i) => id(`daily_bundle_step_link_${i}`));
const results = [
  f.examOrdinary,
  f.examString,
  f.examMalformed,
  f.examNull,
  f.examB,
  f.examDaily,
  f.examDailyB,
];
const created = new Date("2026-10-22T08:15:00.000Z");
const updated = new Date("2026-10-23T15:30:00.000Z");
const reviewed = new Date("2026-10-24T07:40:00.000Z");
const read = createReadExamResultApplication({ readResult: getExamResult });
let seeded = false;

async function guard() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_EXAM_RESULT_OWN_PG18).toBe("1");
  expect([
    url.protocol,
    url.hostname,
    url.port,
    url.pathname,
    url.searchParams.get("host"),
    url.searchParams.get("application_name"),
    url.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, tag, ""]);
  const info = await prisma.$queryRaw<
    { db: boolean; ver: boolean; dir: boolean; sock: boolean; noTcp: boolean; outsiders: bigint }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS ver,
      current_setting('data_directory')=${directory} AS dir,
      current_setting('unix_socket_directories')=${socket} AS sock,
      current_setting('listen_addresses')='' AS "noTcp",
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
       AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
        OR application_name IS DISTINCT FROM ${tag})) AS outsiders
  `;
  expect(info).toEqual([
    { db: true, ver: true, dir: true, sock: true, noTcp: true, outsiders: 0n },
  ]);
}

beforeAll(async () => {
  await guard();
  const zero = await prisma.$queryRaw<{ u: bigint; e: bigint; s: bigint; d: bigint; m: bigint }[]>`
    SELECT (SELECT count(*) FROM public."User") AS u,
      (SELECT count(*) FROM public."ExamResult") AS e,
      (SELECT count(*) FROM public."UserStep") AS s,
      (SELECT count(*) FROM public."DailyCourseUserStep") AS d,
      (SELECT count(*) FROM public._prisma_migrations) AS m
  `;
  expect(zero).toEqual([{ u: 0n, e: 0n, s: 0n, d: 0n, m: 0n }]);
  await prisma.user.createMany({
    data: actors.map((u) => ({ id: u, username: u, password: "fictional-local-only" })),
  });
  seeded = true;
  await prisma.userProfile.create({
    data: { id: id("reviewer_profile"), userId: f.reviewer, fullName: "Fictional Exam Reviewer" },
  });
  // Archive schema lacks Course.version; fixture uses only existing columns,
  // parameterized SQL, no Core query, ALTER, custom trigger or migration.
  await prisma.$executeRaw`
    INSERT INTO public."Course" ("id","name","type","trainingLevel","duration",
      "logoImg","authorId","updatedAt")
    VALUES (${f.course},'Fictional read-only exam course','ag1_exam_read_sql',
      'BEGINNER'::"TrainingLevel",'10 min','fictional-no-media',${f.author},CURRENT_TIMESTAMP)
  `;
  await prisma.trainingDay.create({
    data: { id: f.day, title: "Fictional exam day", authorId: f.author },
  });
  await prisma.dayOnCourse.create({
    data: { id: f.dayLink, dayId: f.day, courseId: f.course, order: 0 },
  });
  await prisma.step.create({
    data: { id: f.step, title: "Fictional examination", type: "EXAMINATION", authorId: f.author },
  });
  await prisma.stepOnDay.createMany({
    data: ordinaryLinks.map((link, i) => ({ id: link, dayId: f.day, stepId: f.step, order: i })),
  });
  await prisma.userTraining.createMany({
    data: [
      { id: f.ta, userId: f.a, dayOnCourseId: f.dayLink, status: "IN_PROGRESS" },
      { id: f.tb, userId: f.b, dayOnCourseId: f.dayLink, status: "IN_PROGRESS" },
    ],
  });
  await prisma.userStep.createMany({
    data: ordinarySteps.map((s, i) => ({
      id: s,
      userTrainingId: i === ordinarySteps.length - 1 ? f.tb : f.ta,
      stepOnDayId: ordinaryLinks[i]!,
      status: "COMPLETED",
    })),
  });
  await prisma.dailyCourseBundle.create({
    data: { id: f.bundle, title: "Fictional exam bundle", authorId: f.author },
  });
  await prisma.dailyCourseBundleStep.createMany({
    data: dailyLinks.map((link, i) => ({ id: link, bundleId: f.bundle, stepId: f.step, order: i })),
  });
  await prisma.dailyCourseSchedule.create({
    data: {
      id: f.schedule,
      bundleId: f.bundle,
      date: new Date("2026-10-24T00:00:00.000Z"),
      createdById: f.author,
      isPublished: true,
    },
  });
  await prisma.dailyCourseUserTraining.createMany({
    data: [
      { id: f.da, userId: f.a, scheduleId: f.schedule, status: "IN_PROGRESS" },
      { id: f.db, userId: f.b, scheduleId: f.schedule, status: "IN_PROGRESS" },
    ],
  });
  await prisma.dailyCourseUserStep.createMany({
    data: dailySteps.map((step, i) => ({
      id: step,
      dailyCourseUserTrainingId: i === dailySteps.length - 1 ? f.db : f.da,
      bundleStepId: dailyLinks[i]!,
      status: "COMPLETED",
    })),
  });
  const basic = {
    stepId: f.step,
    testScore: null,
    testMaxScore: null,
    videoReportUrl: null,
    writtenFeedback: null,
    overallScore: null,
    isPassed: null,
    trainerComment: null,
    reviewedAt: null,
    reviewedById: null,
    createdAt: created,
    updatedAt: updated,
  };
  await prisma.examResult.createMany({
    data: [
      {
        ...basic,
        id: f.examOrdinary,
        userStepId: f.ordinaryValid,
        testAnswers: { q1: 0, q2: 2 },
        testScore: 2,
        testMaxScore: 2,
        overallScore: 100,
        isPassed: true,
        videoReportUrl: "opaque-fictional://no-fetch/video",
        writtenFeedback: "Fictional feedback",
        reviewedAt: reviewed,
        reviewedById: f.reviewer,
      },
      {
        ...basic,
        id: f.examString,
        userStepId: f.ordinaryString,
        testAnswers: '{"q7":3}',
        reviewedById: f.noProfile,
      },
      { ...basic, id: f.examMalformed, userStepId: f.ordinaryMalformed, testAnswers: '{"broken":' },
      { ...basic, id: f.examNull, userStepId: f.ordinaryNull, testAnswers: null },
      { ...basic, id: f.examB, userStepId: f.ordinaryB, testAnswers: { qB: 1 } },
      {
        ...basic,
        id: f.examDaily,
        dailyCourseUserStepId: f.dailyValid,
        testAnswers: { daily: 0 },
        reviewedAt: reviewed,
        reviewedById: f.noProfile,
      },
      { ...basic, id: f.examDailyB, dailyCourseUserStepId: f.dailyB, testAnswers: { dailyB: 2 } },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await guard();
    if (seeded) {
      await prisma.examResult.deleteMany({ where: { id: { in: results } } });
      await prisma.dailyCourseUserStep.deleteMany({ where: { id: { in: dailySteps } } });
      await prisma.dailyCourseUserTraining.deleteMany({ where: { id: { in: [f.da, f.db] } } });
      await prisma.dailyCourseSchedule.deleteMany({ where: { id: f.schedule } });
      await prisma.dailyCourseBundleStep.deleteMany({ where: { id: { in: dailyLinks } } });
      await prisma.dailyCourseBundle.deleteMany({ where: { id: f.bundle } });
      await prisma.userStep.deleteMany({ where: { id: { in: ordinarySteps } } });
      await prisma.userTraining.deleteMany({ where: { id: { in: [f.ta, f.tb] } } });
      await prisma.stepOnDay.deleteMany({ where: { id: { in: ordinaryLinks } } });
      await prisma.step.deleteMany({ where: { id: f.step } });
      await prisma.dayOnCourse.deleteMany({ where: { id: f.dayLink } });
      await prisma.trainingDay.deleteMany({ where: { id: f.day } });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE id=${f.course}`;
      await prisma.userProfile.deleteMany({ where: { userId: f.reviewer } });
      await prisma.user.deleteMany({ where: { id: { in: actors } } });
    }
    const zero = await prisma.$queryRaw<
      { u: bigint; c: bigint; e: bigint; s: bigint; d: bigint; dl: bigint; m: bigint }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS u,
        (SELECT count(*) FROM public."Course") AS c,
        (SELECT count(*) FROM public."ExamResult") AS e,
        (SELECT count(*) FROM public."UserStep") AS s,
        (SELECT count(*) FROM public."DailyCourseUserStep") AS d,
        (SELECT count(*) FROM public."DailyCourseUserTraining") AS dl,
        (SELECT count(*) FROM public._prisma_migrations) AS m
    `;
    expect(zero).toEqual([{ u: 0n, c: 0n, e: 0n, s: 0n, d: 0n, dl: 0n, m: 0n }]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

const result = (actor: string, step: string) =>
  read.execute({ actorUserId: actor, userStepId: step });
const toWire = (value: NonNullable<Awaited<ReturnType<typeof getExamResult>>>) =>
  JSON.parse(JSON.stringify(value)) as ExamResultWire;
const keys = [
  "id",
  "testAnswers",
  "testScore",
  "testMaxScore",
  "videoReportUrl",
  "writtenFeedback",
  "overallScore",
  "isPassed",
  "trainerComment",
  "reviewedAt",
  "reviewedById",
  "reviewedBy",
  "createdAt",
  "updatedAt",
];

describe("AG1 real original Core exam result ordinary/daily ownership+projection", () => {
  it("ordinary owned result: exact selected fields, real reviewer profile and Date→ISO wire", async () => {
    const value = await result(f.a, f.ordinaryValid);
    expect(value).not.toBeNull();
    if (!value) throw Error("EXPECTED_OWNED_ORDINARY");
    expect(value.id).toBe(f.examOrdinary);
    expect(value.testAnswers).toEqual({ q1: 0, q2: 2 });
    expect(value.testScore).toBe(2);
    expect(value.videoReportUrl).toBe("opaque-fictional://no-fetch/video");
    expect(value.reviewedBy).toEqual({
      username: f.reviewer,
      profile: { fullName: "Fictional Exam Reviewer" },
    });
    expect(value.reviewedAt).toBeInstanceOf(Date);
    expect(value.createdAt).toBeInstanceOf(Date);
    expect(value.updatedAt).toBeInstanceOf(Date);
    const wire = toWire(value);
    expect(Object.keys(wire).sort()).toEqual([...keys].sort());
    expect(wire.reviewedAt).toBe(reviewed.toISOString());
    expect(wire.createdAt).toBe(created.toISOString());
    expect(wire.updatedAt).toBe(updated.toISOString());
    expect(wire.testAnswers).toEqual({ q1: 0, q2: 2 });
    expect(wire.videoReportUrl).toBe("opaque-fictional://no-fetch/video");
  });
  it("daily fallback owned result: real DailyCourseUserStep ownership, reviewer profile null", async () => {
    const value = await result(f.a, f.dailyValid);
    expect(value).not.toBeNull();
    if (!value) throw Error("EXPECTED_OWNED_DAILY");
    expect(value.id).toBe(f.examDaily);
    expect(value.testAnswers).toEqual({ daily: 0 });
    expect(value.reviewedAt).toBeInstanceOf(Date);
    expect(value.reviewedBy).toEqual({ username: f.noProfile, profile: null });
    const wire = toWire(value);
    expect(Object.keys(wire).sort()).toEqual([...keys].sort());
    expect(wire.reviewedAt).toBe(reviewed.toISOString());
    expect(wire.reviewedBy).toEqual({ username: f.noProfile, profile: null });
    expect(wire.videoReportUrl).toBeNull();
  });
  it("A/B owned ordinary/daily rows isolated, missing owned/unknown IDs return null", async () => {
    expect(await result(f.b, f.ordinaryValid)).toBeNull();
    expect(await result(f.a, f.ordinaryB)).toBeNull();
    expect(await result(f.b, f.dailyValid)).toBeNull();
    expect(await result(f.a, f.dailyB)).toBeNull();
    expect(await result(f.a, f.ordinaryMissing)).toBeNull();
    expect(await result(f.a, f.dailyMissing)).toBeNull();
    expect(await result(f.a, id("absent-user-step"))).toBeNull();
    expect((await result(f.b, f.ordinaryB))?.id).toBe(f.examB);
    expect((await result(f.b, f.dailyB))?.id).toBe(f.examDailyB);
    expect((await result(f.b, f.dailyB))?.reviewedBy).toBeNull();
  });
  it("existing parse behavior: valid JSON string, null, malformed stored string→null", async () => {
    const valid = await result(f.a, f.ordinaryString);
    expect(valid?.testAnswers).toEqual({ q7: 3 });
    expect(valid?.reviewedBy).toEqual({ username: f.noProfile, profile: null });
    expect(valid?.reviewedAt).toBeNull();
    expect(toWire(valid!).reviewedAt).toBeNull();
    expect((await result(f.a, f.ordinaryNull))?.testAnswers).toBeNull();
    const before = parseLog.mock.calls.length;
    const malformed = await result(f.a, f.ordinaryMalformed);
    expect(malformed?.testAnswers).toBeNull();
    expect(parseLog.mock.calls.length).toBe(before + 1);
    expect(String(parseLog.mock.calls.at(-1)?.[0])).toContain("testAnswers");
    expect(forbiddenMedia).not.toHaveBeenCalled();
    expect(forbiddenPush).not.toHaveBeenCalled();
  });
});
