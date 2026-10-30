import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCourseReviews, projectCourseReviews } from "./courseReviewsApi";

const review = (n: number, user = "A") => ({
  id: `review_${n}`,
  rating: (n % 5) + 1,
  comment: `Комментарий ${n}`,
  createdAt: "2026-10-20T12:00:00.000Z",
  user: {
    id: user,
    username: user === "A" ? "admin" : "reviewer",
    profile: { avatarUrl: "PRIVATE_EXTERNAL_AVATAR" },
  },
});
const wire = (count = 2) => ({
  courseName: "Самоконтроль",
  reviews: Array.from({ length: count }, (_, i) => review(i, i === 0 ? "A" : "B")),
  userStatus: { hasCompleted: true, userReview: count ? review(0) : null },
});

afterEach(() => vi.unstubAllGlobals());
describe("WEB-URL-050 actual Core/Hono review GET contract", () => {
  it("whitelists only safe reviewer, rating, time, comment and own marker", () => {
    const result = projectCourseReviews({ ...wire(), PRIVATE_SERVER_METADATA: "TOKEN" }, "A");
    expect(result).toEqual({
      courseName: "Самоконтроль",
      hasCompleted: true,
      ownReviewId: "review_0",
      reviews: [
        {
          id: "review_0",
          rating: 1,
          comment: "Комментарий 0",
          createdAt: "2026-10-20T12:00:00.000Z",
          user: { id: "A", username: "admin" },
        },
        {
          id: "review_1",
          rating: 2,
          comment: "Комментарий 1",
          createdAt: "2026-10-20T12:00:00.000Z",
          user: { id: "B", username: "reviewer" },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_EXTERNAL_AVATAR");
    expect(JSON.stringify(result)).not.toContain("TOKEN");
  });
  it("accepts empty reviews, null rating/comment and absent own review", () => {
    expect(projectCourseReviews(wire(0), "A").reviews).toEqual([]);
    const payload = wire();
    payload.reviews[0].rating = null as never;
    payload.reviews[0].comment = null as never;
    expect(projectCourseReviews(payload, "A").reviews[0].rating).toBeNull();
  });
  it.each([
    ["duplicate review", () => ({ ...wire(), reviews: [review(0), review(0)] })],
    ["invalid rating", () => ({ ...wire(), reviews: [{ ...review(0), rating: 9 }] })],
    ["invalid date", () => ({ ...wire(), reviews: [{ ...review(0), createdAt: "NaN" }] })],
    [
      "invalid username",
      () => ({ ...wire(), reviews: [{ ...review(0), user: { id: "A", username: " " } }] }),
    ],
    [
      "wrong owner",
      () => ({ ...wire(), userStatus: { hasCompleted: true, userReview: review(0, "B") } }),
    ],
    [
      "non-present own review",
      () => ({ ...wire(), userStatus: { hasCompleted: true, userReview: review(99) } }),
    ],
    ["wrong review type", () => ({ ...wire(), reviews: { first: review(0) } })],
    [
      "unverified access marker",
      () => ({ ...wire(), userStatus: { hasCompleted: "yes", userReview: null } }),
    ],
  ])("rejects malformed data: %s", (_name, make) => {
    expect(() => projectCourseReviews(make(), "A")).toThrow();
  });
  it("never requests real transport for an invalid type or actor", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchCourseReviews("../external", "A")).rejects.toThrow();
    await expect(fetchCourseReviews("B", "../external")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("confirmed GET path only, same-origin cookies, no-store, no mutations", async () => {
    const fetcher = vi.fn(
      async (_url: string, _opt: RequestInit) =>
        new Response(
          JSON.stringify({
            success: true,
            data: wire(),
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchCourseReviews("IMPULSE_CONTROL", "A");
    expect(result.reviews).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/courses/reviews?courseType=IMPULSE_CONTROL");
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { "X-Gafus-Auth-Transport": "cookie" },
    });
  });
});
