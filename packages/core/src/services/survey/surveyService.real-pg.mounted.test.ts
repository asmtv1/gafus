/** AG1 LEARN032: original survey submit with REAL Prisma transaction on own PG18. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { submitSurveyResponse } from "./surveyService";

// Never run an unused trainer Course.version/cache/media writer; target survey
// Core, actual public-free course authorization and Prisma are NOT mocked.
const forbiddenTrainer = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("NO_TRAINER_WRITES");
  }),
);
vi.mock("../trainerCourse/courseVersionService", () => ({
  setCourseLogoVersioned: forbiddenTrainer,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const database = "gafus_refactor_survey_tx_ag1_20261024";
const dataDir =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_learn032_survey_tx_20261024";
const prefix = "ag1_survey_tx_20261024_";
const id = (suffix: string) => prefix + suffix;
const F = {
  trainer: id("trainer"),
  a: id("actor_a"),
  b: id("actor_b"),
  course: id("course"),
  day: id("day"),
  dayLink: id("day_link"),
  survey: id("survey_step"),
  other: id("other_step"),
  surveyLink: id("survey_link"),
  otherLink: id("other_link"),
  trainingA: id("training_a"),
  trainingB: id("training_b"),
  userSurveyA: id("survey_a"),
  userOtherA: id("other_a"),
  userSurveyB: id("survey_b"),
  userOtherB: id("other_b"),
};
const actors = [F.trainer, F.a, F.b];
const stepIds = [F.survey, F.other];
const stepLinkIds = [F.surveyLink, F.otherLink];
const trainingIds = [F.trainingA, F.trainingB];
const userStepIds = [F.userSurveyA, F.userOtherA, F.userSurveyB, F.userOtherB];
const input = (actor = F.a, stepId = F.userSurveyA) => ({
  courseId: F.course,
  stepId: F.survey,
  userStepId: stepId,
  surveySlug: "dog-home-alone-initial",
  answers: { concern: `Fictional response ${actor}` },
});
let seeded = false;

async function verifyOwn() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.G1_AG1_SURVEY_TX_PG18).toBe("1");
  expect([
    url.protocol,
    url.hostname,
    url.port,
    url.pathname,
    url.searchParams.get("host"),
    url.searchParams.get("application_name"),
    url.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${database}`, socket, appTag, ""]);
  const rows = await prisma.$queryRaw<
    {
      db: boolean;
      version: boolean;
      dataDir: boolean;
      noTcp: boolean;
      socket: boolean;
      others: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${dataDir} AS "dataDir",
      current_setting('listen_addresses')='' AS "noTcp",
      current_setting('unix_socket_directories')=${socket} AS socket,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
          OR application_name IS DISTINCT FROM ${appTag})) AS others
  `;
  expect(rows).toEqual([
    { db: true, version: true, dataDir: true, noTcp: true, socket: true, others: 0n },
  ]);
}
const training = async (name = F.trainingA) =>
  prisma.userTraining.findUnique({
    where: { id: name },
    include: { steps: true },
  });
const responses = () => prisma.surveyResponse.count({ where: { stepId: F.survey } });

beforeAll(async () => {
  await verifyOwn();
  const initial = await prisma.$queryRaw<
    { users: bigint; courses: bigint; responses: bigint; steps: bigint; ledger: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
      (SELECT count(*) FROM public."Course") AS courses,
      (SELECT count(*) FROM public."SurveyResponse") AS responses,
      (SELECT count(*) FROM public."UserStep") AS steps,
      (SELECT count(*) FROM public._prisma_migrations) AS ledger
  `;
  expect(initial).toEqual([{ users: 0n, courses: 0n, responses: 0n, steps: 0n, ledger: 0n }]);
  await prisma.user.createMany({
    data: actors.map((actor) => ({ id: actor, username: actor, password: "fictional-only" })),
  });
  seeded = true;
  // Only fixture Course uses actual production archive columns, no Course.version.
  await prisma.$executeRaw`
    INSERT INTO public."Course"("id","name","type","trainingLevel","duration",
      "logoImg","authorId","updatedAt")
    VALUES(${F.course},'Fictional survey course','ag1_survey_tx_course',
      'BEGINNER'::"TrainingLevel",'10 min','fictional-no-media',${F.trainer},CURRENT_TIMESTAMP)
  `;
  await prisma.trainingDay.create({
    data: { id: F.day, title: "Fictional survey day", authorId: F.trainer },
  });
  await prisma.dayOnCourse.create({
    data: { id: F.dayLink, courseId: F.course, dayId: F.day, order: 0 },
  });
  await prisma.step.createMany({
    data: [
      {
        id: F.survey,
        authorId: F.trainer,
        title: "Fictional survey",
        type: "SURVEY",
        surveySlug: "dog-home-alone-initial",
      },
      { id: F.other, authorId: F.trainer, title: "Fictional practice", type: "PRACTICE" },
    ],
  });
  await prisma.stepOnDay.createMany({
    data: [
      { id: F.surveyLink, dayId: F.day, stepId: F.survey, order: 0 },
      { id: F.otherLink, dayId: F.day, stepId: F.other, order: 1 },
    ],
  });
  await prisma.userTraining.createMany({
    data: [
      { id: F.trainingA, userId: F.a, dayOnCourseId: F.dayLink, status: "IN_PROGRESS" },
      { id: F.trainingB, userId: F.b, dayOnCourseId: F.dayLink, status: "IN_PROGRESS" },
    ],
  });
  await prisma.userStep.createMany({
    data: [
      {
        id: F.userSurveyA,
        userTrainingId: F.trainingA,
        stepOnDayId: F.surveyLink,
        status: "NOT_STARTED",
      },
      {
        id: F.userOtherA,
        userTrainingId: F.trainingA,
        stepOnDayId: F.otherLink,
        status: "COMPLETED",
      },
      {
        id: F.userSurveyB,
        userTrainingId: F.trainingB,
        stepOnDayId: F.surveyLink,
        status: "NOT_STARTED",
      },
      {
        id: F.userOtherB,
        userTrainingId: F.trainingB,
        stepOnDayId: F.otherLink,
        status: "COMPLETED",
      },
    ],
  });
}, 45000);

beforeEach(async () => {
  await verifyOwn();
  await prisma.surveyResponse.deleteMany({ where: { stepId: F.survey, userId: { in: actors } } });
  await prisma.userStep.updateMany({
    where: { id: { in: [F.userSurveyA, F.userSurveyB] } },
    data: { status: "NOT_STARTED" },
  });
  await prisma.userStep.updateMany({
    where: { id: { in: [F.userOtherA, F.userOtherB] } },
    data: { status: "COMPLETED" },
  });
  await prisma.userTraining.updateMany({
    where: { id: { in: trainingIds } },
    data: { status: "IN_PROGRESS" },
  });
}, 30000);

afterEach(async () => {
  await verifyOwn();
}, 30000);

afterAll(async () => {
  try {
    await verifyOwn();
    if (seeded) {
      await prisma.surveyResponse.deleteMany({
        where: { stepId: F.survey, userId: { in: actors } },
      });
      await prisma.userStep.deleteMany({ where: { id: { in: userStepIds } } });
      await prisma.userTraining.deleteMany({ where: { id: { in: trainingIds } } });
      await prisma.stepOnDay.deleteMany({ where: { id: { in: stepLinkIds } } });
      await prisma.step.deleteMany({ where: { id: { in: stepIds } } });
      await prisma.dayOnCourse.deleteMany({ where: { id: F.dayLink } });
      await prisma.trainingDay.deleteMany({ where: { id: F.day } });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE id=${F.course}`;
      await prisma.user.deleteMany({ where: { id: { in: actors } } });
    }
    const rows = await prisma.$queryRaw<
      {
        users: bigint;
        courses: bigint;
        responses: bigint;
        trainings: bigint;
        steps: bigint;
        ledger: bigint;
      }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS users,
        (SELECT count(*) FROM public."Course") AS courses,
        (SELECT count(*) FROM public."SurveyResponse") AS responses,
        (SELECT count(*) FROM public."UserTraining") AS trainings,
        (SELECT count(*) FROM public."UserStep") AS steps,
        (SELECT count(*) FROM public._prisma_migrations) AS ledger
    `;
    expect(rows).toEqual([
      { users: 0n, courses: 0n, responses: 0n, trainings: 0n, steps: 0n, ledger: 0n },
    ]);
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

describe("LEARN032 real Core Survey submit completion in one SQL transaction", () => {
  it("last survey step: response + step + day become COMPLETED atomically, actor B untouched", async () => {
    const result = await submitSurveyResponse(F.a, input());
    expect(result.success).toBe(true);
    expect(result.response?.answers).toEqual(input().answers);
    expect(await responses()).toBe(1);
    const a = await training();
    expect(a?.steps.find((s) => s.id === F.userSurveyA)?.status).toBe("COMPLETED");
    expect(a?.steps.find((s) => s.id === F.userOtherA)?.status).toBe("COMPLETED");
    expect(a?.status).toBe("COMPLETED");
    expect((await training(F.trainingB))?.status).toBe("IN_PROGRESS");
    expect(await prisma.surveyResponse.count({ where: { userId: F.b } })).toBe(0);
  });
  it("unfinished sibling step keeps day IN_PROGRESS and does not touch actor B", async () => {
    await prisma.userStep.update({ where: { id: F.userOtherA }, data: { status: "NOT_STARTED" } });
    const result = await submitSurveyResponse(F.a, input());
    expect(result.success).toBe(true);
    expect((await training())?.status).toBe("IN_PROGRESS");
    expect((await training())?.steps.find((s) => s.id === F.userSurveyA)?.status).toBe("COMPLETED");
    expect((await training(F.trainingB))?.status).toBe("IN_PROGRESS");
    expect(await responses()).toBe(1);
  });
  it("real SQL FK rejection rolls back survey creation, without step/day changes", async () => {
    const result = await submitSurveyResponse(F.a, { ...input(), petId: id("unknown_pet") });
    expect(result).toMatchObject({ success: false, code: "SURVEY_SUBMIT_FAILED" });
    expect(await responses()).toBe(0);
    const a = await training();
    expect(a?.status).toBe("IN_PROGRESS");
    expect(a?.steps.find((s) => s.id === F.userSurveyA)?.status).toBe("NOT_STARTED");
    expect((await training(F.trainingB))?.status).toBe("IN_PROGRESS");
  });
  it("existing answer edit window and retry update preserve row and completed day", async () => {
    const first = await submitSurveyResponse(F.a, input());
    expect(first.success).toBe(true);
    const updated = await submitSurveyResponse(F.a, {
      ...input(),
      answers: { concern: "New fictional answer" },
    });
    expect(updated.success).toBe(true);
    expect(updated.response?.id).toBe(first.response?.id);
    expect(updated.response?.answers).toEqual({ concern: "New fictional answer" });
    expect(await responses()).toBe(1);
    expect((await training())?.status).toBe("COMPLETED");
  });
});
