import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ wire: vi.fn() }));
vi.mock("./client", () => ({ apiClient: m.wire }));
import { coursesApi } from "./courses";
beforeEach(() => {
  m.wire.mockReset().mockResolvedValue({ success: true, data: { hasAccess: false } });
});
describe("private trainer course lookup only uses existing endpoint", () => {
  it("forwards verified owner/epoch requestGuard to before-fetch and refresh policy", async () => {
    const guard = () => true;
    await coursesApi.checkAccess("BASIC", guard);
    expect(m.wire).toHaveBeenCalledExactlyOnceWith("/api/v1/courses/access?courseType=BASIC", {
      requestGuard: guard,
    });
  });
  it("legacy calls remain valid without guard", async () => {
    await coursesApi.checkAccess("BASIC");
    expect(m.wire).toHaveBeenCalledExactlyOnceWith("/api/v1/courses/access?courseType=BASIC", {});
  });
  it("courseType is escaped in existing query to prevent query injection", async () => {
    await coursesApi.checkAccess("TYPE&hasAccess=true", () => false);
    expect(m.wire.mock.calls[0][0]).toBe(
      "/api/v1/courses/access?courseType=TYPE%26hasAccess%3Dtrue",
    );
  });
});

describe("course reviews existing GET request query boundary", () => {
  it("keeps normal course type and the same reviews endpoint", async () => {
    await coursesApi.getReviews("BASIC");
    expect(m.wire).toHaveBeenCalledExactlyOnceWith("/api/v1/courses/reviews?courseType=BASIC");
  });

  it("forwards existing optional READ requestGuard without changing URL or legacy call", async () => {
    let current = true;
    const guard = () => current;
    await coursesApi.getReviews("BASIC", guard);
    expect(m.wire).toHaveBeenCalledExactlyOnceWith("/api/v1/courses/reviews?courseType=BASIC", {
      requestGuard: guard,
    });
    expect(guard()).toBe(true);
    current = false;
    expect(guard()).toBe(false);
  });

  it("treats reserved symbols and Cyrillic as exactly one courseType value", async () => {
    const courseType = "Собака&next=forged#фрагмент+плюс%слеш/курс";
    await coursesApi.getReviews(courseType);
    expect(m.wire).toHaveBeenCalledTimes(1);

    const request = m.wire.mock.calls[0][0] as string;
    const uri = new URL(request, "https://example.invalid");
    expect(uri.pathname).toBe("/api/v1/courses/reviews");
    expect([...uri.searchParams.keys()]).toEqual(["courseType"]);
    expect(uri.searchParams.get("courseType")).toBe(courseType);
    expect(uri.hash).toBe("");
    expect(request).toBe(`/api/v1/courses/reviews?courseType=${encodeURIComponent(courseType)}`);
  });
});
