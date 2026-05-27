import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    removeItem: vi.fn().mockResolvedValue(undefined),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

import { CACHE_DURATIONS } from "@/shared/config";

import { useCourseStore } from "./courseStore";

describe("mobile course store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T10:00:00.000Z"));
    useCourseStore.setState({
      cachedCourses: null,
      favorites: [],
    });
    useCourseStore.getState().clearFilters();
  });

  it("caches courses and reports expiration from timestamp", () => {
    const course = { id: "course-1", name: "Course" } as never;

    useCourseStore.getState().setCachedCourses([course]);

    expect(useCourseStore.getState().getCachedCourses()).toEqual({
      data: [course],
      isExpired: false,
    });

    vi.setSystemTime(new Date(Date.now() + CACHE_DURATIONS.MEDIUM + 1));

    expect(useCourseStore.getState().getCachedCourses()).toEqual({
      data: [course],
      isExpired: true,
    });
  });

  it("deduplicates favorites and removes them", () => {
    useCourseStore.getState().addToFavorites("course-1");
    useCourseStore.getState().addToFavorites("course-1");
    useCourseStore.getState().addToFavorites("course-2");

    expect(useCourseStore.getState().favorites).toEqual(["course-1", "course-2"]);
    expect(useCourseStore.getState().isFavorite("course-1")).toBe(true);

    useCourseStore.getState().removeFromFavorites("course-1");

    expect(useCourseStore.getState().favorites).toEqual(["course-2"]);
    expect(useCourseStore.getState().isFavorite("course-1")).toBe(false);
  });

  it("updates and clears filters", () => {
    useCourseStore.getState().setFilters({
      search: "аджилити",
      tab: "paid",
    });

    expect(useCourseStore.getState().getFilters()).toMatchObject({
      search: "аджилити",
      tab: "paid",
    });

    useCourseStore.getState().clearFilters();

    expect(useCourseStore.getState().getFilters()).toMatchObject({
      search: "",
      tab: "all",
    });
  });
});
