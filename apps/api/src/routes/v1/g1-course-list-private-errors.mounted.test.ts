/** AG1: protected course progress list 500 must preserve actor-private headers. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ jwt: vi.fn(), list: vi.fn(), logger: vi.fn() }));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.jwt }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
vi.mock("@gafus/core/services/course", () => ({
  getCoursesWithProgress: m.list,
  checkCourseAccess: vi.fn(),
  checkCourseAccessById: vi.fn(),
  saveCoursePersonalization: vi.fn(),
  getFavoritesCourses: vi.fn(),
  toggleFavoriteCourse: vi.fn(),
  addFavoriteCourse: vi.fn(),
  removeFavoriteCourse: vi.fn(),
  getCourseMetadata: vi.fn(),
  getCourseReviews: vi.fn(),
  createCourseReview: vi.fn(),
  updateCourseReview: vi.fn(),
  deleteCourseReview: vi.fn(),
  rateCourse: vi.fn(),
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.logger }),
}));
import { authMiddleware } from "../../middleware/auth";
import { coursesRoutes } from "./courses";

const path = "/api/v1/courses";
function app() {
  const h = new Hono();
  h.use("/api/v1/courses", authMiddleware);
  h.use("/api/v1/courses/*", authMiddleware);
  h.route(path, coursesRoutes);
  return h;
}
function request(server: Hono, token: string) {
  return server.request(path, { headers: token ? {
    Authorization: "Bearer " + token,
  } : {} });
}
beforeEach(() => {
  vi.resetAllMocks();
  m.jwt.mockImplementation(async (t: string) =>
    t === "A" || t === "B" ? { id: "user-" + t, username: t, role: "USER" } : null
  );
  m.list.mockImplementation(async (actor: string) => [{ id: actor, progressPercent: actor === "user-A" ? 60 : 0 }]);
});
describe("AG1 protected GET course list success/error privacy", () => {
  it("same Hono A->B->A never mixes user progress and keeps 200 private", async () => {
    const server = app();
    for (const [actor, expected] of [["A", 60], ["B", 0], ["A", 60]] as const) {
      const r = await request(server, actor);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({
        success: true, data: [{ id: "user-" + actor, progressPercent: expected }],
      });
      expect(r.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(m.list.mock.calls.map((c) => c[0])).toEqual(["user-A", "user-B", "user-A"]);
  });
  it("Core error masks secret content with 500 and private no-store", async () => {
    const canary = "SYNTHETIC_PRIVATE_COURSE_PROGRESS_OWNER_STACK";
    const err = new Error(canary);
    err.stack = canary;
    m.list.mockRejectedValueOnce(err);
    const r = await request(app(), "A");
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({
      success: false, error: "Внутренняя ошибка сервера",
    });
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    const logged = m.logger.mock.calls.flat().map((arg: unknown) =>
      arg instanceof Error ? [arg.message, arg.stack].join(" ") : JSON.stringify(arg)
    ).join(" ");
    expect(logged).not.toContain(canary);
  });
  it("guest 401 never invokes owner course list", async () => {
    const r = await request(app(), "");
    expect(r.status).toBe(401);
    expect(m.list).not.toHaveBeenCalled();
  });
});
