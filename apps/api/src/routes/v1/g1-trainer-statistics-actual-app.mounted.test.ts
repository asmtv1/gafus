/**
 * AG1 TR018: ACTUAL apps/api/src/app.ts mounted route and middleware.
 * Real HS256 signed/verified JWT; Prisma statistics, registration and
 * Redis rate-counter are synthetic. No real DB, Redis, or default UI cutover.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import type * as StatisticsModule from "@gafus/core/services/statistics";

const m = vi.hoisted(() => ({
  findUser: vi.fn(), completed: vi.fn(),
  courses: vi.fn(), steps: vi.fn(),
  rateLimited: false, rateCalls: [] as string[],
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    init(opts: { windowMs: number }) { this.windowMs = opts.windowMs; }
    async increment(key: string) {
      m.rateCalls.push(key);
      return {
        totalHits: m.rateLimited ? 101 : 1,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
    async decrement() { return undefined; }
    async resetKey() { return undefined; }
  },
}));
vi.mock("@gafus/prisma", async (importOriginal) => {
  const original = await importOriginal<typeof PrismaModule>();
  return {
    ...original,
    prisma: { ...original.prisma, user: {
      ...original.prisma.user, findUnique: m.findUser,
    } },
  };
});
vi.mock("@gafus/core/services/auth", async (importOriginal) => ({
  ...await importOriginal<object>(), isRegistrationCompleted: m.completed,
}));
vi.mock("@gafus/core/services/statistics", async (importOriginal) => ({
  ...await importOriginal<typeof StatisticsModule>(),
  getCourseStatistics: m.courses, getStepStatistics: m.steps,
}));

import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";

const base = "/api/v1/trainer/statistics";
const PII = "PRIVATE_STUDENT_MEDICAL_RECEIPT_EMAIL";
const ids: Record<string, { id: string; role: "TRAINER" | "ADMIN" | "MODERATOR" | "USER" | "PARTNER" }> = {
  A: { id: "TRAINER_A", role: "TRAINER" },
  B: { id: "TRAINER_B", role: "TRAINER" },
  ADMIN: { id: "ADMIN_1", role: "ADMIN" },
  MOD: { id: "MOD_1", role: "MODERATOR" },
  USER: { id: "USER_1", role: "USER" },
  PARTNER: { id: "PARTNER_1", role: "PARTNER" },
};
const tokens: Record<string, string> = {};
const rawCourse = (id: string) => ({
  id: "COURSE_" + id, name: "Course " + id, logoImg: "", avgRating: null,
  isPrivate: false, isPaid: false, isPersonalized: false,
  trainingLevel: "BEGINNER", totalUsers: 2, completedUsers: 1,
  inProgressUsers: 1, notStartedUsers: 0,
  author: { username: id, fullName: null },
  userCourses: [{ email: PII }], reviews: [{ comment: PII }],
  privateReceipt: PII,
});
const courseStats = (owners: string[]) => ({
  courses: owners.map(rawCourse), totalCourses: owners.length,
  totalDays: owners.length * 2, privateLedger: PII,
});
const stepStats = (owners: string[]) => ({
  steps: owners.map((owner) => ({
    id: "STEP_" + owner, title: "Step " + owner, durationSec: 45,
    usedInDaysCount: 2, usedInCoursesCount: 1,
    completedUsers: 0, totalUsers: 0, privateStudent: PII,
  })),
  totalSteps: owners.length,
});
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  for (const [name, actor] of Object.entries(ids)) {
    tokens[name] = await generateAccessToken({
      id: actor.id, username: name.toLowerCase(), role: actor.role,
    });
  }
});
beforeEach(() => {
  vi.clearAllMocks();
  m.rateLimited = false;
  m.rateCalls.length = 0;
  m.completed.mockResolvedValue(true);
  m.findUser.mockImplementation(async ({ where, select }: {
    where: { id: string };
    select: { role?: boolean; sessionsRevokedAt?: boolean };
  }) => {
    if (select.sessionsRevokedAt) {
      const actor = Object.values(ids).find((candidate) => candidate.id === where.id);
      return actor ? { sessionsRevokedAt: null, registrationPending: false, role: actor.role } : null;
    }
    if (select.role) {
      return ["TRAINER_A", "TRAINER_B"].includes(where.id)
        ? { role: "TRAINER" } : ["USER_1", "MOD_1"].includes(where.id)
          ? { role: "USER" } : null;
    }
    throw new Error("UNEXPECTED_PRISMA_SELECT");
  });
  m.courses.mockImplementation(async (id: string, elevated: boolean) =>
    courseStats(elevated ? ["TRAINER_A", "TRAINER_B"] : [id]));
  m.steps.mockImplementation(async (id: string, elevated: boolean) =>
    stepStats(elevated ? ["TRAINER_A", "TRAINER_B"] : [id]));
});
const req = (name: string, suffix = "/courses") => app.request(
  base + suffix, { headers: name ? {
    authorization: "Bearer " + (tokens[name] ?? name),
  } : {} },
);
const privacy = (r: Response) => {
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noStats = () => {
  expect(m.courses).not.toHaveBeenCalled();
  expect(m.steps).not.toHaveBeenCalled();
};

describe("AG1 TR018 ACTUAL app-mounted statistics GET, real verified JWT and middleware", () => {
  it.each(["/courses", "/steps"])("no JWT 401 before limiter/Core %s", async suffix => {
    const r = await req("", suffix);
    expect(r.status).toBe(401);
    privacy(r);
    noStats();
    expect(m.rateCalls).toHaveLength(0);
  });
  it("bad JWT 401 also private", async () => {
    const r = await req("malformed.jwt");
    expect(r.status).toBe(401);
    privacy(r);
    noStats();
  });
  it.each(["MOD", "USER", "PARTNER"])("%s role 403 and no Core calls", async name => {
    const r = await req(name);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ success: false, code: "FORBIDDEN" });
    privacy(r);
    noStats();
  });
  it("same real Hono app A→B→A is actor-scoped with no private fields", async () => {
    for (const [name, id] of [["A", "TRAINER_A"], ["B", "TRAINER_B"], ["A", "TRAINER_A"]]) {
      const r = await req(name);
      expect(r.status).toBe(200);
      privacy(r);
      const body = await r.json();
      expect(body.data.courses).toEqual([{
        id: "COURSE_" + id, name: "Course " + id, logoImg: "", avgRating: null,
        isPrivate: false, isPaid: false, isPersonalized: false,
        trainingLevel: "BEGINNER", totalUsers: 2, completedUsers: 1,
        inProgressUsers: 1, notStartedUsers: 0,
        author: { username: id, fullName: null },
      }]);
      expect(JSON.stringify(body)).not.toContain(PII);
    }
    expect(m.courses.mock.calls).toEqual([
      ["TRAINER_A", false], ["TRAINER_B", false], ["TRAINER_A", false],
    ]);
  });
  it.each(["?scope=all", "?scope=trainer&trainerUserId=TRAINER_B", "?userId=TRAINER_B&isElevated=true"])(
    "TRAINER_A cannot forge another owner's scope %s", async query => {
      const r = await req("A", "/courses" + query);
      expect(r.status).toBe(403);
      privacy(r);
      noStats();
    },
  );
  it("ADMIN must choose a scope, never silently sees global statistics", async () => {
    const r = await req("ADMIN");
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "BAD_QUERY" });
    privacy(r);
    noStats();
  });
  it("ADMIN explicit all returns aggregate courses with safe DTO", async () => {
    const r = await req("ADMIN", "/courses?scope=all");
    expect(r.status).toBe(200);
    privacy(r);
    const body = await r.json();
    expect(body.data.totalCourses).toBe(2);
    expect(body.data.totalDays).toBe(4);
    expect(JSON.stringify(body)).not.toContain(PII);
    expect(m.courses).toHaveBeenCalledExactlyOnceWith("ADMIN_1", true);
    expect(m.findUser.mock.calls.filter(([q]) => q.select.role && !q.select.sessionsRevokedAt)).toHaveLength(0);
  });
  it("ADMIN explicit known TRAINER_B checks DB role and restricts Core scope", async () => {
    const r = await req("ADMIN", "/steps?scope=trainer&trainerUserId=TRAINER_B");
    expect(r.status).toBe(200);
    privacy(r);
    expect(await r.json()).toEqual({
      success: true,
      data: {
        steps: [{ id: "STEP_TRAINER_B", title: "Step TRAINER_B",
          durationSec: 45, usedInDaysCount: 2, usedInCoursesCount: 1 }],
        totalSteps: 1, progressMetrics: "NOT_COMPUTED",
      },
    });
    expect(m.findUser).toHaveBeenCalledWith({
      where: { id: "TRAINER_B" }, select: { role: true },
    });
    expect(m.steps).toHaveBeenCalledExactlyOnceWith("TRAINER_B", false);
  });
  it.each(["not-here", "USER_1", "MOD_1"])(
    "ADMIN valid but missing/nonTRAINER %s -> 404 before Core", async id => {
      const r = await req("ADMIN", "/courses?scope=trainer&trainerUserId=" + id);
      expect(r.status).toBe(404);
      expect(await r.json()).toMatchObject({ code: "NOT_FOUND" });
      privacy(r);
      noStats();
      expect(m.findUser).toHaveBeenCalledWith({
        where: { id }, select: { role: true },
      });
    },
  );
  it.each([" TRAINER_A", "TRAINER_A ", "evil@id", "a".repeat(129), ""])(
    "ADMIN malformed target %s 400 before role lookup", async id => {
      const r = await req("ADMIN", "/courses?scope=trainer&trainerUserId=" + encodeURIComponent(id));
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ code: "BAD_QUERY" });
      privacy(r);
      noStats();
      expect(m.findUser.mock.calls.filter(([q]) => q.select.role && !q.select.sessionsRevokedAt)).toHaveLength(0);
    },
  );
  it("duplicate scope or attempted isElevated rejected before DB owner lookup", async () => {
    for (const query of ["?scope=all&scope=trainer", "?scope=all&isElevated=true", "?scope=trainer&trainerUserId=TRAINER_A&trainerUserId=TRAINER_B"]) {
      const r = await req("ADMIN", "/courses" + query);
      expect(r.status).toBe(400);
      privacy(r);
      noStats();
      expect(m.findUser.mock.calls.filter(([q]) => q.select.role && !q.select.sessionsRevokedAt)).toHaveLength(0);
    }
  });
  it.each(["courses", "steps"])("empty %s is 200 with real zero counts, no fake step KPI", async which => {
    if (which === "courses") m.courses.mockResolvedValueOnce(courseStats([]));
    else m.steps.mockResolvedValueOnce(stepStats([]));
    const r = await req("A", "/" + which);
    expect(r.status).toBe(200);
    privacy(r);
    const body = await r.json();
    expect(body.success).toBe(true);
    if (which === "courses") {
      expect(body.data).toEqual({ courses: [], totalCourses: 0, totalDays: 0 });
    } else {
      expect(body.data).toEqual({ steps: [], totalSteps: 0, progressMetrics: "NOT_COMPUTED" });
    }
  });
  it("invalid aggregate + private provider failure are fixed 500 without PII", async () => {
    m.courses.mockResolvedValueOnce({ ...courseStats(["TRAINER_A"]), totalCourses: 9 });
    let r = await req("A");
    expect(r.status).toBe(500);
    privacy(r);
    expect(JSON.stringify(await r.json())).not.toContain(PII);
    m.steps.mockRejectedValueOnce(new Error(PII));
    r = await req("A", "/steps");
    expect(r.status).toBe(500);
    privacy(r);
    expect(await r.json()).toEqual({
      success: false, code: "INTERNAL_SERVER_ERROR", error: "Внутренняя ошибка сервера",
    });
  });
  it("early real limiter 429 is private and Core/role lookup never run", async () => {
    m.rateLimited = true;
    const r = await req("ADMIN", "/courses?scope=all");
    expect(r.status).toBe(429);
    privacy(r);
    expect(m.rateCalls.length).toBeGreaterThan(0);
    noStats();
    expect(m.findUser.mock.calls.filter(([q]) => q.select.role && !q.select.sessionsRevokedAt)).toHaveLength(0);
  });
});
