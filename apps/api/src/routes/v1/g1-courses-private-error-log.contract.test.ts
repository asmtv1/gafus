/** AG1: mounted course read/reviews/personalization must not log a private Core error. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  list: vi.fn(), access: vi.fn(), accessById: vi.fn(),
  personal: vi.fn(), favorites: vi.fn(), toggle: vi.fn(),
  favoriteAdd: vi.fn(), favoriteRemove: vi.fn(), metadata: vi.fn(),
  reviews: vi.fn(), reviewCreate: vi.fn(), reviewUpdate: vi.fn(),
  reviewDelete: vi.fn(), rate: vi.fn(), log: vi.fn(),
}));

vi.mock("@gafus/core/services/course", () => ({
  getCoursesWithProgress: m.list,
  checkCourseAccess: m.access,
  checkCourseAccessById: m.accessById,
  saveCoursePersonalization: m.personal,
  getFavoritesCourses: m.favorites,
  toggleFavoriteCourse: m.toggle,
  addFavoriteCourse: m.favoriteAdd,
  removeFavoriteCourse: m.favoriteRemove,
  getCourseMetadata: m.metadata,
  getCourseReviews: m.reviews,
  createCourseReview: m.reviewCreate,
  updateCourseReview: m.reviewUpdate,
  deleteCourseReview: m.reviewDelete,
  rateCourse: m.rate,
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.log }),
}));

import { coursesRoutes } from "./courses";

const CANARY = "SYNTHETIC_PERSONALIZED_COURSE_REVIEW_PRIVATE_CANARY";
const BASE = "/api/v1/courses";
const actor = "synthetic-actor-A";
const personalized = {
  courseId: "course-A", userDisplayName: "Demo", userGender: "male",
  petName: "DemoDog", petGender: "female",
};
type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
function server() {
  const h = new Hono();
  h.use("/api/v1/courses/*", async (c, next) => {
    c.set("user", { id: actor, username: "test", role: "USER" });
    await next();
  });
  h.route(BASE, coursesRoutes);
  return h;
}
function request(method: HttpMethod, path: string, body?: unknown) {
  return server().request(path, {
    method,
    ...(body === undefined ? {} : {
      headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }),
  });
}
function assertSanitizedLogs() {
  expect(m.log).toHaveBeenCalledTimes(1);
  const flattened = m.log.mock.calls.flat().map(x => x instanceof Error
    ? [x.message, x.stack, String(x.cause)].join(" ")
    : JSON.stringify(x)).join(" ");
  expect(flattened).not.toContain(CANARY);
  expect(flattened).not.toContain("SYNTHETIC_ACTOR_PRIVATE_STACK");
}
beforeEach(() => vi.resetAllMocks());

describe("AG1 mounted course reviews/personalization private error logging (no Core DB)", () => {
  const tests: {
    label: string; mock: ReturnType<typeof vi.fn>;
    method: HttpMethod; path: string; body?: unknown;
  }[] = [
    { label: "list/progress GET", mock: m.list, method: "GET", path: BASE },
    { label: "access GET", mock: m.access, method: "GET", path: `${BASE}/access?courseType=general` },
    { label: "favorites GET", mock: m.favorites, method: "GET", path: `${BASE}/favorites` },
    { label: "favorites POST", mock: m.toggle, method: "POST", path: `${BASE}/favorites`, body: { courseId: "course-A" } },
    { label: "personalization POST", mock: m.personal, method: "POST", path: `${BASE}/personalization`, body: personalized },
    { label: "metadata GET", mock: m.metadata, method: "GET", path: `${BASE}/metadata?courseType=general` },
    { label: "reviews GET", mock: m.reviews, method: "GET", path: `${BASE}/reviews?courseType=general` },
    { label: "reviews POST", mock: m.reviewCreate, method: "POST", path: `${BASE}/reviews`, body: { courseType: "general", rating: 5, comment: "demo" } },
    { label: "rate POST by ID", mock: m.rate, method: "POST", path: `${BASE}/reviews`, body: { courseId: "course-A", rating: 5 } },
    { label: "reviews PATCH", mock: m.reviewUpdate, method: "PATCH", path: `${BASE}/reviews`, body: { reviewId: "rA", rating: 4 } },
    { label: "reviews DELETE", mock: m.reviewDelete, method: "DELETE", path: `${BASE}/reviews`, body: { reviewId: "rA" } },
  ];

  for (const testCase of tests) {
    it(`${testCase.label}: returns sanitized 500 and never logs raw Core error`, async () => {
      const error = new Error(CANARY);
      error.stack = `Error: ${CANARY}\nSYNTHETIC_ACTOR_PRIVATE_STACK`;
      testCase.mock.mockRejectedValueOnce(error);
      const result = await request(testCase.method, testCase.path, testCase.body);
      expect(result.status).toBe(500);
      expect(await result.json()).toEqual({ success: false, error: "Внутренняя ошибка сервера" });
      assertSanitizedLogs();
    });
  }

  it("GET course reviews returns original per-actor DTO unchanged", async () => {
    const original = { reviews: [{ id: "r1", username: "guest", rating: 5 }], totalCount: 1 };
    m.reviews.mockResolvedValueOnce(original);
    const response = await request("GET", `${BASE}/reviews?courseType=general`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: original });
    expect(m.reviews).toHaveBeenCalledExactlyOnceWith("general", actor);
    expect(m.log).not.toHaveBeenCalled();
  });

  it("unknown course reviews 404 preserves original response", async () => {
    m.reviews.mockResolvedValueOnce(null);
    const response = await request("GET", `${BASE}/reviews?courseType=unknown`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: "Курс не найден" });
    expect(m.log).not.toHaveBeenCalled();
  });

  it("POST personalization forwards complete validated payload with exact authenticated actor/course", async () => {
    const payload = {
      ...personalized,
      userDisplayName: "  Demo  ",
      petName: "  Puppy  ",
      petGender: null,
      petNameGen: "Щенка",
      petNameDat: null,
      petNameAcc: "Щенка",
      petNameIns: "Щенком",
      petNamePre: null,
      ignoredExtraProperty: "should be stripped by original Zod",
    };
    m.personal.mockResolvedValueOnce({ success: true });
    const response = await request("POST", `${BASE}/personalization`, payload);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(m.personal).toHaveBeenCalledExactlyOnceWith(actor, "course-A", {
      courseId: "course-A",
      userDisplayName: "Demo",
      userGender: "male",
      petName: "Puppy",
      petGender: null,
      petNameGen: "Щенка",
      petNameDat: null,
      petNameAcc: "Щенка",
      petNameIns: "Щенком",
      petNamePre: null,
    });
    expect(m.log).not.toHaveBeenCalled();
  });

  it("POST personalization preserves optional missing name forms and exact Core return 200", async () => {
    m.personal.mockResolvedValueOnce({ success: true });
    const response = await request("POST", `${BASE}/personalization`, personalized);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(m.personal).toHaveBeenCalledExactlyOnceWith(actor, "course-A", personalized);
    expect(m.log).not.toHaveBeenCalled();
  });

  it("POST personalization preserves existing 400 validation-error body from Core", async () => {
    m.personal.mockResolvedValueOnce({ success: false, error: "Не персонализированный курс" });
    const response = await request("POST", `${BASE}/personalization`, personalized);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Не персонализированный курс",
      code: "VALIDATION_ERROR",
    });
    expect(m.personal).toHaveBeenCalledExactlyOnceWith(actor, "course-A", personalized);
    expect(m.log).not.toHaveBeenCalled();
  });

  it("POST personalization rejects invalid empty required field before any Core port", async () => {
    const response = await request("POST", `${BASE}/personalization`, {
      ...personalized, petName: "   ",
    });
    expect(response.status).toBe(400);
    expect(m.personal).not.toHaveBeenCalled();
    expect(m.log).not.toHaveBeenCalled();
  });

  it("POST review explicit business 400 stays unchanged", async () => {
    m.reviewCreate.mockResolvedValueOnce({ success: false, error: "Недоступно" });
    const response = await request("POST", `${BASE}/reviews`, { courseType: "general", rating: 5 });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Недоступно" });
    expect(m.log).not.toHaveBeenCalled();
  });

  it("POST review prefers courseType over courseId and forwards the actor, rating, optional comment", async () => {
    m.reviewCreate.mockResolvedValueOnce({ success: true });
    const response = await request("POST", `${BASE}/reviews`, {
      courseType: "general", courseId: "ignored-course", rating: 4, comment: "hi",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(m.reviewCreate).toHaveBeenCalledExactlyOnceWith(actor, "general", 4, "hi");
    expect(m.rate).not.toHaveBeenCalled();
  });

  it("POST review rate-only keeps rating path and does not pass comment", async () => {
    m.rate.mockResolvedValueOnce({ success: true });
    const response = await request("POST", `${BASE}/reviews`, {
      courseId: "course-id", rating: 3, comment: "not-for-rate",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(m.rate).toHaveBeenCalledExactlyOnceWith(actor, "course-id", 3);
    expect(m.reviewCreate).not.toHaveBeenCalled();
  });

  it("POST review preserves omitted optional comment as undefined", async () => {
    m.reviewCreate.mockResolvedValueOnce({ success: true });
    const response = await request("POST", `${BASE}/reviews`, {
      courseType: "general", rating: 5,
    });
    expect(response.status).toBe(200);
    expect(m.reviewCreate).toHaveBeenCalledExactlyOnceWith(actor, "general", 5, undefined);
    expect(m.rate).not.toHaveBeenCalled();
  });

  it("POST review preserves original fallback 400 and Zod missing-target 400", async () => {
    m.reviewCreate.mockResolvedValueOnce({ success: false });
    const rejected = await request("POST", `${BASE}/reviews`, { courseType: "general", rating: 5 });
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toEqual({ success: false, error: "Не удалось создать отзыв" });
    const invalid = await request("POST", `${BASE}/reviews`, { rating: 5 });
    expect(invalid.status).toBe(400);
    expect(m.reviewCreate).toHaveBeenCalledOnce();
    expect(m.rate).not.toHaveBeenCalled();
  });

  it("PATCH review forwards exact actor/reviewId/rating and absent comment", async () => {
    m.reviewUpdate.mockResolvedValueOnce({ success: true });
    const response = await request("PATCH", `${BASE}/reviews`, { reviewId: "review-1", rating: 2 });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(m.reviewUpdate).toHaveBeenCalledExactlyOnceWith(actor, "review-1", 2, undefined);
    expect(m.reviewCreate).not.toHaveBeenCalled();
    expect(m.rate).not.toHaveBeenCalled();
    expect(m.reviewDelete).not.toHaveBeenCalled();
  });

  it("PATCH review preserves original failure 400 and provided comment", async () => {
    m.reviewUpdate.mockResolvedValueOnce({ success: false, error: "Только свой отзыв" });
    const response = await request("PATCH", `${BASE}/reviews`, {
      reviewId: "review-1", rating: 1, comment: "updated",
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ success: false, error: "Только свой отзыв" });
    expect(m.reviewUpdate).toHaveBeenCalledExactlyOnceWith(actor, "review-1", 1, "updated");
  });

  it("DELETE review forwards exact actor/reviewId without other commands", async () => {
    m.reviewDelete.mockResolvedValueOnce({ success: true });
    const response = await request("DELETE", `${BASE}/reviews`, { reviewId: "review-2" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(m.reviewDelete).toHaveBeenCalledExactlyOnceWith(actor, "review-2");
    expect(m.reviewCreate).not.toHaveBeenCalled();
    expect(m.rate).not.toHaveBeenCalled();
    expect(m.reviewUpdate).not.toHaveBeenCalled();
  });

  it("DELETE review preserves original failure 400 and Zod missing reviewId 400", async () => {
    m.reviewDelete.mockResolvedValueOnce({ success: false, error: "Нельзя удалить" });
    const denied = await request("DELETE", `${BASE}/reviews`, { reviewId: "review-2" });
    expect(denied.status).toBe(400);
    await expect(denied.json()).resolves.toEqual({ success: false, error: "Нельзя удалить" });
    const invalid = await request("DELETE", `${BASE}/reviews`, {});
    expect(invalid.status).toBe(400);
    expect(m.reviewDelete).toHaveBeenCalledExactlyOnceWith(actor, "review-2");
  });

  it("invalid review rating rejected before Core call", async () => {
    const response = await request("POST", `${BASE}/reviews`, { courseType: "general", rating: 9 });
    expect(response.status).toBe(400);
    expect(m.reviewCreate).not.toHaveBeenCalled();
    expect(m.log).not.toHaveBeenCalled();
  });
});
