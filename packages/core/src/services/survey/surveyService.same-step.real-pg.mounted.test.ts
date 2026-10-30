/** AG1 original LEARN032: controlled concurrent real Prisma + private PG18 survey submissions. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";
import { submitSurveyResponse } from "./surveyService";

// Side-effect imports unrelated to the tested survey Core are fail-closed.
const forbiddenTrainer = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("FORBIDDEN_TRAINER_WRITE");
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

const db = "gafus_refactor_survey_same_step_ag1_20261024";
const dir =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const tag = "ag1_learn032_survey_same_step_20261024";
const p = "ag1_survey_same_step_20261024_";
const id = (s: string) => p + s;
const F = {
  author: id("trainer"),
  a: id("actor_a"),
  b: id("actor_b"),
  course: id("course"),
  dayA: id("day_a"),
  dayB: id("day_b"),
  linkA: id("course_day_a"),
  linkB: id("course_day_b"),
  initial: id("survey_initial"),
  final: id("survey_final"),
  aInitialLink: id("a_step_initial"),
  aFinalLink: id("a_step_final"),
  bInitialLink: id("b_step_initial"),
  trainingA: id("training_a"),
  trainingB: id("training_b"),
  aInitial: id("a_user_initial"),
  aFinal: id("a_user_final"),
  bInitial: id("b_user_initial"),
};
const users = [F.author, F.a, F.b];
const trainings = [F.trainingA, F.trainingB];
const steps = [F.initial, F.final];
const userSteps = [F.aInitial, F.aFinal, F.bInitial];
const links = [F.aInitialLink, F.aFinalLink, F.bInitialLink];
const input = (who: string, stepId: string, userStepId: string, slug: string, petId?: string) => ({
  courseId: F.course,
  stepId,
  userStepId,
  surveySlug: slug,
  answers: { concern: "Fictional concurrent answer" },
  ...(petId ? { petId } : {}),
});
const aInitial = (answer = "Fictional first answer") => ({
  ...input(F.a, F.initial, F.aInitial, "dog-home-alone-initial"),
  answers: { concern: answer },
});
const bInitial = () => input(F.b, F.initial, F.bInitial, "dog-home-alone-initial");
let seeded = false;

async function guard() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_SURVEY_SAME_STEP_OWN_PG18).toBe("1");
  expect([
    u.protocol,
    u.hostname,
    u.port,
    u.pathname,
    u.searchParams.get("host"),
    u.searchParams.get("application_name"),
    u.password,
  ]).toEqual(["postgresql:", "localhost", "55917", `/${db}`, socket, tag, ""]);
  const result = await prisma.$queryRaw<
    { own: boolean; version: boolean; data: boolean; unix: boolean; sock: boolean; other: bigint }[]
  >`
    SELECT current_database()=${db} AS own,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${dir} AS data,
      current_setting('listen_addresses')='' AS unix,
      current_setting('unix_socket_directories')=${socket} AS sock,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
       AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${db}
        OR application_name IS DISTINCT FROM ${tag})) AS other
  `;
  expect(result).toEqual([
    { own: true, version: true, data: true, unix: true, sock: true, other: 0n },
  ]);
}
async function countBlockedOnTraining() {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM pg_stat_activity WHERE datname=${db}
      AND application_name=${tag} AND backend_type='client backend'
      AND wait_event_type='Lock' AND query ILIKE '%UserTraining%'
  `;
  return Number(rows[0]?.n ?? 0n);
}
async function observedBlockedTwo() {
  // Poll *actual database wait state*, not a sleep-based assumption. Under 5s Prisma
  // transaction default timeout and lower than 10s suite timeout.
  const stop = performance.now() + 2600;
  while (performance.now() < stop) {
    const n = await countBlockedOnTraining();
    if (n >= 2) return n;
    await new Promise<void>((r) => setTimeout(r, 20));
  }
  throw Error("BARRIER_NOT_REACHED_BOTH_REAL_PARENT_UPDATES_NOT_WAITING");
}
const training = (uid: string) =>
  prisma.userTraining.findUnique({ where: { id: uid }, include: { steps: true } });

beforeAll(async () => {
  await guard();
  const empty = await prisma.$queryRaw<
    { users: bigint; trainings: bigint; surveys: bigint; ledger: bigint }[]
  >`
    SELECT (SELECT count(*) FROM public."User") AS users,
    (SELECT count(*) FROM public."UserTraining") AS trainings,
    (SELECT count(*) FROM public."SurveyResponse") AS surveys,
    (SELECT count(*) FROM public._prisma_migrations) AS ledger
  `;
  expect(empty).toEqual([{ users: 0n, trainings: 0n, surveys: 0n, ledger: 0n }]);
  await prisma.user.createMany({
    data: users.map((u) => ({ id: u, username: u, password: "fictional-only" })),
  });
  seeded = true;
  await prisma.$executeRaw`
    INSERT INTO public."Course"("id","name","type","trainingLevel","duration",
      "logoImg","authorId","updatedAt")
    VALUES(${F.course},'Fictional concurrent course','ag1_survey_same_step',
      'BEGINNER'::"TrainingLevel",'10 min','fictional-no-media',${F.author},CURRENT_TIMESTAMP)
  `;
  await prisma.trainingDay.createMany({
    data: [
      { id: F.dayA, authorId: F.author, title: "Fictional same day A" },
      { id: F.dayB, authorId: F.author, title: "Fictional independent day B" },
    ],
  });
  await prisma.dayOnCourse.createMany({
    data: [
      { id: F.linkA, dayId: F.dayA, courseId: F.course, order: 0 },
      { id: F.linkB, dayId: F.dayB, courseId: F.course, order: 1 },
    ],
  });
  await prisma.step.createMany({
    data: [
      {
        id: F.initial,
        authorId: F.author,
        title: "Fictional initial survey",
        type: "SURVEY",
        surveySlug: "dog-home-alone-initial",
      },
      {
        id: F.final,
        authorId: F.author,
        title: "Fictional final survey",
        type: "SURVEY",
        surveySlug: "dog-home-alone-final",
      },
    ],
  });
  await prisma.stepOnDay.createMany({
    data: [
      { id: F.aInitialLink, dayId: F.dayA, stepId: F.initial, order: 0 },
      { id: F.aFinalLink, dayId: F.dayA, stepId: F.final, order: 1 },
      { id: F.bInitialLink, dayId: F.dayB, stepId: F.initial, order: 0 },
    ],
  });
  await prisma.userTraining.createMany({
    data: [
      { id: F.trainingA, userId: F.a, dayOnCourseId: F.linkA, status: "NOT_STARTED" },
      { id: F.trainingB, userId: F.b, dayOnCourseId: F.linkB, status: "NOT_STARTED" },
    ],
  });
  await prisma.userStep.createMany({
    data: [
      {
        id: F.aInitial,
        userTrainingId: F.trainingA,
        stepOnDayId: F.aInitialLink,
        status: "NOT_STARTED",
      },
      {
        id: F.aFinal,
        userTrainingId: F.trainingA,
        stepOnDayId: F.aFinalLink,
        status: "NOT_STARTED",
      },
      {
        id: F.bInitial,
        userTrainingId: F.trainingB,
        stepOnDayId: F.bInitialLink,
        status: "NOT_STARTED",
      },
    ],
  });
}, 45000);

beforeEach(async () => {
  await guard();
  await prisma.surveyResponse.deleteMany({
    where: { userId: { in: [F.a, F.b] }, courseId: F.course },
  });
  await prisma.userStep.updateMany({
    where: { id: { in: userSteps } },
    data: { status: "NOT_STARTED" },
  });
  await prisma.userTraining.updateMany({
    where: { id: { in: trainings } },
    data: { status: "NOT_STARTED" },
  });
}, 30000);

afterAll(async () => {
  try {
    await guard();
    if (seeded) {
      await prisma.surveyResponse.deleteMany({
        where: { userId: { in: [F.a, F.b] }, courseId: F.course },
      });
      await prisma.userStep.deleteMany({ where: { id: { in: userSteps } } });
      await prisma.userTraining.deleteMany({ where: { id: { in: trainings } } });
      await prisma.stepOnDay.deleteMany({ where: { id: { in: links } } });
      await prisma.step.deleteMany({ where: { id: { in: steps } } });
      await prisma.dayOnCourse.deleteMany({ where: { id: { in: [F.linkA, F.linkB] } } });
      await prisma.trainingDay.deleteMany({ where: { id: { in: [F.dayA, F.dayB] } } });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE id=${F.course}`;
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    const zero = await prisma.$queryRaw<
      {
        user: bigint;
        course: bigint;
        training: bigint;
        step: bigint;
        response: bigint;
        ledger: bigint;
      }[]
    >`
      SELECT (SELECT count(*) FROM public."User") AS "user",
       (SELECT count(*) FROM public."Course") AS "course",
       (SELECT count(*) FROM public."UserTraining") AS "training",
       (SELECT count(*) FROM public."UserStep") AS "step",
       (SELECT count(*) FROM public."SurveyResponse") AS "response",
       (SELECT count(*) FROM public._prisma_migrations) AS "ledger"
    `;
    expect(zero).toEqual([
      { user: 0n, course: 0n, training: 0n, step: 0n, response: 0n, ledger: 0n },
    ]);
  } finally {
    await prisma.$disconnect();
    vi.useRealTimers();
  }
}, 45000);

describe("AG1 same-step Survey create and edit-window atomic real PostgreSQL", () => {
  it("two first submits wait for same parent: both succeed with one persistent ID and submittedAt", async () => {
    let release!: () => void;
    const signal = new Promise<void>((r) => {
      release = r;
    });
    let acquired!: () => void;
    const held = new Promise<void>((r) => {
      acquired = r;
    });
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM public."UserTraining" WHERE id=${F.trainingA} FOR UPDATE`;
        acquired();
        await signal;
      },
      { timeout: 15000, maxWait: 4000 },
    );
    await held;
    const finished: string[] = [];
    const one = submitSurveyResponse(F.a, aInitial("Answer one")).then((r) => {
      finished.push("one");
      return r;
    });
    const two = submitSurveyResponse(F.a, aInitial("Answer two")).then((r) => {
      finished.push("two");
      return r;
    });
    let blocked = 0;
    try {
      blocked = await observedBlockedTwo();
      expect((await submitSurveyResponse(F.b, bInitial())).success).toBe(true);
      expect((await training(F.trainingB))?.status).toBe("COMPLETED");
    } finally {
      release();
      await holder;
    }
    const [a, b] = await Promise.all([one, two]);
    expect(blocked).toBeGreaterThanOrEqual(2);
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(a.response?.id).toBe(b.response?.id);
    expect(a.response?.submittedAt).toBe(b.response?.submittedAt);
    const row = await prisma.surveyResponse.findUniqueOrThrow({
      where: { userId_stepId: { userId: F.a, stepId: F.initial } },
    });
    expect(await prisma.surveyResponse.count({ where: { userId: F.a, stepId: F.initial } })).toBe(
      1,
    );
    expect(row.id).toBe(a.response?.id);
    expect(row.submittedAt.toISOString()).toBe(a.response?.submittedAt);
    expect(finished).toHaveLength(2);
    expect(row.answers).toEqual({ concern: finished[1] === "one" ? "Answer one" : "Answer two" });
    expect((await training(F.trainingA))?.steps.find((s) => s.id === F.aInitial)?.status).toBe(
      "COMPLETED",
    );
    expect((await training(F.trainingA))?.status).toBe("IN_PROGRESS");
  }, 20000);

  it("editing pre-valid answer after parent wait crosses 24h: same original denial, no writes", async () => {
    const originalSubmitted = new Date("2026-10-23T12:00:00.000Z");
    const old = await prisma.surveyResponse.create({
      data: {
        userId: F.a,
        courseId: F.course,
        stepId: F.initial,
        petId: null,
        surveySlug: "dog-home-alone-initial",
        surveyFamilySlug: "dog-home-alone",
        phase: "INITIAL",
        surveyVersion: 1,
        answers: { concern: "Unchanged fictional older answer" },
        submittedAt: originalSubmitted,
      },
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T11:59:55.000Z"));
    let release!: () => void;
    const signal = new Promise<void>((r) => {
      release = r;
    });
    let acquired!: () => void;
    const held = new Promise<void>((r) => {
      acquired = r;
    });
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM public."UserTraining" WHERE id=${F.trainingA} FOR UPDATE`;
        acquired();
        await signal;
      },
      { timeout: 15000, maxWait: 4000 },
    );
    await held;
    const attempt = submitSurveyResponse(F.a, aInitial("Must not overwrite"));
    try {
      const stop = performance.now() + 2600;
      let blocked = false;
      while (performance.now() < stop) {
        if ((await countBlockedOnTraining()) >= 1) {
          blocked = true;
          break;
        }
        await new Promise<void>((r) => setTimeout(r, 20));
      }
      expect(blocked).toBe(true);
      vi.setSystemTime(new Date("2026-10-24T12:00:05.000Z"));
    } finally {
      release();
      await holder;
    }
    const denied = await attempt;
    expect(denied).toMatchObject({
      success: false,
      code: "SURVEY_EDIT_WINDOW_EXPIRED",
      response: { id: old.id, submittedAt: originalSubmitted.toISOString() },
    });
    const actual = await prisma.surveyResponse.findUniqueOrThrow({ where: { id: old.id } });
    expect(actual.answers).toEqual(old.answers);
    expect(actual.submittedAt).toEqual(old.submittedAt);
    expect(await prisma.surveyResponse.count({ where: { userId: F.a, stepId: F.initial } })).toBe(
      1,
    );
    expect((await training(F.trainingA))?.status).toBe("NOT_STARTED");
    expect((await training(F.trainingA))?.steps.every((s) => s.status === "NOT_STARTED")).toBe(
      true,
    );
    vi.useRealTimers();
  }, 20000);

  it("bad pet foreign key rolls back create and step; later valid submission works", async () => {
    const denied = await submitSurveyResponse(F.a, { ...aInitial(), petId: id("nonexistent_pet") });
    expect(denied).toMatchObject({ success: false, code: "SURVEY_SUBMIT_FAILED" });
    expect(await prisma.surveyResponse.count({ where: { userId: F.a } })).toBe(0);
    expect((await training(F.trainingA))?.steps.every((s) => s.status === "NOT_STARTED")).toBe(
      true,
    );
    expect((await submitSurveyResponse(F.a, aInitial())).success).toBe(true);
    expect(await prisma.surveyResponse.count({ where: { userId: F.a } })).toBe(1);
    expect((await training(F.trainingA))?.status).toBe("IN_PROGRESS");
  }, 20000);
});
