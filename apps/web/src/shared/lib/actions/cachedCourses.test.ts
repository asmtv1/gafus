import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUserId: vi.fn(), courses: vi.fn(), favorites: vi.fn(),
}));
vi.mock("@shared/utils/getCurrentUserId", () => ({
  getCurrentUserId: mocks.currentUserId,
}));
vi.mock("@gafus/core/services/course", () => ({
  getCoursesWithProgress: mocks.courses,
  getFavoritesCourses: mocks.favorites,
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));

import { getCoursesWithProgressCached, getFavoritesCoursesCached } from "./cachedCourses";

describe("Web catalog and favorites server actions use only the session user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserId.mockResolvedValue("viewer");
    mocks.courses.mockResolvedValue([]);
    mocks.favorites.mockResolvedValue({ data: [] });
  });

  it("does not reveal private courses by providing another subscriber ID", async () => {
    expect((await getCoursesWithProgressCached("other-subscriber")).success).toBe(false);
    expect(mocks.courses).not.toHaveBeenCalled();
    expect((await getCoursesWithProgressCached("viewer")).success).toBe(true);
    expect(mocks.courses).toHaveBeenCalledWith("viewer");
  });

  it("does not reveal another user's favorites", async () => {
    expect((await getFavoritesCoursesCached("other-subscriber")).success).toBe(false);
    expect(mocks.favorites).not.toHaveBeenCalled();
    expect((await getFavoritesCoursesCached("viewer")).success).toBe(true);
    expect(mocks.favorites).toHaveBeenCalledWith("viewer");
  });

  it("preserves the anonymous public course catalog without user-specific rights", async () => {
    mocks.currentUserId.mockRejectedValue(new Error("no session"));
    expect((await getCoursesWithProgressCached()).success).toBe(true);
    expect(mocks.courses).toHaveBeenCalledWith(undefined);
    expect((await getFavoritesCoursesCached()).success).toBe(false);
    expect(mocks.favorites).not.toHaveBeenCalled();
  });
});
