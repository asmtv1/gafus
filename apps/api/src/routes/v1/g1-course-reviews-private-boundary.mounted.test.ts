/** AG1-COURSE030: actual Hono reviews GET + actual Core projection, mocked Prisma only. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  token: vi.fn(), course: vi.fn(), userCourse: vi.fn(), log: vi.fn(),
  getReviews: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    course: { findUnique: m.course },
    userCourse: { findUnique: m.userCourse },
  },
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.token }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), error: m.log }),
}));
vi.mock("@gafus/core/services/course", () => ({
  getCourseReviews: (...args: unknown[]) => m.getReviews(...args),
}));
import { getCourseReviews } from "../../../../../packages/core/src/services/course/reviewService";
import { authMiddleware } from "../../middleware/auth";
import { coursesRoutes } from "./courses";

const PRIVATE = "SYNTHETIC_PRIVATE_REVIEW_AUTHOR_MEDICAL_PAYMENT";
const CREATED = new Date("2026-10-18T12:00:00.000Z");
const route = "/api/v1/courses/reviews";
const actorA = "actor-A", actorB = "actor-B";
const rows = () => ["A", "B"].map((id) => ({
  id: "review-" + id, rating: id === "A" ? 5 : 4,
  comment: "Visible " + id, createdAt: CREATED, updatedAt: CREATED,
  userId: "actor-" + id, courseId: "course-1", privateLedger: PRIVATE,
  user: {
    id: "actor-" + id, username: "public-" + id, email: PRIVATE,
    phone: PRIVATE, hiddenEntitlement: PRIVATE,
    profile: { avatarUrl: null, medicalNotes: PRIVATE },
  },
}));
const mockCourse = (reviews = rows()) => ({
  id: "course-1", name: "Курс", reviews,
});
function server() {
  const app = new Hono();
  app.use("/api/v1/courses/*", authMiddleware);
  app.route("/api/v1/courses", coursesRoutes);
  return app;
}
function get(app: Hono, query: string, token = "token-A") {
  return app.request(route + query, { headers: token ? {
    Authorization: "Bearer " + token,
  } : {} });
}
beforeEach(() => {
  vi.resetAllMocks();
  m.token.mockImplementation(async (token: string) =>
    token === "token-A" ? { id: actorA, username: "A", role: "USER" } :
      token === "token-B" ? { id: actorB, username: "B", role: "USER" } : null
  );
  m.course.mockResolvedValue(mockCourse());
  m.userCourse.mockImplementation(async ({ where }: {
    where: { userId_courseId: { userId: string } };
  }) => ({ status: where.userId_courseId.userId === actorA ? "COMPLETED" : "IN_PROGRESS" }));
  m.getReviews.mockImplementation(getCourseReviews);
});
describe("AG1-COURSE030 mounted review GET with actor and public author projection", () => {
  it("GET actor A exposes only public authors, retains completion and own review", async () => {
    const res = await get(server(), "?courseType=general");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const result = await res.json();
    expect(result.success).toBe(true);
    expect(result.data.courseName).toBe("Курс");
    expect(result.data.reviews).toHaveLength(2);
    expect(result.data.userStatus).toEqual({
      hasCompleted: true,
      userReview: result.data.reviews[0],
    });
    expect(Object.keys(result.data.reviews[0]).sort()).toEqual([
      "comment", "createdAt", "id", "rating", "user",
    ]);
    expect(result.data.reviews[0].user).toEqual({
      id: actorA, username: "public-A", profile: { avatarUrl: null },
    });
    expect(JSON.stringify(result)).not.toContain(PRIVATE);
    expect(m.getReviews).toHaveBeenCalledWith("general", actorA);
  });
  it("same mounted Hono A->B->A never mixes owner completion/review", async () => {
    const app = server();
    for (const [token, completed, reviewId] of [
      ["token-A", true, "review-A"],
      ["token-B", false, "review-B"],
      ["token-A", true, "review-A"],
    ] as const) {
      const response = await get(app, "?courseType=general", token);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const { data } = await response.json();
      expect(data.userStatus.hasCompleted).toBe(completed);
      expect(data.userStatus.userReview.id).toBe(reviewId);
      expect(JSON.stringify(data)).not.toContain(PRIVATE);
    }
    expect(m.userCourse.mock.calls.map(([input]) => input.where.userId_courseId.userId))
      .toEqual([actorA, actorB, actorA]);
  });
  it("known course without reviews is 200 empty, never 404", async () => {
    m.course.mockResolvedValueOnce(mockCourse([]));
    const res = await get(server(), "?courseType=empty");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true, data: {
        courseName: "Курс", reviews: [],
        userStatus: { hasCompleted: true, userReview: null },
      },
    });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("nonexistent course gives 404, no progress/entitlement lookup", async () => {
    m.course.mockResolvedValueOnce(null);
    const res = await get(server(), "?courseType=missing");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: "Курс не найден" });
    expect(m.userCourse).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each(["", "?courseType="])("missing or blank courseType %s gives 400 without Core", async query => {
    const res = await get(server(), query);
    expect(res.status).toBe(400);
    expect(m.getReviews).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("legacy read has NO pagination DTO: pageSize is ignored, never fabricates pages", async () => {
    const res = await get(server(), "?courseType=general&pageSize=1");
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.reviews).toHaveLength(2);
    expect(data).not.toHaveProperty("nextCursor");
    expect(m.getReviews).toHaveBeenCalledWith("general", actorA);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("unexpected Core provider error is masked 500, no cached private status", async () => {
    m.course.mockRejectedValueOnce(new Error(PRIVATE));
    const res = await get(server(), "?courseType=general");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: "Внутренняя ошибка сервера" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const logs = m.log.mock.calls.flat().map((entry: unknown) =>
      entry instanceof Error ? [entry.message, entry.stack].join(" ") : String(entry)
    ).join(" ");
    expect(logs).not.toContain(PRIVATE);
  });
  it("guest without session never runs Core, response stays 401", async () => {
    const res = await get(server(), "?courseType=general", "");
    expect(res.status).toBe(401);
    expect(m.course).not.toHaveBeenCalled();
    expect(m.userCourse).not.toHaveBeenCalled();
  });
});
