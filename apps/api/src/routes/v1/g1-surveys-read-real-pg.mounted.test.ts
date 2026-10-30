/** LEARN032/G3: registered survey GET Hono -> original composed Core -> owned PG18 JSON wire. */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";

// READ-only fixture does NOT mock the Core Survey methods, Prisma or composition.
// The same registered subrouter statically imports a POST-only rewarded/credit gate.
// Fail closed if any GET unexpectedly reaches that unapproved write/finance boundary.
const forbidden = vi.hoisted(() => ({
  rewarded: vi.fn(() => {
    throw Error("POST_REWARDED_ACCESS_FORBIDDEN");
  }),
  courseVersion: vi.fn(() => {
    throw Error("WRITE_COURSE_VERSION_FORBIDDEN");
  }),
}));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  requirePremiumOrRewardedAccessForUserStep: forbidden.rewarded,
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {},
}));
// Existing Core survey->course import closure has an unused trainer-course write port.
vi.mock("../../../../../packages/core/src/services/trainerCourse/courseVersionService", () => ({
  setCourseLogoVersioned: forbidden.courseVersion,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
import { surveysRoutes } from "./surveys";

const database = "gafus_refactor_survey_hono_read_ag1_20261024";
const directory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_survey_hono_read_sql_20261024";
const id = (s: string) => `ag1_survey_hono_read_20261024_${s}`;
const a = id("owner_a"),
  b = id("owner_b"),
  trainer = id("trainer");
const course = id("course");
const stepAI = id("step_a_initial"),
  stepAF = id("step_a_final");
const stepBI = id("step_b_initial"),
  stepBF = id("step_b_final");
const users = [a, b, trainer];
const steps = [stepAI, stepAF, stepBI, stepBF];
const responses = [id("response_ai"), id("response_af"), id("response_bi"), id("response_bf")];
const family = "dog-home-alone";
const initialSlug = "dog-home-alone-initial";
const finalSlug = "dog-home-alone-final";
const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T09:00:00.000Z`);
const toJson = (path: string, principal = a) =>
  server.request(`/api/v1/surveys${path}`, {
    headers: { "x-test-only-actor": principal },
  });
function buildServer() {
  const app = new Hono();
  // Fixture-only principal injection. Deliberately NOT real auth middleware/JWT proof.
  app.use("/api/v1/surveys/*", async (c, next) => {
    c.set("user", {
      id: c.req.header("x-test-only-actor") ?? a,
      username: "fictional",
      role: "USER",
    });
    await next();
  });
  app.route("/api/v1/surveys", surveysRoutes); // actual registered route object, no full app import
  return app;
}
const server = buildServer();
let seeded = false;
async function guard() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_SURVEY_HONO_OWN_PG18).toBe("1");
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
      noTcp: boolean;
      sock: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${directory} AS dir,
      current_setting('listen_addresses')='' AS "noTcp",
      current_setting('unix_socket_directories')=${socket} AS sock,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
          OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(rows).toEqual([
    { db: true, version: true, dir: true, noTcp: true, sock: true, outsiders: 0n },
  ]);
}

beforeAll(async () => {
  await guard();
  expect(
    await prisma.$queryRaw<{ u: bigint; c: bigint; s: bigint; r: bigint; m: bigint }[]>`
    SELECT (SELECT count(*) FROM public."User") AS u,
      (SELECT count(*) FROM public."Course") AS c,
      (SELECT count(*) FROM public."Step") AS s,
      (SELECT count(*) FROM public."SurveyResponse") AS r,
      (SELECT count(*) FROM public._prisma_migrations) AS m
  `,
  ).toEqual([{ u: 0n, c: 0n, s: 0n, r: 0n, m: 0n }]);
  await prisma.user.createMany({
    data: users.map((u) => ({ id: u, username: u, password: "fictional-only" })),
  });
  seeded = true;
  // Schema-only original archive has no later Course.version; fixture insert uses existing columns.
  await prisma.$executeRaw`
    INSERT INTO public."Course" ("id","name","type","trainingLevel","duration","logoImg","authorId","updatedAt")
    VALUES (${course},'Fictional survey course','ag1_survey_hono_read','BEGINNER'::"TrainingLevel",'10 min','fictional',${trainer},CURRENT_TIMESTAMP)
  `;
  await prisma.step.createMany({
    data: [
      {
        id: stepAI,
        authorId: trainer,
        title: "A initial",
        type: "SURVEY",
        surveySlug: initialSlug,
      },
      { id: stepAF, authorId: trainer, title: "A final", type: "SURVEY", surveySlug: finalSlug },
      {
        id: stepBI,
        authorId: trainer,
        title: "B initial",
        type: "SURVEY",
        surveySlug: initialSlug,
      },
      { id: stepBF, authorId: trainer, title: "B final", type: "SURVEY", surveySlug: finalSlug },
    ],
  });
  await prisma.surveyResponse.createMany({
    data: [
      {
        id: responses[0]!,
        userId: a,
        courseId: course,
        stepId: stepAI,
        surveySlug: initialSlug,
        surveyFamilySlug: family,
        phase: "INITIAL",
        surveyVersion: 1,
        answers: { concern: "Before", someFlag: true, optional: null },
        submittedAt: at(16),
      },
      {
        id: responses[1]!,
        userId: a,
        courseId: course,
        stepId: stepAF,
        surveySlug: finalSlug,
        surveyFamilySlug: family,
        phase: "FINAL",
        surveyVersion: 1,
        answers: { concern: "After", someFlag: false, added: ["a", "b"] },
        submittedAt: at(17),
      },
      {
        id: responses[2]!,
        userId: b,
        courseId: course,
        stepId: stepBI,
        surveySlug: initialSlug,
        surveyFamilySlug: family,
        phase: "INITIAL",
        surveyVersion: 1,
        answers: { concern: 123 },
        submittedAt: at(16),
      }, // malformed historic JSON; must normalize atomically {}
      {
        id: responses[3]!,
        userId: b,
        courseId: course,
        stepId: stepBF,
        surveySlug: finalSlug,
        surveyFamilySlug: family,
        phase: "FINAL",
        surveyVersion: 1,
        answers: { concern: "Recovered" },
        submittedAt: at(18),
      },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await guard();
    if (seeded) {
      await prisma.surveyResponse.deleteMany({ where: { id: { in: responses } } });
      await prisma.step.deleteMany({ where: { id: { in: steps } } });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE "id"=${course}`;
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    expect(
      await prisma.$queryRaw<{ u: bigint; c: bigint; s: bigint; r: bigint; m: bigint }[]>`
      SELECT (SELECT count(*) FROM public."User") AS u,
        (SELECT count(*) FROM public."Course") AS c,
        (SELECT count(*) FROM public."Step") AS s,
        (SELECT count(*) FROM public."SurveyResponse") AS r,
        (SELECT count(*) FROM public._prisma_migrations) AS m
    `,
    ).toEqual([{ u: 0n, c: 0n, s: 0n, r: 0n, m: 0n }]);
    expect(forbidden.rewarded).not.toHaveBeenCalled();
    expect(forbidden.courseVersion).not.toHaveBeenCalled();
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

const envelopeKeys = (x: Record<string, unknown>, fields: string[]) =>
  expect(Object.keys(x).sort()).toEqual([...fields].sort());

describe("AG1 LEARN032 registered Hono Survey GET JSON -> original Core SQL", () => {
  it("known slug response by actor, nullable missing response and canonical ISO wire", async () => {
    const result = await toJson(`/${initialSlug}?stepId=${stepAI}`, a);
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await result.json();
    envelopeKeys(body, ["success", "data"]);
    expect(body.success).toBe(true);
    envelopeKeys(body.data, ["template", "response"]);
    expect(body.data.template).toMatchObject({
      slug: initialSlug,
      familySlug: family,
      phase: "INITIAL",
    });
    expect(body.data.response).toMatchObject({
      id: responses[0],
      userId: a,
      courseId: course,
      stepId: stepAI,
      petId: null,
      answers: { concern: "Before", someFlag: true, optional: null },
      phase: "INITIAL",
      surveyFamilySlug: family,
      submittedAt: at(16).toISOString(),
      editableUntil: new Date(at(16).getTime() + 86400000).toISOString(),
      canEdit: false,
    });
    envelopeKeys(body.data.response, [
      "id",
      "userId",
      "courseId",
      "stepId",
      "petId",
      "surveySlug",
      "surveyFamilySlug",
      "phase",
      "surveyVersion",
      "answers",
      "submittedAt",
      "editableUntil",
      "canEdit",
    ]);
    expect(
      (await (await toJson(`/${initialSlug}?stepId=${stepAI}`, b)).json()).data.response,
    ).toBeNull();
    expect((await (await toJson(`/${initialSlug}`, a)).json()).data.response).toBeNull();
  });
  it("unknown slug remains 400 and invalid GET query validation returns 400 without writes", async () => {
    const unknown = await toJson("/fictional-missing-slug?stepId=" + stepAI);
    expect(unknown.status).toBe(400);
    expect(unknown.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await unknown.json()).toEqual({
      success: false,
      error: "Анкета не найдена",
      code: "SURVEY_NOT_FOUND",
    });
    for (const path of [
      `/${initialSlug}?stepId=`,
      "/comparison?courseId=" + course,
      "/comparison?familySlug=" + family,
    ]) {
      const response = await toJson(path);
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
    expect(await prisma.surveyResponse.count()).toBe(4);
  });
  it("registered comparison complete pair returns canonical JSON dates/differences", async () => {
    const result = await toJson(`/comparison?courseId=${course}&familySlug=${family}`, a);
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    const json = await result.json();
    envelopeKeys(json, ["success", "data"]);
    expect(json.data.familySlug).toBe(family);
    expect(json.data.initialSubmittedAt).toBe(at(16).toISOString());
    expect(json.data.finalSubmittedAt).toBe(at(17).toISOString());
    envelopeKeys(json.data, ["familySlug", "initialSubmittedAt", "finalSubmittedAt", "items"]);
    expect(json.data.items).toEqual(
      expect.arrayContaining([
        { questionId: "concern", before: "Before", after: "After", changed: true },
        { questionId: "someFlag", before: true, after: false, changed: true },
        { questionId: "optional", before: null, after: null, changed: false },
        { questionId: "added", before: null, after: ["a", "b"], changed: true },
      ]),
    );
    expect(json.data.items).toHaveLength(4);
    expect(
      (await (await toJson(`/comparison?courseId=${course}&familySlug=${family}`, trainer)).json())
        .data,
    ).toBeNull();
  });
  it("malformed stored JSON normalizes to {} for response and comparison with complete pair", async () => {
    const response = await toJson(`/${initialSlug}?stepId=${stepBI}`, b);
    expect(response.status).toBe(200);
    expect((await response.json()).data.response.answers).toEqual({});
    const comparison = await toJson(`/comparison?courseId=${course}&familySlug=${family}`, b);
    expect(comparison.status).toBe(200);
    const data = (await comparison.json()).data;
    expect(data).toMatchObject({
      familySlug: family,
      initialSubmittedAt: at(16).toISOString(),
      finalSubmittedAt: at(18).toISOString(),
    });
    expect(data.items).toEqual([
      { questionId: "concern", before: null, after: "Recovered", changed: true },
    ]);
    expect(forbidden.rewarded).not.toHaveBeenCalled();
    expect(forbidden.courseVersion).not.toHaveBeenCalled();
  });
});
