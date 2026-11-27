/** Public anonymous paid-course projection. Do not return lesson/media or owner rows. */
import type { PublicOutlineDay, PublicPaidCourseOutline } from "@gafus/types/course-outline";
export type { PublicOutlineDay, PublicPaidCourseOutline } from "@gafus/types/course-outline";

export interface PublicOutlineCourse {
  id: string;
  name: string;
  description: string | null;
  shortDesc: string | null;
  equipment: string | null;
  trainingLevel: string | null;
  isPrivate: boolean;
  isPaid: boolean;
}

/** A missing or private/unpaid course must not trigger any day-content read. */
export function isPublicPaidCourse<T extends Pick<PublicOutlineCourse, "isPrivate" | "isPaid">>(
  course: T | null | undefined,
): course is T {
  return Boolean(course && !course.isPrivate && course.isPaid);
}

export function projectPublicPaidCourseOutline(
  courseType: string,
  metadata: PublicOutlineCourse,
  outline: readonly PublicOutlineDay[],
): PublicPaidCourseOutline {
  if (!Array.isArray(outline)) throw Error("INVALID_COURSE_OUTLINE");
  const rows = outline.map(item => {
    if (!item || !/^[A-Za-z0-9_-]{1,128}$/.test(item.id) ||
      typeof item.title !== "string" || !item.title.trim() ||
      !Number.isSafeInteger(item.order) || item.order < 0) {
      throw Error("INVALID_COURSE_OUTLINE");
    }
    return {
      id: item.id,
      title: item.title,
      order: item.order,
      type: item.type,
      equipment: item.equipment,
      estimatedDuration: item.estimatedDuration,
      theoryMinutes: item.theoryMinutes,
    };
  });
  if (new Set(rows.map(item => item.id)).size !== rows.length) {
    throw Error("DUPLICATE_OUTLINE_DAY");
  }
  return {
    courseId: metadata.id,
    courseType,
    name: metadata.name,
    description: metadata.description ?? metadata.shortDesc ?? null,
    equipment: metadata.equipment ?? null,
    trainingLevel: metadata.trainingLevel ?? null,
    outline: rows,
  };
}
