import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCoursesMock, addFavoriteMock, removeFavoriteMock } = vi.hoisted(() => ({
  getCoursesMock: vi.fn(),
  addFavoriteMock: vi.fn(),
  removeFavoriteMock: vi.fn(),
}));

vi.mock("@gafus/core/services/course", () => ({
  getCoursesWithProgress: getCoursesMock,
  addFavoriteCourse: addFavoriteMock,
  removeFavoriteCourse: removeFavoriteMock,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));

import { coursesRoutes } from "./courses";
import { listCourses, setCourseFavorite } from
  "../../../../../apps/web-vite/src/features/courses/courseApi";

const user = { id: "isolated-user", username: "isolated", role: "USER" } as const;
function app() {
  const hono = new Hono();
  hono.use("/api/v1/courses/*", async (c, next) => {
    // Simulate authenticated Hono middleware in an isolated test.
    c.set("user", user);
    await next();
  });
  hono.route("/api/v1/courses", coursesRoutes);
  return hono;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Hono /courses and Vite catalog share one server-owned contract", () => {
  it("serializes private progress only for the authenticated user, never public-cache", async () => {
    const catalog = [{
      id: "course-A",
      name: "Обучение",
      type: "training",
      shortDesc: "Короткое описание",
      duration: "10 дней",
      isPaid: true,
      isPrivate: true,
      hasAccess: true,
      isFavorite: false,
      trainingLevel: "BEGINNER",
      userStatus: "IN_PROGRESS",
      createdAt: new Date("2026-10-15T00:00:00.000Z"),
      startedAt: new Date("2026-10-15T00:00:00.000Z"),
    }];
    getCoursesMock.mockResolvedValue(catalog);
    const response = await app().request("https://local.test/api/v1/courses", {
      headers: { Cookie: "gafus_access=local-test-cookie" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getCoursesMock).toHaveBeenCalledWith(user.id);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [{ id: "course-A", hasAccess: true, userStatus: "IN_PROGRESS" }],
    });

    vi.stubGlobal("fetch", vi.fn(async (url: string, opts: RequestInit) => {
      expect(url).toBe("/api/v1/courses");
      expect(opts.credentials).toBe("include");
      return app().request("https://local.test" + url, { headers: opts.headers });
    }));
    expect(await listCourses()).toMatchObject([
      { id: "course-A", hasAccess: true, userStatus: "IN_PROGRESS" },
    ]);
  });

  it("uses authenticated Hono add/remove actions without toggling on retries", async () => {
    const request = app();
    const added = await request.request("/api/v1/courses/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: "course-A", action: "add" }),
    });
    expect(added.status).toBe(200);
    await expect(added.json()).resolves.toEqual({
      success: true, data: { isFavorite: true },
    });
    expect(addFavoriteMock).toHaveBeenCalledWith(user.id, "course-A");
    const removed = await request.request("/api/v1/courses/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: "course-A", action: "remove" }),
    });
    expect(removed.status).toBe(200);
    await expect(removed.json()).resolves.toEqual({
      success: true, data: { isFavorite: false },
    });
    expect(removeFavoriteMock).toHaveBeenCalledWith(user.id, "course-A");
    expect(addFavoriteMock).toHaveBeenCalledTimes(1);
    expect(removeFavoriteMock).toHaveBeenCalledTimes(1);
  });

  it("Web favorite client reaches Hono with the same JSON envelope as Mobile", async () => {
    vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit) =>
      app().request(path, {
        method: options.method,
        headers: options.headers,
        body: options.body,
      }),
    ));
    expect(await setCourseFavorite("course-A", true)).toBe(true);
    expect(await setCourseFavorite("course-A", false)).toBe(false);
    expect(addFavoriteMock).toHaveBeenCalledWith(user.id, "course-A");
    expect(removeFavoriteMock).toHaveBeenCalledWith(user.id, "course-A");
  });

  it("Hono rejects invalid favorite payload without writing", async () => {
    const response = await app().request("/api/v1/courses/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: "", action: "toggle" }),
    });
    expect(response.status).toBe(400);
    expect(addFavoriteMock).not.toHaveBeenCalled();
    expect(removeFavoriteMock).not.toHaveBeenCalled();
  });

  it("never replaces service failure with a catalog that implies access", async () => {
    getCoursesMock.mockRejectedValue(new Error("isolated-failure"));
    const response = await app().request("https://local.test/api/v1/courses");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ success: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(listCourses()).rejects.toMatchObject({ status: 500 });
  });
});
