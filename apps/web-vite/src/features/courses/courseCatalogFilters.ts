import { createContext } from "react";
import type { CourseCatalogItem, CourseListItem } from "./courseApi";

export type CourseTab = "all" | "free" | "paid" | "private";
export type CourseLevel = CourseListItem["trainingLevel"] | "ALL";
export type CourseProgress = CourseListItem["userStatus"] | "ALL";
export type CourseSort = "server" | "name";
export type CourseViewFilters = {
  search: string;
  tab: CourseTab;
  level: CourseLevel;
  progress: CourseProgress;
  sort: CourseSort;
};
export const DEFAULT_COURSE_VIEW_FILTERS: CourseViewFilters = {
  search: "",
  tab: "all",
  level: "ALL",
  progress: "ALL",
  sort: "server",
};

/** Browser-only view of confirmed GET DTOs; does not grant any access. */
export function filterProjectedCourses(
  courses: readonly CourseCatalogItem[],
  filters: CourseViewFilters,
  authenticated: boolean,
): CourseCatalogItem[] {
  const needle = filters.search.trim().slice(0, 120).toLocaleLowerCase("ru");
  const visible = courses.filter((course) => {
    if (filters.tab === "free" && (course.isPaid || course.isPrivate)) return false;
    if (filters.tab === "paid" && !course.isPaid) return false;
    if (filters.tab === "private" && !course.isPrivate) return false;
    if (filters.level !== "ALL" && course.trainingLevel !== filters.level) return false;
    if (authenticated && filters.progress !== "ALL" && course.userStatus !== filters.progress) {
      return false;
    }
    return (
      !needle ||
      course.name.toLocaleLowerCase("ru").includes(needle) ||
      course.shortDesc.toLocaleLowerCase("ru").includes(needle)
    );
  });
  return filters.sort === "name"
    ? visible.sort((a, b) => a.name.localeCompare(b.name, "ru") || a.id.localeCompare(b.id))
    : visible;
}

/** App-lifetime view-only marker; never an authorization credential. */
export const CourseViewSessionContext = createContext<string | null>(null);
export const COURSE_HISTORY_STATE_KEY = "__gafusCourseViewV1";

type HistoryScope = { principal: string; generation: string | null; favoritesOnly: boolean };
const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
function validFilters(value: unknown): value is CourseViewFilters {
  if (!isRecord(value)) return false;
  return typeof value.search === "string" && value.search.length <= 120 &&
    ["all", "free", "paid", "private"].includes(String(value.tab)) &&
    ["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]
      .includes(String(value.level)) &&
    ["ALL", "NOT_STARTED", "IN_PROGRESS", "COMPLETED", "PAUSED", "RESET"]
      .includes(String(value.progress)) &&
    ["server", "name"].includes(String(value.sort));
}
function catalogHistoryPath(favoritesOnly: boolean): string | null {
  const path = window.location.pathname;
  return favoritesOnly ? path === "/favorites" ? path : null :
    path === "/" || path === "/courses" ? path : null;
}

/** Read only the currently restored browser HISTORY ENTRY, never a URL query. */
export function readCourseHistoryFilters(scope: HistoryScope): CourseViewFilters | null {
  const path = catalogHistoryPath(scope.favoritesOnly);
  if (!path || scope.generation === null || !isRecord(window.history.state)) return null;
  const saved = window.history.state[COURSE_HISTORY_STATE_KEY];
  if (!isRecord(saved) || saved.version !== 1 || saved.path !== path ||
    saved.principal !== scope.principal || saved.generation !== scope.generation ||
    saved.favoritesOnly !== scope.favoritesOnly || !validFilters(saved.filters)) return null;
  return { ...saved.filters };
}

/** Keep all foreign object fields untouched; never clobber non-object state. */
export function saveCourseHistoryFilters(scope: HistoryScope, filters: CourseViewFilters): void {
  const path = catalogHistoryPath(scope.favoritesOnly);
  const previous: unknown = window.history.state;
  if (!path || scope.generation === null ||
    (previous !== null && !isRecord(previous))) return;
  window.history.replaceState({
    ...(previous ?? {}),
    [COURSE_HISTORY_STATE_KEY]: {
      version: 1, path, principal: scope.principal,
      generation: scope.generation, favoritesOnly: scope.favoritesOnly,
      filters: { ...filters },
    },
  }, "", window.location.href);
}
