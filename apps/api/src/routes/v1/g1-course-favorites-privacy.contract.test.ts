/** AG1-COURSE-030: private favorite state must never be cached or shared. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  favorites: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  toggle: vi.fn(),
}));
vi.mock("@gafus/core/services/course", () => ({
  getFavoritesCourses: m.favorites,
  addFavoriteCourse: m.add,
  removeFavoriteCourse: m.remove,
  toggleFavoriteCourse: m.toggle,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));
import { coursesRoutes } from "./courses";

function app() {
  const server = new Hono();
  server.use("/api/v1/courses/*", async (c, next) => {
    c.set("user", {
      id: c.req.header("x-test-user") || "owner-A",
      username: "fixture",
      role: "USER",
    });
    await next();
  });
  server.route("/api/v1/courses", coursesRoutes);
  return server;
}

describe("AG1-COURSE-030 owner-scoped favorites transport privacy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.favorites.mockImplementation(async (uid: string) => ({
      favoriteIds: [`course-for-${uid}`],
      data: [{ id: `course-for-${uid}`, isFavorite: true, hasAccess: true }],
    }));
  });
  it("keeps independent user-A and user-B favorite GET payloads private and no-store", async () => {
    const server = app();
    for (const userId of ["owner-A", "owner-B"]) {
      const response = await server.request("/api/v1/courses/favorites", {
        headers: { "x-test-user": userId },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.json()).toEqual({
        success: true,
        data: { favoriteIds: [`course-for-${userId}`], data: [{
          id: `course-for-${userId}`, isFavorite: true, hasAccess: true,
        }] },
      });
    }
    expect(m.favorites.mock.calls.map(([userId]) => userId)).toEqual(["owner-A", "owner-B"]);
  });
  it("does not expose failure as public-cacheable response", async () => {
    m.favorites.mockRejectedValueOnce(new Error("private-query-error"));
    const response = await app().request("/api/v1/courses/favorites");
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: false, error: "Внутренняя ошибка сервера",
    });
  });
  it.each(["add", "remove"])("marks %s mutation response private and owner-scoped", async (action) => {
    const response = await app().request("/api/v1/courses/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "owner-B" },
      body: JSON.stringify({ courseId: "course-B", action }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      success: true, data: { isFavorite: action === "add" },
    });
    expect(action === "add" ? m.add : m.remove).toHaveBeenCalledWith("owner-B", "course-B");
  });
  it("does not mutate when favorites validation fails", async () => {
    const response = await app().request("/api/v1/courses/favorites", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: "", action: "add" }),
    });
    expect(response.status).toBe(400);
    expect(m.add).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.toggle).not.toHaveBeenCalled();
  });
});
