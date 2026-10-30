/** TR013/TrainerDays G3: three registered Hono GETs → existing application/Core → real private PG18. */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";

// All these are write-side only imports of the unchanged Core getters.
// If a supposedly read-only GET invokes one, fail closed instead of mutating anything.
const forbidden = vi.hoisted(() => ({
  days: vi.fn(() => {
    throw Error("TRAINER_DAYS_WRITE_CACHE_FORBIDDEN");
  }),
  steps: vi.fn(() => {
    throw Error("TRAINER_STEPS_WRITE_CACHE_FORBIDDEN");
  }),
  revision: vi.fn(() => {
    throw Error("TRAINER_WRITE_REVISION_FORBIDDEN");
  }),
}));
vi.mock("../../../../../packages/core/src/services/training/trainingDayContent", () => ({
  invalidateTrainingDaysContentCache: forbidden.days,
  invalidateStepsContentCache: forbidden.steps,
}));
vi.mock("../../../../../packages/core/src/services/training/trainingContentRevision", () => ({
  publishCourseContentChange: forbidden.revision,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));

import { trainerDaysRoutes } from "./trainer-days";
import { trainerStepsRoutes } from "./trainer-steps";
import { trainerTemplatesRoutes } from "./trainer-templates";

const database = "gafus_refactor_trainer_joint_read_ag1_20261024";
const directory =
  "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/infra032_pg18_ag1_20261024/data";
const socket = "/Users/asmtv1/Desktop/gafus-refactor/.local-pg-scratch/s";
const appTag = "ag1_trainer_joint_read_sql_20261024";
const id = (name: string) => `ag1_joint_trainer_pg18_20261024_${name}`;
const f = {
  a: id("author_a"),
  b: id("author_b"),
  empty: id("empty_actor"),
  profileA: id("profile_a"),
  dayA: id("day_a"),
  dayB: id("day_b"),
  normalA: id("step_a_normal"),
  dailyA: id("step_a_daily"),
  normalB: id("step_b_normal"),
  stepLink: id("step_on_day_a"),
  course: id("course_a"),
  dayLink: id("day_on_course_a"),
  cat: id("template_category"),
  publicA: id("template_public_a"),
  publicB: id("template_public_b"),
  hidden: id("template_private_hidden"),
};
const users = [f.a, f.b, f.empty];
const steps = [f.normalA, f.dailyA, f.normalB];
const days = [f.dayA, f.dayB];
const templates = [f.publicA, f.publicB, f.hidden];
const stamp = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`);
const media = "opaque-fictional://no-provider-call";
const privateMarker = "FICTIONAL_HIDDEN_TEMPLATE_PRIVATE_BODY_NEVER_LEAK";
let seeded = false;

// Exact three registered subrouters from apps/api/src/app.ts mounted without
// importing that whole application or its auth/rate/security middleware.
const server = new Hono();
server.use("/api/v1/trainer/*", async (c, next) => {
  const claimed = c.req.header("x-own-test-role");
  const role =
    claimed === "TRAINER" || claimed === "ADMIN" || claimed === "MODERATOR" || claimed === "USER"
      ? claimed
      : "TRAINER";
  c.set("user", {
    id: c.req.header("x-own-test-actor") ?? f.a,
    role,
    username: "fixture-staff",
  });
  await next();
});
server.route("/api/v1/trainer/days", trainerDaysRoutes);
server.route("/api/v1/trainer/steps", trainerStepsRoutes);
server.route("/api/v1/trainer/templates", trainerTemplatesRoutes);
const request = (path: string, actor = f.a, role = "TRAINER") =>
  server.request(`/api/v1/trainer/${path}`, {
    headers: { "x-own-test-actor": actor, "x-own-test-role": role },
  });
const keys = (input: Record<string, unknown>, fields: string[]) =>
  expect(Object.keys(input).sort()).toEqual([...fields].sort());
const dayKeys = [
  "id",
  "title",
  "equipment",
  "description",
  "type",
  "authorId",
  "showCoursePathExport",
  "shareProgressAcrossCourses",
  "createdAt",
  "updatedAt",
  "author",
  "stepLinks",
  "dayLinks",
];
const stepKeys = [
  "id",
  "title",
  "description",
  "durationSec",
  "estimatedDurationSec",
  "type",
  "videoUrl",
  "imageUrls",
  "pdfUrls",
  "checklist",
  "surveySlug",
  "isDailyCourse",
  "authorId",
  "createdAt",
  "updatedAt",
  "author",
  "stepLinks",
];
const templateKeys = [
  "id",
  "title",
  "description",
  "durationSec",
  "type",
  "imageUrls",
  "pdfUrls",
  "videoUrl",
  "checklist",
  "requiresVideoReport",
  "requiresWrittenFeedback",
  "hasTestQuestions",
  "surveySlug",
  "tags",
  "isPublic",
  "usageCount",
  "category",
  "author",
  "createdAt",
];

async function guard() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  expect(process.env.AG1_TRAINER_JOINT_OWN_PG18).toBe("1");
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
      sock: boolean;
      unix: boolean;
      outsiders: bigint;
    }[]
  >`
    SELECT current_database()=${database} AS db,
      current_setting('server_version_num')='180004' AS version,
      current_setting('data_directory')=${directory} AS dir,
      current_setting('unix_socket_directories')=${socket} AS sock,
      current_setting('listen_addresses')='' AS unix,
      (SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend'
        AND pid<>pg_backend_pid() AND (datname IS DISTINCT FROM ${database}
          OR application_name IS DISTINCT FROM ${appTag})) AS outsiders
  `;
  expect(rows).toEqual([
    {
      db: true,
      version: true,
      dir: true,
      sock: true,
      unix: true,
      outsiders: 0n,
    },
  ]);
}

beforeAll(async () => {
  await guard();
  expect(
    await prisma.$queryRaw<{ u: bigint; d: bigint; s: bigint; t: bigint; m: bigint }[]>`
    SELECT (SELECT count(*) FROM public."User") AS u,
      (SELECT count(*) FROM public."TrainingDay") AS d,
      (SELECT count(*) FROM public."Step") AS s,
      (SELECT count(*) FROM public."StepTemplate") AS t,
      (SELECT count(*) FROM public._prisma_migrations) AS m
  `,
  ).toEqual([{ u: 0n, d: 0n, s: 0n, t: 0n, m: 0n }]);
  await prisma.user.createMany({
    data: users.map((x) => ({
      id: x,
      username: x,
      password: "fictional-only-not-returned",
    })),
  });
  seeded = true;
  await prisma.userProfile.create({
    data: {
      id: f.profileA,
      userId: f.a,
      fullName: "Fictional Trainer A",
    },
  });
  await prisma.trainingDay.createMany({
    data: [
      {
        id: f.dayA,
        authorId: f.a,
        title: "A visible day",
        description: "A day description",
        equipment: "leash",
        type: "regular",
        createdAt: stamp(23),
        updatedAt: stamp(24),
        showCoursePathExport: true,
        shareProgressAcrossCourses: false,
      },
      {
        id: f.dayB,
        authorId: f.b,
        title: "B visible day",
        createdAt: stamp(22),
        updatedAt: stamp(22),
      },
    ],
  });
  await prisma.step.createMany({
    data: [
      {
        id: f.normalA,
        authorId: f.a,
        title: "A linked step",
        description: "Fictional train",
        type: "TRAINING",
        durationSec: 60,
        estimatedDurationSec: 90,
        isDailyCourse: false,
        videoUrl: media,
        imageUrls: [media + "/image"],
        pdfUrls: [media + "/pdf"],
        checklist: { fictional: true },
        createdAt: stamp(24),
        updatedAt: stamp(24),
      },
      {
        id: f.dailyA,
        authorId: f.a,
        title: "A daily step",
        type: "THEORY",
        isDailyCourse: true,
        createdAt: stamp(21),
        updatedAt: stamp(21),
      },
      {
        id: f.normalB,
        authorId: f.b,
        title: "B separate step",
        type: "BREAK",
        isDailyCourse: false,
        createdAt: stamp(20),
        updatedAt: stamp(20),
      },
    ],
  });
  await prisma.stepOnDay.create({
    data: {
      id: f.stepLink,
      dayId: f.dayA,
      stepId: f.normalA,
      order: 0,
    },
  });
  // Actual production-shaped 173-table schema omits Course.version.
  // Only own fictional fixture INSERT uses archived exact columns; no schema patches.
  await prisma.$executeRaw`
    INSERT INTO public."Course" ("id","name","type","trainingLevel","duration",
      "logoImg","shortDesc","authorId","updatedAt","isPrivate","isPaid")
    VALUES (${f.course},'Fictional course','ag1_joint_trainer_course_20261024',
      'BEGINNER'::"TrainingLevel",'10 min','fictional-logo','Short fictional',
      ${f.a},CURRENT_TIMESTAMP,false,false)
  `;
  await prisma.dayOnCourse.create({
    data: {
      id: f.dayLink,
      dayId: f.dayA,
      courseId: f.course,
      order: 0,
    },
  });
  await prisma.stepCategory.create({
    data: { id: f.cat, name: "AG1 fictional category", icon: null },
  });
  await prisma.stepTemplate.createMany({
    data: [
      {
        id: f.publicA,
        authorId: f.a,
        categoryId: f.cat,
        title: "A public template",
        description: "Fictional template",
        type: "TRAINING",
        isPublic: true,
        usageCount: 5,
        createdAt: stamp(23),
        updatedAt: stamp(23),
        checklist: { guide: "fictional" },
      },
      {
        id: f.publicB,
        authorId: f.b,
        categoryId: null,
        title: "B public template",
        type: "PRACTICE",
        isPublic: true,
        usageCount: 2,
        createdAt: stamp(22),
        updatedAt: stamp(22),
      },
      {
        id: f.hidden,
        authorId: f.a,
        categoryId: f.cat,
        title: "Private excluded",
        description: privateMarker,
        type: "THEORY",
        isPublic: false,
        usageCount: 99,
        createdAt: stamp(24),
        updatedAt: stamp(24),
      },
    ],
  });
}, 45000);

afterAll(async () => {
  try {
    await guard();
    if (seeded) {
      await prisma.stepTemplate.deleteMany({ where: { id: { in: templates } } });
      await prisma.stepCategory.deleteMany({ where: { id: f.cat } });
      await prisma.dayOnCourse.deleteMany({ where: { id: f.dayLink } });
      await prisma.stepOnDay.deleteMany({ where: { id: f.stepLink } });
      await prisma.$executeRaw`DELETE FROM public."Course" WHERE "id"=${f.course}`;
      await prisma.step.deleteMany({ where: { id: { in: steps } } });
      await prisma.trainingDay.deleteMany({ where: { id: { in: days } } });
      await prisma.userProfile.deleteMany({ where: { id: f.profileA } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    expect(
      await prisma.$queryRaw<
        {
          u: bigint;
          p: bigint;
          d: bigint;
          s: bigint;
          l: bigint;
          c: bigint;
          cl: bigint;
          t: bigint;
          cat: bigint;
          m: bigint;
        }[]
      >`
      SELECT (SELECT count(*) FROM public."User") AS u,
        (SELECT count(*) FROM public."UserProfile") AS p,
        (SELECT count(*) FROM public."TrainingDay") AS d,
        (SELECT count(*) FROM public."Step") AS s,
        (SELECT count(*) FROM public."StepOnDay") AS l,
        (SELECT count(*) FROM public."Course") AS c,
        (SELECT count(*) FROM public."DayOnCourse") AS cl,
        (SELECT count(*) FROM public."StepTemplate") AS t,
        (SELECT count(*) FROM public."StepCategory") AS cat,
        (SELECT count(*) FROM public._prisma_migrations) AS m
    `,
    ).toEqual([{ u: 0n, p: 0n, d: 0n, s: 0n, l: 0n, c: 0n, cl: 0n, t: 0n, cat: 0n, m: 0n }]);
    expect(forbidden.days).not.toHaveBeenCalled();
    expect(forbidden.steps).not.toHaveBeenCalled();
    expect(forbidden.revision).not.toHaveBeenCalled();
  } finally {
    await prisma.$disconnect();
  }
}, 45000);

describe("AG1 TR013/TrainerDays three actual registered GET Core PostgreSQL JSON", () => {
  it("one TRAINER actor: three frozen JSON shapes share real day/step/course/category data", async () => {
    const d = await request("days");
    const s = await request("steps");
    const t = await request("templates");
    for (const r of [d, s, t]) expect(r.status).toBe(200);
    const daysPayload = await d.json();
    const stepsPayload = await s.json();
    const templatePayload = await t.json();
    for (const p of [daysPayload, stepsPayload, templatePayload]) keys(p, ["success", "data"]);
    expect(daysPayload.success).toBe(true);
    expect(daysPayload.data).toHaveLength(1);
    const day = daysPayload.data[0];
    keys(day, dayKeys);
    expect(day).toMatchObject({
      id: f.dayA,
      title: "A visible day",
      authorId: f.a,
      createdAt: stamp(23).toISOString(),
      author: { username: f.a, profile: { fullName: "Fictional Trainer A" } },
      stepLinks: [{ id: f.stepLink, order: 0, step: { id: f.normalA, title: "A linked step" } }],
      dayLinks: [{ id: f.dayLink, order: 0, course: { id: f.course, name: "Fictional course" } }],
    });
    keys(day.author, ["username", "profile"]);
    keys(day.stepLinks[0], ["id", "order", "step"]);
    keys(day.stepLinks[0].step, ["id", "title"]);
    keys(day.dayLinks[0], ["id", "order", "course"]);
    keys(day.dayLinks[0].course, ["id", "name"]);
    expect(stepsPayload.data).toHaveLength(1);
    const step = stepsPayload.data[0];
    keys(step, stepKeys);
    expect(step).toMatchObject({
      id: f.normalA,
      authorId: f.a,
      createdAt: stamp(24).toISOString(),
      updatedAt: stamp(24).toISOString(),
      durationSec: 60,
      estimatedDurationSec: 90,
      videoUrl: media,
      imageUrls: [media + "/image"],
      pdfUrls: [media + "/pdf"],
      checklist: { fictional: true },
      surveySlug: null,
      isDailyCourse: false,
      stepLinks: [
        {
          day: {
            dayLinks: [
              {
                course: {
                  id: f.course,
                  name: "Fictional course",
                  shortDesc: "Short fictional",
                  logoImg: "fictional-logo",
                },
              },
            ],
          },
        },
      ],
    });
    expect(step.stepLinks[0].day.dayLinks[0].course.id).toBe(day.dayLinks[0].course.id);
    expect(templatePayload.data.map((x: { id: string }) => x.id)).toEqual([f.publicA, f.publicB]);
    const template = templatePayload.data[0];
    keys(template, templateKeys);
    expect(template).toMatchObject({
      id: f.publicA,
      author: { id: f.a, username: f.a },
      category: { id: f.cat, name: "AG1 fictional category", icon: null },
      isPublic: true,
      usageCount: 5,
      checklist: { guide: "fictional" },
      createdAt: stamp(23).toISOString(),
      durationSec: null,
      videoUrl: null,
      tags: [],
    });
    expect(templatePayload.data[1]?.category).toBeNull();
    expect(JSON.stringify(templatePayload)).not.toContain(privateMarker);
  });
  it("existing actor parameter: owner B and empty TRAINER lists; templates remain public", async () => {
    const bDay = await request("days", f.b);
    const bStep = await request("steps", f.b);
    expect(bDay.status).toBe(200);
    expect((await bDay.json()).data.map((x: { id: string }) => x.id)).toEqual([f.dayB]);
    expect((await bStep.json()).data.map((x: { id: string }) => x.id)).toEqual([f.normalB]);
    expect((await (await request("days", f.empty)).json()).data).toEqual([]);
    expect((await (await request("steps", f.empty)).json()).data).toEqual([]);
    expect((await (await request("templates", f.empty)).json()).data).toHaveLength(2);
  });
  it("daily step and category filters, elevated existing role boolean on 2 owner GETs", async () => {
    const daily = await request("steps?isDailyCourse=true");
    expect(daily.status).toBe(200);
    expect((await daily.json()).data.map((x: { id: string }) => x.id)).toEqual([f.dailyA]);
    const templatesCat = await request(`templates?categoryId=${f.cat}`);
    expect(templatesCat.status).toBe(200);
    expect((await templatesCat.json()).data.map((x: { id: string }) => x.id)).toEqual([f.publicA]);
    expect((await (await request("templates?categoryId=fictional-missing")).json()).data).toEqual(
      [],
    );
    const adminDays = await request("days", f.empty, "ADMIN");
    const adminSteps = await request("steps", f.empty, "ADMIN");
    expect((await adminDays.json()).data.map((x: { id: string }) => x.id)).toEqual([
      f.dayA,
      f.dayB,
    ]);
    expect((await adminSteps.json()).data.map((x: { id: string }) => x.id)).toEqual([
      f.normalA,
      f.normalB,
    ]);
  });
  it("original 400 query, 403 non-staff responses are unchanged and GET makes no writes", async () => {
    for (const path of [
      "days?extra=1",
      "steps?isDailyCourse=invalid",
      "steps?isDailyCourse=true&isDailyCourse=false",
      "templates?unknown=1",
      "templates?categoryId=a&categoryId=b",
    ]) {
      const r = await request(path);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({
        success: false,
        code: "BAD_QUERY",
        error: "Некорректный запрос",
      });
    }
    for (const path of ["days", "steps", "templates"]) {
      const r = await request(path, f.a, "USER");
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({
        success: false,
        code: "FORBIDDEN",
        error: "Недостаточно прав",
      });
    }
    expect(await prisma.trainingDay.count()).toBe(days.length);
    expect(await prisma.step.count()).toBe(steps.length);
    expect(await prisma.stepTemplate.count()).toBe(templates.length);
    expect(forbidden.days).not.toHaveBeenCalled();
    expect(forbidden.steps).not.toHaveBeenCalled();
    expect(forbidden.revision).not.toHaveBeenCalled();
  });
});
