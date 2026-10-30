/** G1 characterization only: isolated Hono + mocked Core, no real PostgreSQL/Redis. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  isRegistrationCompleted: vi.fn(),
  getCoursesWithProgress: vi.fn(),
  addFavoriteCourse: vi.fn(),
  removeFavoriteCourse: vi.fn(),
  toggleFavoriteCourse: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: mocks.verifyAccessToken }));
vi.mock("@gafus/core/services/auth", () => ({
  isRegistrationCompleted: mocks.isRegistrationCompleted,
}));
vi.mock("@gafus/core/services/course", () => ({
  getCoursesWithProgress: mocks.getCoursesWithProgress,
  addFavoriteCourse: mocks.addFavoriteCourse,
  removeFavoriteCourse: mocks.removeFavoriteCourse,
  toggleFavoriteCourse: mocks.toggleFavoriteCourse,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { authMiddleware } from "../../middleware/auth";
import { coursesRoutes } from "./courses";

const userA = { id: "g1-user-A", username: "alpha", role: "USER" } as const;
const userB = { id: "g1-user-B", username: "beta", role: "USER" } as const;
function app() {
  const api = new Hono();
  api.use("/api/v1/courses/*", authMiddleware);
  api.route("/api/v1/courses", coursesRoutes);
  return api;
}
function mutate(headers: Record<string, string>, value: unknown) {
  return app().request("http://local.test/api/v1/courses/favorites", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyAccessToken.mockResolvedValue(userA);
  mocks.isRegistrationCompleted.mockResolvedValue(true);
  mocks.getCoursesWithProgress.mockResolvedValue([]);
  mocks.addFavoriteCourse.mockResolvedValue(undefined);
  mocks.removeFavoriteCourse.mockResolvedValue(undefined);
});

describe("G1 /api/v1/courses — Bearer/cookie and favorite contract (mock Core)", () => {
  it("rejects unauthenticated and malformed bearer before Core", async () => {
    expect((await mutate({}, { courseId: "course-1", action: "add" })).status).toBe(401);
    expect(
      (await mutate({ authorization: "Basic invalid" }, { courseId: "course-1" })).status,
    ).toBe(401);
    expect(mocks.addFavoriteCourse).not.toHaveBeenCalled();
  });

  it("rejects expired/invalid bearer without writing", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(null);
    const result = await mutate(
      { authorization: "Bearer expired" },
      { courseId: "course-1", action: "add" },
    );
    expect(result.status).toBe(401);
    expect(mocks.addFavoriteCourse).not.toHaveBeenCalled();
  });

  it("rejects untrusted cookie mutation, preserving browser CSRF boundary", async () => {
    const r = await mutate(
      { cookie: "gafus_access=fake-jwt", origin: "https://untrusted.invalid" },
      { courseId: "course-1", action: "add" },
    );
    expect(r.status).toBe(403);
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
    expect(mocks.addFavoriteCourse).not.toHaveBeenCalled();
  });

  it("accepts trusted browser cookie and assigns mutation to authenticated actor", async () => {
    const r = await mutate(
      { cookie: "gafus_access=fake-jwt", origin: "https://gafus.ru" },
      { courseId: "course-1", action: "add" },
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, data: { isFavorite: true } });
    expect(mocks.addFavoriteCourse).toHaveBeenCalledWith(userA.id, "course-1");
  });

  it("native Bearer add/add and remove/remove return the same stable JSON", async () => {
    const hdr = { authorization: "Bearer native-test-jwt" };
    for (let i = 0; i < 2; i++) {
      const add = await mutate(hdr, { courseId: "course-1", action: "add" });
      expect(add.status).toBe(200);
      expect(await add.json()).toEqual({ success: true, data: { isFavorite: true } });
      const remove = await mutate(hdr, { courseId: "course-1", action: "remove" });
      expect(remove.status).toBe(200);
      expect(await remove.json()).toEqual({ success: true, data: { isFavorite: false } });
    }
    expect(mocks.addFavoriteCourse).toHaveBeenCalledTimes(2);
    expect(mocks.removeFavoriteCourse).toHaveBeenCalledTimes(2);
  });

  it("distinguishes principals and never trusts a supplied userId", async () => {
    mocks.verifyAccessToken.mockResolvedValueOnce(userB);
    const r = await mutate(
      { authorization: "Bearer native-B" },
      {
        courseId: "course-1",
        action: "add",
        userId: userA.id,
      },
    );
    expect(r.status).toBe(200); // Zod currently strips unknown keys.
    expect(mocks.addFavoriteCourse).toHaveBeenCalledWith(userB.id, "course-1");
  });

  it("rejects invalid favorite inputs without invoking Core", async () => {
    const r = await mutate(
      { authorization: "Bearer native-test" },
      { courseId: "", action: "invalid" },
    );
    expect(r.status).toBe(400);
    expect(mocks.addFavoriteCourse).not.toHaveBeenCalled();
  });

  it("responds 500 without serializing a Core failure", async () => {
    mocks.addFavoriteCourse.mockRejectedValueOnce(new Error("INTERNAL_TEST_SECRET"));
    const r = await mutate(
      { authorization: "Bearer native-test" },
      { courseId: "course-1", action: "add" },
    );
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("INTERNAL_TEST_SECRET");
  });

  it.each([
    ["add", true, "addFavoriteCourse"],
    ["remove", false, "removeFavoriteCourse"],
    ["toggle", true, "toggleFavoriteCourse"],
  ] as const)(
    "forwards %s only to its Core port with exact authenticated actor/course",
    async (action, expected, port) => {
      if (action === "toggle") mocks.toggleFavoriteCourse.mockResolvedValueOnce(true);
      const response = await mutate(
        { authorization: "Bearer native-test" },
        {
          courseId: "target-course-A",
          action,
          userId: "untrusted-body-actor",
        },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({
        success: true,
        data: { isFavorite: expected },
      });
      expect(mocks[port]).toHaveBeenCalledExactlyOnceWith(userA.id, "target-course-A");
      for (const other of [
        "addFavoriteCourse",
        "removeFavoriteCourse",
        "toggleFavoriteCourse",
      ] as const) {
        if (other !== port) expect(mocks[other]).not.toHaveBeenCalled();
      }
    },
  );

  it("preserves toggle false result without add/remove or re-toggle", async () => {
    mocks.toggleFavoriteCourse.mockResolvedValueOnce(false);
    const response = await mutate(
      { authorization: "Bearer native-test" },
      {
        courseId: "target-course-A",
        action: "toggle",
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: { isFavorite: false } });
    expect(mocks.toggleFavoriteCourse).toHaveBeenCalledExactlyOnceWith(userA.id, "target-course-A");
    expect(mocks.addFavoriteCourse).not.toHaveBeenCalled();
    expect(mocks.removeFavoriteCourse).not.toHaveBeenCalled();
  });

  it.each([
    ["add", "addFavoriteCourse"],
    ["remove", "removeFavoriteCourse"],
    ["toggle", "toggleFavoriteCourse"],
  ] as const)(
    "masks %s Core failure as the original private 500 without retry",
    async (action, port) => {
      mocks[port].mockRejectedValueOnce(new Error("PRIVATE_PORT_FAILURE_DO_NOT_EXPOSE"));
      const response = await mutate(
        { authorization: "Bearer native-test" },
        {
          courseId: "target-course-A",
          action,
        },
      );
      expect(response.status).toBe(500);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: "Внутренняя ошибка сервера",
      });
      expect(mocks[port]).toHaveBeenCalledExactlyOnceWith(userA.id, "target-course-A");
      for (const other of [
        "addFavoriteCourse",
        "removeFavoriteCourse",
        "toggleFavoriteCourse",
      ] as const) {
        if (other !== port) expect(mocks[other]).not.toHaveBeenCalled();
      }
    },
  );

  it("GET catalog remains private and isolated by Bearer user", async () => {
    mocks.getCoursesWithProgress.mockResolvedValueOnce([{ id: "course-1", hasAccess: true }]);
    const r = await app().request("http://local.test/api/v1/courses", {
      headers: { authorization: "Bearer native-test" },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getCoursesWithProgress).toHaveBeenCalledWith(userA.id);
  });
});
