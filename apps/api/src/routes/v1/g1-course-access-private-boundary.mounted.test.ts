/** AG1-COURSE030 next actual actor-specific GET /courses/access cache policy. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  token: vi.fn(), byType: vi.fn(), byId: vi.fn(), log: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.token }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
vi.mock("@gafus/core/services/course", () => ({
  getCoursesWithProgress: vi.fn(),
  checkCourseAccess: m.byType,
  checkCourseAccessById: m.byId,
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
  createWebLogger: () => ({ error: m.log }),
}));
import { authMiddleware } from "../../middleware/auth";
import { coursesRoutes } from "./courses";
const PATH = "/api/v1/courses/access";
function createApp() {
  const app = new Hono();
  app.use("/api/v1/courses/*", authMiddleware);
  app.route("/api/v1/courses", coursesRoutes);
  return app;
}
function read(app: Hono, query: string, token = "A") {
  return app.request(PATH + query, {
    headers: token ? { Authorization: "Bearer token-" + token } : {},
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  m.token.mockImplementation(async (jwt: string) =>
    jwt === "token-A" ? { id: "USER_A", username: "A", role: "USER" } :
      jwt === "token-B" ? { id: "USER_B", username: "B", role: "USER" } : null
  );
  m.byType.mockImplementation(async (_type: string, userId: string) => ({
    hasAccess: userId === "USER_A",
  }));
  m.byId.mockImplementation(async (_id: string, userId: string) => ({
    hasAccess: userId === "USER_A",
  }));
});
describe("AG1 private course-access entitlement read boundary (mounted Hono)", () => {
  it("A→B→A same Hono returns user-scoped entitlement, no-store", async () => {
    const app = createApp();
    for (const [actor, expected] of [
      ["A", true], ["B", false], ["A", true],
    ] as const) {
      const r = await read(app, "?courseType=general", actor);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ success: true, data: { hasAccess: expected } });
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    }
    expect(m.byType.mock.calls).toEqual([
      ["general", "USER_A"], ["general", "USER_B"], ["general", "USER_A"],
    ]);
  });
  it("byId is preferred when both courseType and courseId supplied", async () => {
    const r = await read(createApp(), "?courseType=general&courseId=course-1", "B");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, data: { hasAccess: false } });
    expect(m.byId).toHaveBeenCalledExactlyOnceWith("course-1", "USER_B");
    expect(m.byType).not.toHaveBeenCalled();
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each(["", "?courseType=", "?courseId="])(
    "missing or empty query %s preserves business 400 before Core", async query => {
      const r = await read(createApp(), query);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({
        success: false, error: "Требуется courseType или courseId",
      });
      expect(m.byId).not.toHaveBeenCalled();
      expect(m.byType).not.toHaveBeenCalled();
      expect(r.headers.get("cache-control")).toBe("private, no-store");
    },
  );
  it("Core failure 500 is not cached and never leaks raw provider entitlement", async () => {
    const canary = "PRIVATE_ENTITLEMENT_PROVIDER_ERROR_STACK";
    const error = new Error(canary);
    error.stack = canary;
    m.byType.mockRejectedValueOnce(error);
    const r = await read(createApp(), "?courseType=general");
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({
      success: false, error: "Внутренняя ошибка сервера",
    });
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    const serialized = m.log.mock.calls.flat().map((arg: unknown) =>
      arg instanceof Error ? [arg.message, arg.stack].join(" ") : JSON.stringify(arg)
    ).join(" ");
    expect(serialized).not.toContain(canary);
  });
  it("no authentication stays 401 without entitlement call", async () => {
    const r = await read(createApp(), "?courseType=general", "");
    expect(r.status).toBe(401);
    expect(m.byType).not.toHaveBeenCalled();
    expect(m.byId).not.toHaveBeenCalled();
  });
});
