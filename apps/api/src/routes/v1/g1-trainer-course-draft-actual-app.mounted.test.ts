/**
 * AG4-TR-012 approved GET ONLY, actual apps/api/src/app.ts mounting.
 * Real signed JWT + in-process existing auth/rate limiter; mocked Core/session/Redis.
 * No PostgreSQL, provider, CDN, package build, or browser cutover.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import type * as CourseModule from "@gafus/core/services/trainerCourse";

const m = vi.hoisted(() => ({
  draft: vi.fn(), completed: vi.fn(), session: vi.fn(),
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
  const actual = await importOriginal<typeof PrismaModule>();
  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      user: { ...actual.prisma.user, findUnique: m.session },
    },
  };
});
vi.mock("@gafus/core/services/auth", async (importOriginal) => ({
  ...await importOriginal<object>(), isRegistrationCompleted: m.completed,
}));
vi.mock("@gafus/core/services/trainerCourse", async (importOriginal) => ({
  ...await importOriginal<typeof CourseModule>(),
  getCourseDraftWithRelations: m.draft,
}));

import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";

const prefix = "/api/v1/trainer/courses/";
const canary = "SECRET_BUYER_EMAIL_TOKEN_REVIEW_AND_FINANCE";
const users = {
  A: { id: "trainer_A", username: "trainer_a", role: "TRAINER" },
  B: { id: "trainer_B", username: "trainer_b", role: "TRAINER" },
  ADMIN: { id: "admin_1", username: "admin", role: "ADMIN" },
  MOD: { id: "moderator_1", username: "mod", role: "MODERATOR" },
  USER: { id: "user_1", username: "user", role: "USER" },
  PARTNER: { id: "partner_1", username: "partner", role: "PARTNER" },
} as const;
const tokens: Record<string, string> = {};
const draft = (id: string, owner = "trainer_A") => ({
  id, name: "Course-" + owner,
  guideContent: null, shortDesc: "Guide",
  description: "Description", duration: "14 дней", videoUrl: null,
  logoImg: "/course.webp", isPrivate: true, isPaid: false,
  showInProfile: true, isPersonalized: false, equipment: "",
  trainingLevel: "BEGINNER",
  dayLinks: [{
    id: "link_1", dayId: "day_1", order: 1,
    day: { id: "day_1", title: "День 1", privateNotes: canary },
    studentProgress: { token: canary },
  }],
  access: [{
    userId: "student_1", user: {
      id: "student_1", username: "student", email: canary, password: canary,
    },
    privateReceipt: canary,
  }],
  authorId: owner, userCourses: [{ email: canary }],
  purchases: [{ card: canary }], privateMetadata: canary,
});
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  for (const [alias, actor] of Object.entries(users)) {
    tokens[alias] = await generateAccessToken(actor);
  }
});
beforeEach(() => {
  vi.clearAllMocks();
  m.rateLimited = false;
  m.rateCalls.length = 0;
  m.completed.mockResolvedValue(true);
  m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(users).find((candidate) => candidate.id === where.id);
    return actor
      ? { sessionsRevokedAt: null, registrationPending: false, role: actor.role }
      : null;
  });
  m.draft.mockImplementation(async (
    id: string, actorId: string, options: { allowAdmin: boolean },
  ) => {
    if (id === "missing") return null;
    if (!options.allowAdmin &&
        actorId !== (id === "course_B" ? "trainer_B" : "trainer_A")) return null;
    return draft(id, id === "course_B" ? "trainer_B" : "trainer_A");
  });
});
const req = (who: string, suffix = "course_A/draft", method = "GET") => app.request(
  prefix + suffix,
  { method, headers: who ? { authorization: "Bearer " + (tokens[who] ?? who) } : {} },
);
const privateHeaders = (response: Response) => {
  const cache = (response.headers.get("cache-control") ?? "").toLowerCase().split(",").map(x => x.trim());
  expect(cache).toContain("private");
  expect(cache).toContain("no-store");
  expect(cache).not.toContain("public");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
};
const noCore = () => expect(m.draft).not.toHaveBeenCalled();
const safe = (response: unknown) => {
  expect(JSON.stringify(response)).not.toContain(canary);
};
describe("AG4TR012 actual app-mounted GET /trainer/courses/:courseId/draft", () => {
  it.each(["", "bad.jwt", "Bearer?"])("guest/invalid bearer 401 private, no Core: %s", async who => {
    const r = await req(who);
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({
      success: false, code: "UNAUTHORIZED",
    });
    privateHeaders(r);
    noCore();
    expect(m.rateCalls).toHaveLength(0);
  });
  it("registration pending preserves existing distinct auth code", async () => {
    m.completed.mockResolvedValueOnce(false);
    const r = await req("A");
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({
      success: false, code: "REGISTRATION_PENDING",
    });
    privateHeaders(r);
    noCore();
  });
  it.each(["MOD", "USER", "PARTNER"])("%s role 403 before Core", async who => {
    const r = await req(who);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ success: false, code: "FORBIDDEN" });
    privateHeaders(r);
    noCore();
  });
  it("A→B→A signed JWT never reuses stale owner nor leaks private relations", async () => {
    for (const [who, course, owner] of [
      ["A", "course_A", "trainer_A"],
      ["B", "course_B", "trainer_B"],
      ["A", "course_A", "trainer_A"],
    ] as const) {
      const r = await req(who, course + "/draft");
      expect(r.status).toBe(200);
      privateHeaders(r);
      const body = await r.json();
      expect(body).toEqual({ success: true, data: {
        id: course, name: "Course-" + owner, guideContent: null,
        shortDesc: "Guide", description: "Description", duration: "14 дней",
        videoUrl: null, logoImg: "/course.webp", isPrivate: true,
        isPaid: false, showInProfile: true, isPersonalized: false,
        equipment: "", trainingLevel: "BEGINNER",
        dayLinks: [{ id: "link_1", dayId: "day_1", order: 1, day: { id: "day_1", title: "День 1" } }],
        access: [{ userId: "student_1", user: { id: "student_1", username: "student" } }],
      } });
      safe(body);
    }
    expect(m.draft.mock.calls).toEqual([
      ["course_A", "trainer_A", { allowAdmin: false }],
      ["course_B", "trainer_B", { allowAdmin: false }],
      ["course_A", "trainer_A", { allowAdmin: false }],
    ]);
  });
  it("max valid ASCII 128-character ID passes untrimmed to Core", async () => {
    const id = "c" + "a".repeat(127);
    const r = await req("A", id + "/draft");
    expect(r.status).toBe(200);
    privateHeaders(r);
    const body = await r.json();
    expect(body).toMatchObject({ success: true, data: { id } });
    expect(m.draft).toHaveBeenCalledExactlyOnceWith(
      id, "trainer_A", { allowAdmin: false },
    );
  });
  it("ADMIN has allowAdmin only via verified JWT, not input", async () => {
    const r = await req("ADMIN", "course_B/draft");
    expect(r.status).toBe(200);
    privateHeaders(r);
    expect((await r.json()).data.id).toBe("course_B");
    expect(m.draft).toHaveBeenCalledExactlyOnceWith(
      "course_B", "admin_1", { allowAdmin: true },
    );
  });
  it.each([
    ["A", "course_B"], ["B", "course_A"], ["A", "missing"], ["ADMIN", "missing"],
  ])("%s cannot distinguish foreign/missing %s: 404", async (who, id) => {
    const r = await req(who, id + "/draft");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ success: false, code: "NOT_FOUND", error: "Курс не найден" });
    privateHeaders(r);
  });
  it.each([
    "", " ", " course_A", "course_A ", "a.b", "a@b", "é", "a".repeat(129),
    "course_A%2Fother",
  ])("invalid raw courseId %s 400 before Core", async id => {
    const r = await req("A", encodeURIComponent(id).replace("%252F", "%2F") + "/draft");
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({
      success: false, code: "BAD_QUERY", error: "Некорректный ID курса",
    });
    privateHeaders(r);
    noCore();
  });
  it.each(["?userId=trainer_B", "?allowAdmin=true", "?scope=all",
    "?foo=bar", "?foo=1&foo=2", "?authorId=trainer_B"])(
    "extra or duplicate query %s rejected before Core", async query => {
      const r = await req("A", "course_A/draft" + query);
      expect(r.status).toBe(400);
      privateHeaders(r);
      noCore();
    },
  );
  it("empty relations preserve exact [] shape and null nullable fields", async () => {
    m.draft.mockResolvedValueOnce({
      ...draft("course_A"), dayLinks: [], access: [],
      guideContent: null, videoUrl: null,
    });
    const r = await req("A");
    expect(r.status).toBe(200);
    privateHeaders(r);
    const body = await r.json();
    expect(body.data.dayLinks).toEqual([]);
    expect(body.data.access).toEqual([]);
    expect(body.data.guideContent).toBeNull();
    safe(body);
  });
  it.each([
    { dayLinks: [{ id: "a", dayId: "one", order: "1", day: { id: "one", title: "Test" } }] },
    { access: [{ userId: "student_1", user: { id: "student_2", username: "student" } }] },
    { name: null },
    { isPrivate: "false" },
    { id: "other_course" },
  ])("malformed projection masked500 %j", async partial => {
    m.draft.mockResolvedValueOnce({ ...draft("course_A"), ...partial });
    const r = await req("A");
    expect(r.status).toBe(500);
    privateHeaders(r);
    const body = await r.json();
    expect(body).toMatchObject({ success: false, code: "INTERNAL_SERVER_ERROR" });
    safe(body);
  });
  it("uncaught Core exception including PII masked500, no thrown stack to response", async () => {
    m.draft.mockRejectedValueOnce(new Error(canary));
    const r = await req("A");
    expect(r.status).toBe(500);
    privateHeaders(r);
    safe(await r.json());
  });
  it("swallowed DB error represented by Core null fails closed 404", async () => {
    m.draft.mockResolvedValueOnce(null);
    const r = await req("A");
    expect(r.status).toBe(404);
    privateHeaders(r);
  });
  it("early injected real limiter 429 private, never Core", async () => {
    m.rateLimited = true;
    const r = await req("A");
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({
      success: false, code: "RATE_LIMITED",
    });
    privateHeaders(r);
    noCore();
    expect(m.rateCalls.length).toBeGreaterThan(0);
  });
  it("read-only GET only: no POST/PUT/PATCH/DELETE mutation route", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const r = await req("A", "course_A/draft", method);
      expect(r.status).not.toBe(200);
    }
    noCore();
  });
});
