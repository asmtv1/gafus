/**
 * Логика фильтрации и сортировки курсов (как в web).
 * Используется на экране «Курсы».
 */
import type { Course } from "@/shared/lib/api";

export type CourseTabType = "all" | "free" | "paid" | "private";
export type TrainingLevelType =
  | "ALL"
  | "BEGINNER"
  | "INTERMEDIATE"
  | "ADVANCED"
  | "EXPERT";
export type ProgressFilterType =
  | "ALL"
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "PAUSED";
export type RatingFilterType = "ALL" | "4+" | "3+" | "ANY";
export type SortingType = "newest" | "rating" | "name" | "progress";

export interface CourseFiltersState {
  tab: CourseTabType;
  level: TrainingLevelType;
  progress: ProgressFilterType;
  rating: RatingFilterType;
  search: string;
  sorting: SortingType;
}

export function filterCoursesByTab(
  courses: Course[],
  tab: CourseTabType,
): Course[] {
  switch (tab) {
    case "all":
      return courses;
    case "free":
      return courses.filter((c) => !c.isPrivate && !c.isPaid);
    case "paid":
      return courses.filter((c) => c.isPaid);
    case "private":
      return courses.filter((c) => c.isPrivate);
    default:
      return courses;
  }
}

export function filterCoursesByLevel(
  courses: Course[],
  level: TrainingLevelType,
): Course[] {
  if (level === "ALL") return courses;
  return courses.filter((c) => c.trainingLevel === level);
}

export function filterCoursesByProgress(
  courses: Course[],
  status: ProgressFilterType,
): Course[] {
  if (status === "ALL") return courses;
  return courses.filter((c) => c.userStatus === status);
}

export function filterCoursesByRating(
  courses: Course[],
  rating: RatingFilterType,
): Course[] {
  switch (rating) {
    case "4+":
      return courses.filter((c) => c.avgRating != null && c.avgRating >= 4);
    case "3+":
      return courses.filter((c) => c.avgRating != null && c.avgRating >= 3);
    case "ANY":
      return courses.filter((c) => c.avgRating != null);
    case "ALL":
    default:
      return courses;
  }
}

export function filterCoursesBySearch(
  courses: Course[],
  searchQuery: string,
): Course[] {
  if (!searchQuery.trim()) return courses;
  const query = searchQuery.toLowerCase().trim();
  return courses.filter(
    (c) =>
      (c.name ?? "").toLowerCase().includes(query) ||
      (c.description ?? "").toLowerCase().includes(query) ||
      (c.shortDesc ?? "").toLowerCase().includes(query) ||
      (c.authorUsername ?? "").toLowerCase().includes(query),
  );
}

export function sortCourses(
  courses: Course[],
  sorting: SortingType,
): Course[] {
  switch (sorting) {
    case "newest":
      return [...courses].sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime(),
      );
    case "rating":
      return [...courses].sort((a, b) => {
        const ra = a.avgRating ?? 0;
        const rb = b.avgRating ?? 0;
        return rb - ra;
      });
    case "name":
      return [...courses].sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", "ru"),
      );
    case "progress": {
      const order: Record<string, number> = {
        COMPLETED: 0,
        IN_PROGRESS: 1,
        PAUSED: 1,
        NOT_STARTED: 2,
      };
      return [...courses].sort(
        (a, b) => (order[a.userStatus] ?? 2) - (order[b.userStatus] ?? 2),
      );
    }
    default:
      return [...courses];
  }
}

export function filterAndSortCourses(
  courses: Course[],
  filters: CourseFiltersState,
): Course[] {
  let result = courses;
  result = filterCoursesByTab(result, filters.tab);
  result = filterCoursesByLevel(result, filters.level);
  result = filterCoursesByProgress(result, filters.progress);
  result = filterCoursesByRating(result, filters.rating);
  result = filterCoursesBySearch(result, filters.search);
  result = sortCourses(result, filters.sorting);
  return result;
}

export function getTabCounts(
  courses: Course[],
): Record<CourseTabType, number> {
  return {
    all: courses.length,
    free: courses.filter((c) => !c.isPrivate && !c.isPaid).length,
    paid: courses.filter((c) => c.isPaid).length,
    private: courses.filter((c) => c.isPrivate).length,
  };
}

export const DEFAULT_COURSE_FILTERS: CourseFiltersState = {
  tab: "all",
  level: "ALL",
  progress: "ALL",
  rating: "ALL",
  search: "",
  sorting: "newest",
};
