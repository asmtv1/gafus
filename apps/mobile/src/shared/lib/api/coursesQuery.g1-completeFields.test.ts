import { describe, expect, it, vi } from "vitest";

vi.mock("./courses", () => ({ coursesApi: { getAll: vi.fn() } }));

import type { Course } from "./courses";
import { coursesCatalogQueryOptions } from "./coursesQuery";

function course(id = "course-a"): Course {
  return {
    id,
    name: "Курс дрессировки",
    type: "BASIC",
    shortDesc: "Базовые навыки",
    description: "Версия описания 1",
    equipment: "Поводок",
    hasAccess: true,
    logoImg: "https://fixture.invalid/course.png",
    duration: "30 дней",
    trainingLevel: "BEGINNER",
    isPrivate: false,
    isPaid: false,
    avgRating: 4.7,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    authorUsername: "trainer",
    authorAvatarUrl: null,
    userStatus: "IN_PROGRESS",
    startedAt: "2026-01-03T00:00:00.000Z",
    completedAt: null,
    startedUsersCount: 42,
    userCourses: [{ status: "IN_PROGRESS" }],
    isFavorite: false,
    reviews: [
      {
        rating: 5,
        comment: "Первый отзыв",
        createdAt: "2026-01-04T00:00:00.000Z",
        user: { username: "user-a", profile: null },
      },
    ],
    dayLinks: [{ id: "link-a", order: 1, day: { id: "day-a", title: "Первый день" } }],
  };
}

function share(previous: Course[], current: Course[]): Course[] {
  const result = coursesCatalogQueryOptions.structuralSharing(
    { success: true, data: previous },
    { success: true, data: current },
  ) as { success: boolean; data: Course[] };
  expect(result.success).toBe(true);
  return result.data;
}

describe("AG3-LEARN-030 complete Mobile course cache refresh", () => {
  it.each([
    [
      "favorite state",
      (entry: Course) => {
        entry.isFavorite = true;
      },
    ],
    [
      "course description",
      (entry: Course) => {
        entry.description = "Версия описания 2";
      },
    ],
    [
      "equipment requirement",
      (entry: Course) => {
        entry.equipment = "Шлейка";
      },
    ],
    [
      "same-length review edit",
      (entry: Course) => {
        entry.reviews![0].comment = "Исправленный отзыв";
      },
    ],
    [
      "linked training day title",
      (entry: Course) => {
        entry.dayLinks![0].day.title = "Обновлённый день";
      },
    ],
    [
      "user course status without changing startedUsersCount",
      (entry: Course) => {
        entry.userCourses![0].status = "COMPLETED";
      },
    ],
    [
      "creation timestamp",
      (entry: Course) => {
        entry.createdAt = "2026-02-01T00:00:00.000Z";
      },
    ],
  ])("does not resurrect stale %s when API refetch succeeds", (_name, update) => {
    const oldCourse = course();
    const nextCourse = structuredClone(oldCourse);
    update(nextCourse);

    const merged = share([oldCourse], [nextCourse]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).not.toBe(oldCourse);
    expect(merged[0]).toEqual(nextCourse);
    expect(oldCourse).not.toEqual(nextCourse);
  });

  it("reuses the unchanged course and catalog references for identical API data", () => {
    const oldCourse = course();
    const oldCourses = [oldCourse];
    const merged = share(oldCourses, [structuredClone(oldCourse)]);

    expect(merged).toBe(oldCourses);
    expect(merged[0]).toBe(oldCourse);
  });

  it("updates one course without recreating a separate unchanged course", () => {
    const first = course("course-a");
    const second = course("course-b");
    const changed = structuredClone(first);
    changed.isFavorite = true;

    const result = share([first, second], [changed, structuredClone(second)]);

    expect(result[0]).not.toBe(first);
    expect(result[0].isFavorite).toBe(true);
    expect(result[1]).toBe(second);
  });

  it("preserves entitlement changes after API refetch", () => {
    const oldCourse = course();
    const changed = structuredClone(oldCourse);
    changed.hasAccess = false;
    changed.isPaid = true;

    const result = share([oldCourse], [changed]);

    expect(result[0].hasAccess).toBe(false);
    expect(result[0].isPaid).toBe(true);
    expect(result[0]).not.toBe(oldCourse);
  });
});
