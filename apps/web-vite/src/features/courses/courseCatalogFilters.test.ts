import { describe, expect, it } from "vitest";
import {
  DEFAULT_COURSE_VIEW_FILTERS,
  filterProjectedCourses,
  type CourseViewFilters,
} from "./courseCatalogFilters";
import type { CourseListItem } from "./courseApi";
import { TrainingStatus } from "@gafus/types";
const course = (id: string, overrides: Partial<CourseListItem> = {}): CourseListItem => ({
  id,
  name: id,
  type: id,
  shortDesc: "Обучение собак",
  duration: "7 дней",
  isPaid: false,
  isPrivate: false,
  hasAccess: false,
  isFavorite: false,
  userStatus: TrainingStatus.NOT_STARTED,
  trainingLevel: "BEGINNER",
  ...overrides,
});
const rows = [
  course("free"),
  course("paid", { isPaid: true }),
  course("private", { isPrivate: true }),
  course("private_paid", { isPrivate: true, isPaid: true }),
];
const apply = (filters: Partial<CourseViewFilters>, authenticated = true) =>
  filterProjectedCourses(rows, { ...DEFAULT_COURSE_VIEW_FILTERS, ...filters }, authenticated).map(
    (item) => item.id,
  );
describe("local-only CourseCatalog legacy filter semantics", () => {
  it("C-LU01 free excludes both paid and private; private/paid may intersect", () => {
    expect(apply({ tab: "free" })).toEqual(["free"]);
    expect(apply({ tab: "paid" })).toEqual(["paid", "private_paid"]);
    expect(apply({ tab: "private" })).toEqual(["private", "private_paid"]);
  });
  it("C-LU02 known training level and progress cannot synthesize permission", () => {
    const progress = [
      course("complete", {
        trainingLevel: "ADVANCED",
        userStatus: TrainingStatus.COMPLETED,
        hasAccess: false,
      }),
    ];
    expect(
      filterProjectedCourses(
        progress,
        { ...DEFAULT_COURSE_VIEW_FILTERS, level: "ADVANCED", progress: TrainingStatus.COMPLETED },
        true,
      ),
    ).toEqual(progress);
    expect(
      filterProjectedCourses(progress, { ...DEFAULT_COURSE_VIEW_FILTERS, level: "BEGINNER" }, true),
    ).toEqual([]);
  });
  it("C-LU03 guest progress is not a private authorization filter", () => {
    expect(apply({ progress: TrainingStatus.COMPLETED }, false)).toEqual(rows.map((row) => row.id));
  });
  it("C-LU04 search is normalized on text actually present in public DTO", () => {
    const one = [course("one", { name: "Выдержка ЩЕНКА", shortDesc: "Стартуем с малого" })];
    expect(
      filterProjectedCourses(one, { ...DEFAULT_COURSE_VIEW_FILTERS, search: "  щенка " }, true),
    ).toEqual(one);
    expect(
      filterProjectedCourses(
        one,
        { ...DEFAULT_COURSE_VIEW_FILTERS, search: "Засекреченная запись" },
        true,
      ),
    ).toEqual([]);
  });
  it("C-LU05 name ordering keeps original GET order immutable", () => {
    const list = [course("c", { name: "Яблоко" }), course("a", { name: "Акация" })];
    const sorted = filterProjectedCourses(
      list,
      { ...DEFAULT_COURSE_VIEW_FILTERS, sort: "name" },
      true,
    );
    expect(sorted.map((row) => row.id)).toEqual(["a", "c"]);
    expect(list.map((row) => row.id)).toEqual(["c", "a"]);
  });
});
