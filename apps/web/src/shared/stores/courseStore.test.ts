import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("@gafus/error-handling", () => ({
  reportClientError: vi.fn(),
}));

vi.mock("@shared/server-actions", () => ({
  getAuthoredCoursesAction: vi.fn(),
  getCoursesWithProgressAction: vi.fn(),
  getFavoritesCoursesAction: vi.fn(),
}));

import { useCourseStore } from "./courseStore";

const course = (id: string, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    isFavorite: false,
    name: id,
    ...overrides,
  }) as never;

describe("web course store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));
    useCourseStore.setState({
      allCourses: null,
      authored: null,
      courseStats: {},
      errors: { all: null, authored: null, favorites: null },
      favoriteCourseIds: new Set(),
      favorites: null,
      imageCache: {},
      loading: { all: false, authored: false, favorites: false },
      prefetchedCourses: new Set(),
    });
  });

  it("sets all courses and derives favorite ids from course data", () => {
    useCourseStore
      .getState()
      .setAllCourses([course("course-1", { isFavorite: true }), course("course-2")], "all");

    expect(useCourseStore.getState().allCourses).toMatchObject({
      data: [
        expect.objectContaining({ id: "course-1" }),
        expect.objectContaining({ id: "course-2" }),
      ],
      timestamp: Date.now(),
      type: "all",
    });
    expect(useCourseStore.getState().isFavorite("course-1")).toBe(true);
    expect(useCourseStore.getState().isFavorite("course-2")).toBe(false);
  });

  it("adds and removes favorites and dispatches browser events", () => {
    const dispatchEvent = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { dispatchEvent },
    });

    useCourseStore.getState().addToFavorites("course-1");
    expect(useCourseStore.getState().isFavorite("course-1")).toBe(true);

    useCourseStore.getState().removeFromFavorites("course-1");
    expect(useCourseStore.getState().isFavorite("course-1")).toBe(false);
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
  });

  it("returns popular courses by views multiplied by rating", () => {
    useCourseStore.getState().setAllCourses([course("low"), course("high")], "all");
    useCourseStore.getState().setCourseStats({
      high: { rating: 5, views: 20 },
      low: { rating: 2, views: 10 },
    } as never);

    expect(useCourseStore.getState().getPopularCourses(1)).toEqual([
      expect.objectContaining({ id: "high" }),
    ]);
  });

  it("tracks image cache and prefetch state", () => {
    useCourseStore.getState().markImageLoaded("https://cdn.test/image.jpg");
    useCourseStore.getState().markPrefetched("course-1");

    expect(useCourseStore.getState().isImageCached("https://cdn.test/image.jpg")).toBe(true);
    expect(useCourseStore.getState().isPrefetched("course-1")).toBe(true);

    useCourseStore.getState().clearCache();

    expect(useCourseStore.getState().isImageCached("https://cdn.test/image.jpg")).toBeFalsy();
    expect(useCourseStore.getState().isPrefetched("course-1")).toBe(false);
  });
});
