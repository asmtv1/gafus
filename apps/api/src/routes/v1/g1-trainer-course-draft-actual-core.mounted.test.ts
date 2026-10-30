/**
 * AG1-TR012 distinct trust-boundary test: ACTUAL app/Hono ->
 * ACTUAL @gafus/core/services/trainerCourse.getCourseDraftWithRelations ->
 * synthetic Prisma only, with real signed/verified JWT and actual rate limiter.
 * NO vi.mock of trainerCourse/Core. NO SQL/Redis/provider/device writes.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  findCourse: vi.fn(), findSession: vi.fn(), registration: vi.fn(),
  writes: vi.fn(), rateKeys: [] as string[], throttle: false,
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    init(opts: { windowMs: number }) { this.windowMs = opts.windowMs; }
    async increment(key: string) {
      m.rateKeys.push(key);
      return {
        totalHits: m.throttle ? 101 : 1,
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
      user: {
        ...actual.prisma.user, findUnique: m.findSession,
      },
      course: {
        ...actual.prisma.course,
        findUnique: m.findCourse,
        create: m.writes, update: m.writes,
        delete: m.writes, updateMany: m.writes,
      },
      $transaction: m.writes,
      courseAccess: { create: m.writes, delete: m.writes },
      dayOnCourse: { create: m.writes, delete: m.writes },
    },
  };
});
vi.mock("@gafus/core/services/auth", async (importOriginal) => ({
  ...await importOriginal<object>(),
  isRegistrationCompleted: m.registration,
}));

// Crucial: @gafus/core/services/trainerCourse is NOT mocked or replaced.
import { getCourseDraftWithRelations } from "@gafus/core/services/trainerCourse";
import { app } from "../../app";
import { generateAccessToken } from "@gafus/auth/jwt";
import { LoggerFactory, UnifiedLogger } from "@gafus/logger";

const prefix = "/api/v1/trainer/courses/";
const SECRET = "PRIVATE_COURSE_DB_RECEIPT_STUDENT_EMAIL_AND_TOKEN";
const roles = {
  A: { id: "trainer_A", username: "owner_a", role: "TRAINER" },
  B: { id: "trainer_B", username: "owner_b", role: "TRAINER" },
  ADMIN: { id: "admin_A", username: "admin", role: "ADMIN" },
  MOD: { id: "moderator_A", username: "moderator", role: "MODERATOR" },
  USER: { id: "user_A", username: "user", role: "USER" },
} as const;
const tokens: Record<string, string> = {};
type SyntheticCourse = {
  id: string; authorId: string; name: string;
  dayLinks: {
    id: string; dayId: string; order: number;
    day: { id: string; title: string; email?: string };
    privateStudent?: string;
  }[];
  access: {
    userId: string;
    user: { id: string; username: string; email?: string };
    secret?: string;
  }[];
  [key: string]: unknown;
};
const course = (id: string, authorId: string): SyntheticCourse => ({
  id, authorId, name: "Owned by " + authorId,
  guideContent: null, shortDesc: "", description: "", duration: "14 дней",
  videoUrl: null, logoImg: "", isPrivate: true, isPaid: false,
  showInProfile: true, isPersonalized: false, equipment: "",
  trainingLevel: "BEGINNER",
  // Prisma mock deliberately receives unordered rows: orderBy query must sort.
  dayLinks: [
    {
      id: "link_3", dayId: "day_3", order: 3,
      day: { id: "day_3", title: "Третий день", email: SECRET },
      privateStudent: SECRET,
    },
    {
      id: "link_1", dayId: "day_1", order: 1,
      day: { id: "day_1", title: "Первый день", email: SECRET },
      privateStudent: SECRET,
    },
  ],
  access: [
    {
      userId: "student_A",
      user: { id: "student_A", username: "PRIVATE_STUDENT_A", email: SECRET },
      secret: SECRET,
    },
  ],
  priceRub: 1500, payoutIban: SECRET, privateReceipt: SECRET,
  reviews: [{ text: SECRET }], userCourses: [{ email: SECRET }],
  updatedAt: new Date("2026-10-21T08:00:00Z"),
});
const db = new Map<string, SyntheticCourse>();

beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  for (const [alias, user] of Object.entries(roles)) {
    tokens[alias] = await generateAccessToken(user);
  }
});
beforeEach(() => {
  vi.resetAllMocks();
  m.rateKeys.length = 0;
  m.throttle = false;
  m.registration.mockResolvedValue(true);
  m.findSession.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(roles).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
  db.clear();
  db.set("course_A", course("course_A", "trainer_A"));
  db.set("course_B", course("course_B", "trainer_B"));
  m.findCourse.mockImplementation(async ({
    where, select,
  }: {
    where: { id: string };
    select: { dayLinks?: { orderBy?: { order: string } } };
  }) => {
    const found = db.get(where.id);
    if (!found) return null;
    // Model Prisma's nested relation orderBy: return unsorted if the Core
    // query drops it, causing the HTTP order expectation to fail.
    return {
      ...found,
      dayLinks: select.dayLinks?.orderBy?.order === "asc"
        ? [...found.dayLinks].sort((a, b) => a.order - b.order)
        : [...found.dayLinks],
    };
  });
});
const request = (alias: string, suffix = "course_A/draft") => app.request(
  prefix + suffix,
  { method: "GET", headers: alias ? {
    authorization: "Bearer " + (tokens[alias] ?? alias),
  } : {} },
);
const privateResponse = (r: Response) => {
  const cache = (r.headers.get("cache-control") ?? "")
    .toLowerCase().split(",").map(x => x.trim());
  expect(cache).toContain("private");
  expect(cache).toContain("no-store");
  expect(cache).not.toContain("public");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites = () => expect(m.writes).not.toHaveBeenCalled();
const noPII = (body: unknown) => expect(JSON.stringify(body)).not.toContain(SECRET);
const selectedRelations = () => {
  const lastQuery = m.findCourse.mock.lastCall?.[0];
  expect(Object.keys(lastQuery.select).sort()).toEqual([
    "id", "name", "guideContent", "shortDesc", "description",
    "duration", "videoUrl", "logoImg", "isPrivate", "isPaid",
    "showInProfile", "isPersonalized", "equipment", "trainingLevel",
    "authorId", "dayLinks", "access",
  ].sort());
  expect(m.findCourse).toHaveBeenCalledWith({
    where: { id: expect.any(String) },
    select: expect.objectContaining({
      authorId: true,
      dayLinks: {
        select: {
          id: true, dayId: true, order: true,
          day: { select: { id: true, title: true } },
        },
        orderBy: { order: "asc" },
      },
      access: {
        select: {
          userId: true,
          user: { select: { id: true, username: true } },
        },
      },
    }),
  });
};

describe("TR012 real app -> real Core -> mocked Prisma, signed JWT", () => {
  it("source Core function is callable without a mocked Core facade", () => {
    expect(typeof getCourseDraftWithRelations).toBe("function");
    noWrites();
  });
  it("A→B→A owner: real DB authorId filter, nested relation order, strict DTO", async () => {
    for (const [actor, id, owner] of [
      ["A", "course_A", "trainer_A"],
      ["B", "course_B", "trainer_B"],
      ["A", "course_A", "trainer_A"],
    ] as const) {
      const r = await request(actor, id + "/draft");
      expect(r.status).toBe(200);
      privateResponse(r);
      const body = await r.json();
      expect(body).toEqual({
        success: true,
        data: {
          id, name: "Owned by " + owner, guideContent: null,
          shortDesc: "", description: "", duration: "14 дней",
          videoUrl: null, logoImg: "", isPrivate: true, isPaid: false,
          showInProfile: true, isPersonalized: false,
          equipment: "", trainingLevel: "BEGINNER",
          dayLinks: [
            { id: "link_1", dayId: "day_1", order: 1,
              day: { id: "day_1", title: "Первый день" } },
            { id: "link_3", dayId: "day_3", order: 3,
              day: { id: "day_3", title: "Третий день" } },
          ],
          access: [{
            userId: "student_A",
            user: { id: "student_A", username: "PRIVATE_STUDENT_A" },
          }],
        },
      });
      noPII(body);
      selectedRelations();
    }
    expect(m.findCourse.mock.calls.map(([query]) => query.where.id))
      .toEqual(["course_A", "course_B", "course_A"]);
    noWrites();
  });
  it("interleaved A/B Prisma responses retain request-local JWT ownership", async () => {
    const pending = new Map<string, (value: SyntheticCourse) => void>();
    m.findCourse.mockImplementation((q: { where: { id: string } }) =>
      new Promise<SyntheticCourse>(resolve => {
        pending.set(q.where.id, resolve);
      }));
    const responseA = request("A", "course_A/draft");
    const responseB = request("B", "course_B/draft");
    await vi.waitFor(() => expect(pending.size).toBe(2));
    // Resolve in inverse order, without a shared mutable "current user".
    pending.get("course_B")!(course("course_B", "trainer_B"));
    pending.get("course_A")!(course("course_A", "trainer_A"));
    const [a, b] = await Promise.all([responseA, responseB]);
    expect([a.status, b.status]).toEqual([200, 200]);
    privateResponse(a);
    privateResponse(b);
    const [ownerA, ownerB] = await Promise.all([a.json(), b.json()]);
    expect(ownerA.data).toMatchObject({
      id: "course_A", name: "Owned by trainer_A",
    });
    expect(ownerB.data).toMatchObject({
      id: "course_B", name: "Owned by trainer_B",
    });
    noPII(ownerA);
    noPII(ownerB);
    noWrites();
  });
  it("ADMIN bypasses authorId only from verified JWT; no client owner override", async () => {
    const r = await request("ADMIN", "course_B/draft");
    expect(r.status).toBe(200);
    privateResponse(r);
    expect((await r.json()).data.id).toBe("course_B");
    expect(m.findCourse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ where: { id: "course_B" } }),
    );
    selectedRelations();
    noWrites();
  });
  it.each([
    ["A", "course_B"], ["B", "course_A"],
    ["A", "missing"], ["ADMIN", "missing"],
  ])("foreign/missing indistinguishable %s %s -> 404", async (actor, id) => {
    const r = await request(actor, id + "/draft");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({
      success: false, code: "NOT_FOUND", error: "Курс не найден",
    });
    privateResponse(r);
    noWrites();
  });
  it.each(["MOD", "USER"])("nontrainer JWT %s denied before course DB lookup", async alias => {
    const r = await request(alias);
    expect(r.status).toBe(403);
    privateResponse(r);
    expect(m.findCourse).not.toHaveBeenCalled();
    noWrites();
  });
  it("guest 401 before Core/Prisma and no private fields", async () => {
    const r = await request("");
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ code: "UNAUTHORIZED" });
    privateResponse(r);
    expect(m.findCourse).not.toHaveBeenCalled();
    noWrites();
  });
  it("forged allowAdmin/userId never reaches Core", async () => {
    const r = await request("B", "course_A/draft?allowAdmin=true&userId=trainer_A");
    expect(r.status).toBe(400);
    privateResponse(r);
    expect(m.findCourse).not.toHaveBeenCalled();
    noWrites();
  });
  it("empty linked day/access arrays stay []; nullable fields stay null", async () => {
    const existing = db.get("course_A")!;
    db.set("course_A", {
      ...existing, dayLinks: [], access: [],
      guideContent: null, videoUrl: null,
    });
    const r = await request("A");
    expect(r.status).toBe(200);
    privateResponse(r);
    const body = await r.json();
    expect(body.data.dayLinks).toEqual([]);
    expect(body.data.access).toEqual([]);
    expect(body.data.guideContent).toBeNull();
    expect(body.data.videoUrl).toBeNull();
    noPII(body);
    noWrites();
  });
  it("actual Core swallows Prisma DB error to null => masked 404, never 500", async () => {
    m.findCourse.mockRejectedValueOnce(new Error(SECRET));
    const r = await request("A");
    expect(r.status).toBe(404);
    privateResponse(r);
    const body = await r.json();
    expect(body).toEqual({
      success: false, code: "NOT_FOUND", error: "Курс не найден",
    });
    noPII(body);
    noWrites();
  });
  it("CURRENT packaged Core signed JWT catches Prisma and real logger emits only safe code", async () => {
    // This observes ACTUAL cached UnifiedLogger and Pino. No vi.mock of
    // @gafus/logger or Core; both spies invoke the original implementations.
    const current = LoggerFactory.getAllLoggers().get("web:trainer-course");
    expect(current).toBeInstanceOf(UnifiedLogger);
    const unified = current as UnifiedLogger;
    const logCall = vi.spyOn(unified, "error");
    const pinoCall = vi.spyOn(unified.getPinoLogger(), "error");
    const privateException = new Error(SECRET + " trainer_A course_A private@example.invalid");
    privateException.stack = "Error: " + SECRET +
      "\\n at trainer_A course_A private@example.invalid";
    try {
      m.findCourse.mockRejectedValueOnce(privateException);
      const r = await request("A");
      expect(r.status).toBe(404);
      privateResponse(r);
      const body = await r.json();
      expect(body).toEqual({
        success: false, code: "NOT_FOUND", error: "Курс не найден",
      });
      noPII(body);
      expect(m.findCourse).toHaveBeenCalledOnce();
      noWrites();
      expect(logCall).toHaveBeenCalledExactlyOnceWith("TRAINER_COURSE_DRAFT_READ_FAILED");
      expect(pinoCall).toHaveBeenCalledExactlyOnceWith(
        { err: undefined }, "TRAINER_COURSE_DRAFT_READ_FAILED",
      );
      const recorded = JSON.stringify([logCall.mock.calls, pinoCall.mock.calls, body]);
      for (const prohibited of [
        SECRET, "private@example.invalid", "trainer_A", "course_A", "stack",
      ]) {
        expect(recorded).not.toContain(prohibited);
      }
    } finally {
      pinoCall.mockRestore();
      logCall.mockRestore();
    }
  });
  it("Core nested relations mismatch reaches real API projector masked500", async () => {
    const source = db.get("course_A")!;
    db.set("course_A", {
      ...source, access: [{ userId: "student_A",
        user: { id: "student_OTHER", username: "student" }, secret: SECRET }],
    });
    const r = await request("A");
    expect(r.status).toBe(500);
    privateResponse(r);
    noPII(await r.json());
    noWrites();
  });
  it("early rate 429 does not invoke actual course read or Prisma writes", async () => {
    m.throttle = true;
    const r = await request("A");
    expect(r.status).toBe(429);
    privateResponse(r);
    expect(await r.json()).toMatchObject({ success: false, code: "RATE_LIMITED" });
    expect(m.findCourse).not.toHaveBeenCalled();
    expect(m.rateKeys.length).toBeGreaterThan(0);
    noWrites();
  });
});
