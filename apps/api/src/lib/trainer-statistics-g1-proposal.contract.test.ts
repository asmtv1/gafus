/**
 * AG1 TR018 PROPOSED contract fixture. Mounts Hono ONLY in this test.
 * Never imported/registered by apps/api/src/app.ts, no database access.
 */
import { Hono, type Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  verify: vi.fn(),
  trainerExists: vi.fn(),
  courses: vi.fn(),
  steps: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));

import { authMiddleware } from "../middleware/auth";
import {
  trainerStatisticsG1Proposal as proposal,
  projectCourseStatisticsForTrainer,
  projectStepStatisticsForTrainer,
  resolveTrainerStatisticsScope,
} from "./trainer-statistics-g1-proposal";

const PRIVATE = "FOREIGN_STUDENT_PRIVATE_EMAIL_AND_RECEIPT";
const actors: Record<string, { id: string; role: string }> = {
  "token-A": { id: "TRAINER_A", role: "TRAINER" },
  "token-B": { id: "TRAINER_B", role: "TRAINER" },
  "token-ADMIN": { id: "ADMIN_1", role: "ADMIN" },
  "token-MOD": { id: "MODERATOR_1", role: "MODERATOR" },
  "token-USER": { id: "USER_1", role: "USER" },
  "token-PARTNER": { id: "PARTNER_1", role: "PARTNER" },
};
const bearer = (token: string) => ({ Authorization: "Bearer " + token });
const course = (owner: string) => ({
  id: "COURSE_" + owner,
  name: "Title " + owner,
  logoImg: "",
  avgRating: null,
  isPrivate: false,
  isPaid: false,
  isPersonalized: false,
  trainingLevel: "BEGINNER" as const,
  totalUsers: 2,
  completedUsers: 1,
  inProgressUsers: 1,
  notStartedUsers: 0,
  author: { username: owner, fullName: null },
  userCourses: [{ userId: PRIVATE, user: { email: PRIVATE } }],
  reviews: [{ comment: PRIVATE, user: { username: PRIVATE } }],
  privateReceipt: PRIVATE,
});
const rawCourses = (ids: string[]) => ({
  courses: ids.map(course),
  totalCourses: ids.length,
  totalDays: ids.length * 2,
  ownerPrivateNotes: PRIVATE,
});
const rawSteps = (ids: string[]) => ({
  steps: ids.map((id) => ({
    id: "STEP_" + id,
    title: "Step " + id,
    durationSec: 20,
    usedInDaysCount: 2,
    usedInCoursesCount: 1,
    totalUsers: 0,
    completedUsers: 0,
    inProgressUsers: 0,
    notStartedUsers: 0,
    privateParticipant: PRIVATE,
  })),
  totalSteps: ids.length,
});
function testOnlyHonoFixture() {
  const app = new Hono();
  const markPrivate = async (c: Context, next: () => Promise<void>) => {
    c.header("Cache-Control", proposal.cacheControl);
    c.header("Referrer-Policy", proposal.referrerPolicy);
    await next();
    c.header("Cache-Control", proposal.cacheControl);
  };
  app.use("/api/v1/trainer/statistics/*", markPrivate);
  app.use("/api/v1/trainer/statistics/*", authMiddleware);
  for (const [path, kind] of [
    [proposal.coursesPath, "courses"],
    [proposal.stepsPath, "steps"],
  ] as const) {
    app.get(path, async (c) => {
      try {
        const actor = c.get("user");
        const access = await resolveTrainerStatisticsScope(actor, c.req.queries(), m.trainerExists);
        if (!access.ok) {
          return c.json(
            { success: false, code: access.code, error: access.error },
            access.status,
          );
        }
        const { userId, isElevated } = access.scope;
        const source = kind === "courses"
          ? await m.courses(userId, isElevated)
          : await m.steps(userId, isElevated);
        const data = kind === "courses"
          ? projectCourseStatisticsForTrainer(source)
          : projectStepStatisticsForTrainer(source);
        return c.json({ success: true, data });
      } catch {
        return c.json({
          success: false, code: "INTERNAL_SERVER_ERROR",
          error: "Внутренняя ошибка сервера",
        }, 500);
      }
    });
  }
  return app;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.verify.mockImplementation(async (token: string) => actors[token] ?? null);
  m.trainerExists.mockImplementation(async (id: string) =>
    id === "TRAINER_A" || id === "TRAINER_B"
  );
  m.courses.mockImplementation(async (userId: string, elevated: boolean) =>
    rawCourses(elevated ? ["TRAINER_A", "TRAINER_B"] : [userId])
  );
  m.steps.mockImplementation(async (userId: string, elevated: boolean) =>
    rawSteps(elevated ? ["TRAINER_A", "TRAINER_B"] : [userId])
  );
});
function assertPrivate(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("AG1 TR018 UNMOUNTED G1 statistics proposal, Hono fixture ONLY", () => {
  it("declares only proposed explicit GET paths (never app-mounted)", () => {
    expect(proposal.method).toBe("GET");
    expect(proposal.coursesPath).toBe("/api/v1/trainer/statistics/courses");
    expect(proposal.stepsPath).toBe("/api/v1/trainer/statistics/steps");
  });
  it.each([proposal.coursesPath, proposal.stepsPath])(
    "guest GET %s denied 401 before statistics Core", async (path) => {
      const r = await testOnlyHonoFixture().request(path);
      expect(r.status).toBe(401);
      assertPrivate(r);
      expect(m.courses).not.toHaveBeenCalled();
      expect(m.steps).not.toHaveBeenCalled();
    },
  );
  it.each(["token-USER", "token-PARTNER", "token-MOD"])(
    "non-staff %s rejected 403, zero Core queries", async (token) => {
      const r = await testOnlyHonoFixture().request(proposal.coursesPath, {
        headers: bearer(token),
      });
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ success: false, code: "FORBIDDEN" });
      assertPrivate(r);
      expect(m.courses).not.toHaveBeenCalled();
      expect(m.trainerExists).not.toHaveBeenCalled();
    },
  );
  it.each(["token-A", "token-B"])(
    "%s only gets own courses, no student PII or raw reviews", async (token) => {
      const owner = token === "token-A" ? "TRAINER_A" : "TRAINER_B";
      const r = await testOnlyHonoFixture().request(proposal.coursesPath, {
        headers: bearer(token),
      });
      expect(r.status).toBe(200);
      assertPrivate(r);
      const payload = await r.json();
      expect(payload.success).toBe(true);
      expect(payload.data.totalCourses).toBe(1);
      expect(payload.data.totalDays).toBe(2);
      expect(payload.data.courses[0]).toMatchObject({
        id: "COURSE_" + owner, totalUsers: 2, completedUsers: 1,
        inProgressUsers: 1, notStartedUsers: 0,
      });
      expect(payload.data.courses[0]).not.toHaveProperty("reviews");
      expect(payload.data.courses[0]).not.toHaveProperty("userCourses");
      expect(JSON.stringify(payload)).not.toContain(PRIVATE);
      expect(m.courses).toHaveBeenCalledExactlyOnceWith(owner, false);
      expect(m.trainerExists).not.toHaveBeenCalled();
    },
  );
  it.each([
    "?scope=all",
    "?scope=trainer&trainerUserId=TRAINER_B",
    "?userId=TRAINER_B&isElevated=true",
  ])("TRAINER_A cannot select foreign/elevated scope %s", async (query) => {
    const r = await testOnlyHonoFixture().request(proposal.coursesPath + query, {
      headers: bearer("token-A"),
    });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(m.courses).not.toHaveBeenCalled();
  });
  it.each([
    ["token-A", "?scope=own&scope=all"],
    ["token-ADMIN", "?scope=all&scope=trainer"],
    ["token-ADMIN", "?scope=trainer&trainerUserId=TRAINER_A&trainerUserId=TRAINER_B"],
  ])("rejects duplicate query keys for %s: %s", async (token, query) => {
    const r = await testOnlyHonoFixture().request(proposal.coursesPath + query, {
      headers: bearer(token),
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "BAD_QUERY" });
    expect(m.courses).not.toHaveBeenCalled();
    expect(m.trainerExists).not.toHaveBeenCalled();
  });
  it.each([
    "",
    " ",
    " TRAINER_A",
    "TRAINER_A ",
    "a.b",
    "a/b",
    "user@example.com",
    "unicode-ё",
    "a".repeat(129),
  ])("ADMIN rejects malformed trainerUserId before role lookup: %s", async (id) => {
    const query = "?scope=trainer&trainerUserId=" + encodeURIComponent(id);
    const r = await testOnlyHonoFixture().request(proposal.coursesPath + query, {
      headers: bearer("token-ADMIN"),
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ success: false, code: "BAD_QUERY" });
    assertPrivate(r);
    expect(m.trainerExists).not.toHaveBeenCalled();
    expect(m.courses).not.toHaveBeenCalled();
    expect(m.steps).not.toHaveBeenCalled();
  });
  it("ADMIN accepts full 128-byte allowlisted trainer ID then verifies role", async () => {
    const id = "T" + "a".repeat(127);
    m.trainerExists.mockResolvedValueOnce(true);
    const r = await testOnlyHonoFixture().request(
      proposal.stepsPath + "?scope=trainer&trainerUserId=" + id,
      { headers: bearer("token-ADMIN") },
    );
    expect(r.status).toBe(200);
    assertPrivate(r);
    expect(m.trainerExists).toHaveBeenCalledExactlyOnceWith(id);
    expect(m.steps).toHaveBeenCalledExactlyOnceWith(id, false);
  });
  it("ADMIN must explicitly select scope; no implicit global elevation", async () => {
    const r = await testOnlyHonoFixture().request(proposal.coursesPath, {
      headers: bearer("token-ADMIN"),
    });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "BAD_QUERY" });
    expect(m.courses).not.toHaveBeenCalled();
  });
  it("ADMIN scope=all explicitly sees aggregate data across authors", async () => {
    const r = await testOnlyHonoFixture().request(
      proposal.coursesPath + "?scope=all", { headers: bearer("token-ADMIN") },
    );
    expect(r.status).toBe(200);
    const payload = await r.json();
    expect(payload.data.totalCourses).toBe(2);
    expect(payload.data.totalDays).toBe(4);
    expect(payload.data.courses.map((c: { id: string }) => c.id)).toEqual([
      "COURSE_TRAINER_A", "COURSE_TRAINER_B",
    ]);
    expect(JSON.stringify(payload)).not.toContain(PRIVATE);
    expect(m.courses).toHaveBeenCalledExactlyOnceWith("ADMIN_1", true);
    expect(m.trainerExists).not.toHaveBeenCalled();
  });
  it("ADMIN explicit trainer scope filters TRAINER_B and never all=true", async () => {
    const r = await testOnlyHonoFixture().request(
      proposal.coursesPath + "?scope=trainer&trainerUserId=TRAINER_B",
      { headers: bearer("token-ADMIN") },
    );
    expect(r.status).toBe(200);
    expect((await r.json()).data.courses.map((c: { id: string }) => c.id)).toEqual([
      "COURSE_TRAINER_B",
    ]);
    expect(m.trainerExists).toHaveBeenCalledExactlyOnceWith("TRAINER_B");
    expect(m.courses).toHaveBeenCalledExactlyOnceWith("TRAINER_B", false);
  });
  it("ADMIN explicit missing trainer is 404 without aggregate query", async () => {
    const r = await testOnlyHonoFixture().request(
      proposal.coursesPath + "?scope=trainer&trainerUserId=NOT_FOUND",
      { headers: bearer("token-ADMIN") },
    );
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(m.courses).not.toHaveBeenCalled();
  });
  it("empty scoped list is an actual empty DTO, not synthetic KPIs", async () => {
    m.courses.mockResolvedValueOnce(rawCourses([]));
    const r = await testOnlyHonoFixture().request(proposal.coursesPath, {
      headers: bearer("token-A"),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      success: true, data: { courses: [], totalCourses: 0, totalDays: 0 },
    });
  });
  it("source throws private SQL text: error 500 never exposes exception", async () => {
    m.courses.mockRejectedValueOnce(new Error(PRIVATE));
    const r = await testOnlyHonoFixture().request(proposal.coursesPath, {
      headers: bearer("token-A"),
    });
    expect(r.status).toBe(500);
    assertPrivate(r);
    expect(await r.json()).toEqual({
      success: false, code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    });
  });
  it("invalid source aggregate fails closed, never fabricates totals", async () => {
    m.courses.mockResolvedValueOnce({
      ...rawCourses(["TRAINER_A"]), totalCourses: 99,
    });
    const r = await testOnlyHonoFixture().request(proposal.coursesPath, {
      headers: bearer("token-A"),
    });
    expect(r.status).toBe(500);
  });
  it("steps preserve true linkage counts but NOT mock zero user-progress KPIs", async () => {
    const r = await testOnlyHonoFixture().request(proposal.stepsPath, {
      headers: bearer("token-A"),
    });
    expect(r.status).toBe(200);
    const payload = await r.json();
    expect(payload.data).toEqual({
      steps: [{
        id: "STEP_TRAINER_A", title: "Step TRAINER_A",
        durationSec: 20, usedInDaysCount: 2, usedInCoursesCount: 1,
      }],
      totalSteps: 1,
      progressMetrics: "NOT_COMPUTED",
    });
    expect(JSON.stringify(payload)).not.toContain(PRIVATE);
    expect(m.steps).toHaveBeenCalledExactlyOnceWith("TRAINER_A", false);
  });
  it("ADMIN explicit scope applies to steps; foreign trainer cannot elevate", async () => {
    const allowed = await testOnlyHonoFixture().request(
      proposal.stepsPath + "?scope=all", { headers: bearer("token-ADMIN") },
    );
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).data.totalSteps).toBe(2);
    expect(m.steps).toHaveBeenCalledWith("ADMIN_1", true);
    m.steps.mockClear();
    const forbidden = await testOnlyHonoFixture().request(
      proposal.stepsPath + "?scope=trainer&trainerUserId=TRAINER_A",
      { headers: bearer("token-B") },
    );
    expect(forbidden.status).toBe(403);
    expect(m.steps).not.toHaveBeenCalled();
  });
  it("A -> B -> A requests remain actor-scoped without shared response cache", async () => {
    const h = testOnlyHonoFixture();
    for (const [token, owner] of [
      ["token-A", "TRAINER_A"], ["token-B", "TRAINER_B"], ["token-A", "TRAINER_A"],
    ]) {
      const r = await h.request(proposal.coursesPath, { headers: bearer(token) });
      expect(r.status).toBe(200);
      expect((await r.json()).data.courses[0].id).toBe("COURSE_" + owner);
    }
    expect(m.courses.mock.calls).toEqual([
      ["TRAINER_A", false], ["TRAINER_B", false], ["TRAINER_A", false],
    ]);
  });
});
