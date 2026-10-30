/**
 * AG1-001 joined read model: ACTUAL mounted Hono -> injected application ->
 * ACTUAL Core training and course services -> synthetic Prisma storage.
 * NO whole-Core mocks, real SQL/Redis/queue/network or mutations.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  policy: vi.fn(),
  entitlement: vi.fn(),
  content: vi.fn(),
  days: vi.fn(),
  userCourse: vi.fn(),
  userTraining: vi.fn(),
  userStepRead: vi.fn(),
  session: vi.fn(),
  registration: vi.fn(),
  mutation: vi.fn(),
  queueAdd: vi.fn(),
  throttle: false,
  keys: [] as string[],
  reads: [] as string[],
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    init(o: { windowMs: number }) {
      this.windowMs = o.windowMs;
    }
    async increment(key: string) {
      m.keys.push(key);
      return { totalHits: m.throttle ? 101 : 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
    async decrement() {
      return undefined;
    }
    async resetKey() {
      return undefined;
    }
  },
}));
// Core barrels import queues in unrelated modules. No real constructor/enqueue.
vi.mock("@gafus/queues", () => {
  const mockQueue = { add: m.queueAdd, remove: m.mutation, getJob: m.mutation };
  return new Proxy(
    {},
    {
      get: (_target, key) =>
        typeof key === "string"
          ? key.endsWith("_JOB_ID")
            ? (id: string) => "mock-" + id
            : key.startsWith("remove")
              ? m.mutation
              : mockQueue
          : undefined,
    },
  );
});
vi.mock("@gafus/prisma", async (original) => {
  const a = await original<typeof PrismaModule>();
  return {
    ...a,
    prisma: {
      ...a.prisma,
      user: { ...a.prisma.user, findUnique: m.session },
      course: {
        ...a.prisma.course,
        findFirst: m.policy,
        findUnique: m.entitlement,
        create: m.mutation,
        update: m.mutation,
        delete: m.mutation,
      },
      dayOnCourse: {
        ...a.prisma.dayOnCourse,
        findFirst: m.content,
        findMany: m.days,
        create: m.mutation,
        update: m.mutation,
      },
      userCourse: {
        ...a.prisma.userCourse,
        findUnique: m.userCourse,
        create: m.mutation,
        update: m.mutation,
      },
      userTraining: {
        ...a.prisma.userTraining,
        findUnique: m.userTraining,
        create: m.mutation,
        update: m.mutation,
        upsert: m.mutation,
        createMany: m.mutation,
      },
      userStep: {
        ...a.prisma.userStep,
        create: m.mutation,
        createMany: m.mutation,
        update: m.mutation,
        findMany: m.userStepRead,
      },
      $transaction: m.mutation,
    },
  };
});
vi.mock("@gafus/core/services/auth", async (original) => ({
  ...(await original<object>()),
  isRegistrationCompleted: m.registration,
}));

// Core training/course barrels and the application module remain real.
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import { getTrainingDayWithMonetizedSteps } from "@gafus/core/services/training";
import { checkCourseAccess } from "@gafus/core/services/course";

const DAY = "clwdayoc0000000000000001";
const COURSE = "sample-course";
const users = {
  A: { id: "owner_A", username: "owner_a", role: "USER" },
  B: { id: "owner_B", username: "owner_b", role: "USER" },
} as const;
const tokens: Record<string, string> = {};
type Mode = "found" | "denied" | "missing" | "fault" | "personalize";
let mode: Mode = "found";
const foundDay = {
  id: DAY,
  order: 1,
  courseId: "course_1",
  course: { duration: "7 дней", isPersonalized: false },
  day: {
    id: "day_1",
    title: "День первый",
    description: "Описание курса",
    type: "regular",
    showCoursePathExport: false,
    stepLinks: [
      {
        id: "stepLink_1",
        order: 0,
        step: {
          id: "step_1",
          title: "Введение",
          description: "Шаг тренировки",
          durationSec: 60,
          estimatedDurationSec: null,
          videoUrl: null,
          imageUrls: [],
          pdfUrls: [],
          type: "BREAK",
          checklist: null,
          requiresVideoReport: false,
          requiresWrittenFeedback: false,
          hasTestQuestions: false,
          surveySlug: null,
        },
      },
    ],
  },
};
const route = (who: string, query?: string) =>
  app.request(
    "/api/v1/training/day?" + (query ?? "courseType=" + COURSE + "&dayOnCourseId=" + DAY),
    { method: "GET", headers: who ? { authorization: "Bearer " + (tokens[who] ?? who) } : {} },
  );
const noWrites = () => {
  expect(m.mutation).not.toHaveBeenCalled();
  expect(m.queueAdd).not.toHaveBeenCalled();
};
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  process.env.ENABLE_COURSE_CACHE = "false";
  for (const [key, user] of Object.entries(users)) {
    tokens[key] = await generateAccessToken(user);
  }
});
beforeEach(() => {
  vi.clearAllMocks();
  mode = "found";
  m.reads.length = 0;
  m.keys.length = 0;
  m.throttle = false;
  m.registration.mockResolvedValue(true);
  m.session.mockImplementation(async ({where}:{where:{id:string}}) => {
    const matched=Object.values(users).find((candidate)=>candidate.id===where.id);
    return matched ? {sessionsRevokedAt:null,registrationPending:false,role:matched.role} : null;
  });
  m.policy.mockImplementation(async (q: { where: { type: string } }) => {
    m.reads.push("policy:" + q.where.type);
    if (mode === "denied" || mode === "missing") return null;
    return { isPaid: false, isPrivate: false };
  });
  m.entitlement.mockImplementation(
    async (q: { where: { type: string }; select: { id: true; isPaid: true; isPrivate: true } }) => {
      m.reads.push("access:" + q.where.type);
      return mode === "denied" ? null : { id: "course_1", isPaid: false, isPrivate: false };
    },
  );
  m.content.mockImplementation(async (q: { where: { id: string; course: { type: string } } }) => {
    m.reads.push("day:" + q.where.id + ":" + q.where.course.type);
    if (mode === "fault") throw new Error("SYNTHETIC_DAY_DB_FAILURE");
    if (mode === "missing") return null;
    return mode === "personalize"
      ? { ...foundDay, course: { ...foundDay.course, isPersonalized: true } }
      : foundDay;
  });
  m.days.mockResolvedValue([{ order: 1, day: { type: "regular" } }]);
  m.userCourse.mockResolvedValue(null);
  m.userTraining.mockResolvedValue(null);
  m.userStepRead.mockResolvedValue([]);
  // Fail closed BEFORE any synthetic mutation could execute (including $transaction).
  m.mutation.mockImplementation(() => {
    throw new Error("FORBIDDEN_TRAINING_READ_WRITE");
  });
});

describe("AG1-001 registered training GET day -> real Core / synthetic Prisma", () => {
  it("returns unchanged free public day for signed owner, current Core selects, no writes", async () => {
    expect(typeof getTrainingDayWithMonetizedSteps).toBe("function");
    expect(typeof checkCourseAccess).toBe("function");
    const r = await route("A");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      success: true,
      data: {
        trainingDayId: "day_1",
        dayOnCourseId: DAY,
        title: "День первый",
        steps: [{ id: "step_1", description: "Шаг тренировки", locked: false }],
      },
    });
    expect(m.policy).toHaveBeenCalledWith({
      where: { type: COURSE },
      select: { isPaid: true, isPrivate: true },
    });
    expect(m.content).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DAY, course: { type: COURSE } },
      }),
    );
    expect(m.content.mock.calls[0][0].select.userTrainings).toBeUndefined();
    expect(m.userCourse).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_courseId: { userId: users.A.id, courseId: "course_1" } },
      }),
    );
    expect(m.userTraining).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_dayOnCourseId: { userId: users.A.id, dayOnCourseId: DAY } },
      }),
    );
    noWrites();
  });
  it("existing UserTraining + missing second StepOnDay: GET createIfMissing=false never backfills", async () => {
    // Registered Hono+application and ACTUAL imported Core remain unmocked.
    // Both step occurrences are present in the read-only content projection;
    // only the first one has an already-existing UserStep record.
    const secondStep = {
      ...foundDay.day.stepLinks[0],
      id: "stepLink_2",
      order: 1,
      step: {
        ...foundDay.day.stepLinks[0].step,
        id: "step_2",
        title: "Второй шаг",
        type: "THEORY",
      },
    };
    m.content.mockResolvedValue({
      ...foundDay,
      day: { ...foundDay.day, stepLinks: [...foundDay.day.stepLinks, secondStep] },
    });
    m.userTraining.mockResolvedValue({
      id: "existing_user_training_a",
      status: "IN_PROGRESS",
      currentStepIndex: 0,
    });
    m.userStepRead.mockResolvedValue([
      {
        id: "existing_user_step_a",
        stepOnDayId: "stepLink_1",
        status: "COMPLETED",
        paused: false,
        remainingSec: 0,
      },
    ]);

    const r = await route(
      "A",
      "courseType=" + COURSE + "&dayOnCourseId=" + DAY + "&createIfMissing=false",
    );
    // A stale Core that attempts backfill is rejected at the mutation boundary,
    // before a sanitized 500 could hide the attempted write.
    expect(m.userStepRead).toHaveBeenCalledTimes(1);
    noWrites();
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      dayOnCourseId: DAY,
      userStatus: "IN_PROGRESS",
      steps: [
        { id: "step_1", status: "COMPLETED", userStepId: "existing_user_step_a", locked: false },
        { id: "step_2", status: "NOT_STARTED", locked: false },
      ],
    });
    expect(json.data.steps).toHaveLength(2);
    expect(json.data.steps[1]).not.toHaveProperty("userStepId");
    expect(json.data.steps[1]).not.toHaveProperty("remainingSecOnServer");
    expect(m.userTraining).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_dayOnCourseId: { userId: users.A.id, dayOnCourseId: DAY } },
      }),
    );
    expect(m.userStepRead).toHaveBeenCalledExactlyOnceWith({
      where: { userTrainingId: "existing_user_training_a" },
      select: { id: true, stepOnDayId: true, status: true, paused: true, remainingSec: true },
    });
    noWrites(); // assert original Prisma.$transaction/create/createMany/upsert/queue zero
  });
  it.each([
    ["A", "denied", 403, { success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" }],
    [
      "B",
      "missing",
      404,
      { success: false, error: "День тренировки не найден", code: "NOT_FOUND" },
    ],
  ] as const)(
    "null Core day for %s with %s policy becomes unchanged %s",
    async (actor, nextMode, status, body) => {
      mode = nextMode;
      const r = await route(actor);
      expect(r.status).toBe(status);
      expect(await r.json()).toEqual(body);
      expect(m.policy).toHaveBeenCalledExactlyOnceWith({
        where: { type: COURSE },
        select: { isPaid: true, isPrivate: true },
      });
      expect(m.entitlement).toHaveBeenCalledExactlyOnceWith({
        where: { type: COURSE },
        select: { id: true, isPrivate: true, isPaid: true },
      });
      expect(m.content).not.toHaveBeenCalled();
      expect(m.reads).toEqual(["policy:" + COURSE, "access:" + COURSE]);
      noWrites();
    },
  );
  it("real Core PERSONALIZATION_REQUIRED remains original 428, no fallback recheck", async () => {
    mode = "personalize";
    const r = await route("A");
    expect(r.status).toBe(428);
    expect(await r.json()).toEqual({
      success: false,
      error: "Для этого курса нужно заполнить персонализацию",
      code: "PERSONALIZATION_REQUIRED",
    });
    expect(m.content).toHaveBeenCalledOnce();
    // Access inside Core is permitted; no additional application fallback call.
    expect(m.entitlement).toHaveBeenCalledTimes(2);
    noWrites();
  });
  it("Core synthetic storage failure remains original 500, no fallback recheck", async () => {
    mode = "fault";
    const r = await route("A");
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({
      success: false,
      error: "Внутренняя ошибка сервера",
    });
    expect(m.content).toHaveBeenCalledOnce();
    expect(m.entitlement).toHaveBeenCalledTimes(2);
    noWrites();
  });
  it("malformed query 400, invalid JWT 401, and rate 429 stop all Core reads", async () => {
    expect((await route("A", "courseType=&dayOnCourseId=" + DAY)).status).toBe(400);
    expect((await route("bad.jwt")).status).toBe(401);
    m.throttle = true;
    expect((await route("A")).status).toBe(429);
    expect(m.policy).not.toHaveBeenCalled();
    expect(m.entitlement).not.toHaveBeenCalled();
    expect(m.content).not.toHaveBeenCalled();
    noWrites();
  });
});
