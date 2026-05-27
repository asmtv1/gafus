import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    warn: vi.fn(),
  }),
}));

vi.mock("@gafus/error-handling", () => ({
  reportClientError: vi.fn(),
}));

vi.mock("@shared/server-actions", () => ({
  getFavoritesCoursesAction: vi.fn(),
}));

vi.mock("@shared/stores/offlineStore", () => ({
  useOfflineStore: {
    getState: () => ({
      addToSyncQueue: vi.fn(),
      isOnline: false,
    }),
  },
}));

import { useCourseStore } from "./courseStore";
import { useFavoritesStore } from "./favoritesStore";

const course = (id: string) => ({ id, name: id }) as never;

describe("web favorites store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCourseStore.setState({
      allCourses: {
        data: [course("course-1"), course("course-2")],
        timestamp: Date.now(),
        type: "all",
      },
      favoriteCourseIds: new Set(),
      favorites: null,
    });
    useFavoritesStore.setState({
      error: null,
      favoriteIds: new Set(),
      initialized: false,
      loading: false,
    });
  });

  it("adds local favorites and mirrors them into course store", () => {
    useFavoritesStore.getState().addFavoriteLocal("course-1");

    expect(useFavoritesStore.getState().isFavorite("course-1")).toBe(true);
    expect(useCourseStore.getState().isFavorite("course-1")).toBe(true);
    expect(useCourseStore.getState().favorites?.data).toEqual([
      expect.objectContaining({ id: "course-1" }),
    ]);
  });

  it("removes local favorites and mirrors removal into course store", () => {
    useFavoritesStore.getState().setFromServer(["course-1", "course-2"]);

    useFavoritesStore.getState().removeFavoriteLocal("course-1");

    expect(useFavoritesStore.getState().isFavorite("course-1")).toBe(false);
    expect(useCourseStore.getState().isFavorite("course-1")).toBe(false);
    expect(useCourseStore.getState().favorites?.data).toEqual([
      expect.objectContaining({ id: "course-2" }),
    ]);
  });

  it("marks server initialization and clears errors", () => {
    useFavoritesStore.setState({ error: "old" });

    useFavoritesStore.getState().setFromServer(["course-1"]);

    expect(useFavoritesStore.getState()).toMatchObject({
      error: null,
      initialized: true,
    });
    expect(useFavoritesStore.getState().isFavorite("course-1")).toBe(true);
  });
});
