import { replaceEqualDeep } from "@tanstack/react-query";

import { type CourseListItem, coursesApi } from "./courses";
import { getCourseStartedUsersCount } from "./courseParticipation";

type CoursesCatalogResponse = Awaited<ReturnType<typeof coursesApi.getAll>>;

function isCoursesCatalogResponse(value: unknown): value is CoursesCatalogResponse {
  if (!value || typeof value !== "object") return false;
  const maybeResponse = value as { success?: unknown };
  return typeof maybeResponse.success === "boolean";
}

function toTimestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function areCourseCardFieldsEqual(prev: CourseListItem, next: CourseListItem): boolean {
  return (
    prev.id === next.id &&
    prev.name === next.name &&
    prev.type === next.type &&
    prev.shortDesc === next.shortDesc &&
    prev.description === next.description &&
    prev.equipment === next.equipment &&
    prev.duration === next.duration &&
    prev.trainingLevel === next.trainingLevel &&
    prev.userStatus === next.userStatus &&
    getCourseStartedUsersCount(prev) === getCourseStartedUsersCount(next) &&
    prev.isPaid === next.isPaid &&
    prev.isPrivate === next.isPrivate &&
    prev.hasAccess === next.hasAccess &&
    prev.isFavorite === next.isFavorite &&
    prev.logoImg === next.logoImg &&
    prev.authorUsername === next.authorUsername &&
    prev.authorAvatarUrl === next.authorAvatarUrl &&
    prev.avgRating === next.avgRating &&
    prev.startedUsersCount === next.startedUsersCount &&
    replaceEqualDeep(prev.userCourses, next.userCourses) === prev.userCourses &&
    replaceEqualDeep(prev.reviews, next.reviews) === prev.reviews &&
    replaceEqualDeep(prev.dayLinks, next.dayLinks) === prev.dayLinks &&
    toTimestamp(prev.createdAt) === toTimestamp(next.createdAt) &&
    toTimestamp(prev.startedAt) === toTimestamp(next.startedAt) &&
    toTimestamp(prev.completedAt) === toTimestamp(next.completedAt) &&
    toTimestamp(prev.updatedAt) === toTimestamp(next.updatedAt)
  );
}

function reuseCourseReferences(
  oldCourses: CourseListItem[],
  newCourses: CourseListItem[],
): CourseListItem[] {
  const oldById = new Map<string, CourseListItem>(oldCourses.map((course) => [course.id, course]));
  let hasChanges = oldCourses.length !== newCourses.length;

  const merged = newCourses.map((course, index) => {
    const sameIndexCourse = oldCourses[index];
    if (sameIndexCourse && areCourseCardFieldsEqual(sameIndexCourse, course)) {
      return sameIndexCourse;
    }

    const previousById = oldById.get(course.id);
    if (previousById && areCourseCardFieldsEqual(previousById, course)) {
      hasChanges = true;
      return previousById;
    }

    hasChanges = true;
    return course;
  });

  if (!hasChanges) {
    return oldCourses;
  }

  return merged;
}

function applyCoursesStructuralSharing(oldData: unknown, newData: unknown): unknown {
  if (!isCoursesCatalogResponse(newData)) {
    return newData;
  }
  if (!isCoursesCatalogResponse(oldData)) {
    return newData;
  }
  if (!oldData.success || !newData.success || !oldData.data || !newData.data) {
    return replaceEqualDeep(oldData, newData);
  }

  const mergedCourses = reuseCourseReferences(oldData.data, newData.data);
  if (
    mergedCourses === oldData.data &&
    oldData.error === newData.error &&
    oldData.code === newData.code
  ) {
    return oldData;
  }

  return replaceEqualDeep(oldData, {
    ...newData,
    data: mergedCourses,
  });
}

/** Общий queryKey и queryFn для вкладки «Курсы» и экранов, которым нужен тот же список с hasAccess */
export const coursesCatalogQueryOptions = {
  queryKey: ["courses"] as const,
  queryFn: async () => {
    const res = await coursesApi.getAll();
    if (!res.success) throw new Error(res.error ?? "Ошибка загрузки курсов");
    return res;
  },
  structuralSharing: applyCoursesStructuralSharing,
};
