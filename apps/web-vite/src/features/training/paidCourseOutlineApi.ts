import { apiRequest } from "../../shared/api/client";

export type PaidCourseOutline = {
  courseId: string;
  courseType: string;
  name: string;
  description: string | null;
  equipment: string | null;
  trainingLevel: string | null;
  outline: {
    id: string;
    title: string;
    order: number;
    type?: string;
    equipment?: string;
    estimatedDuration?: number;
    theoryMinutes?: number;
  }[];
};
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const optional = (value: unknown): value is string | null =>
  value === null || typeof value === "string";
export function projectPaidCourseOutline(raw: unknown, type: string): PaidCourseOutline {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("INVALID_PAID_OUTLINE");
  const row = raw as Record<string, unknown>;
  if (
    !id(row.courseId) ||
    row.courseType !== type ||
    typeof row.name !== "string" ||
    !row.name.trim() ||
    !optional(row.description) ||
    !optional(row.equipment) ||
    !optional(row.trainingLevel) ||
    !Array.isArray(row.outline) ||
    row.outline.length > 500
  )
    throw Error("INVALID_PAID_OUTLINE");
  const ids = new Set<string>();
  const outline = row.outline.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("INVALID_PAID_OUTLINE_DAY");
    const day = value as Record<string, unknown>;
    if (
      !id(day.id) ||
      ids.has(day.id) ||
      typeof day.title !== "string" ||
      !day.title.trim() ||
      !Number.isSafeInteger(day.order) ||
      Number(day.order) < 0
    )
      throw Error("INVALID_PAID_OUTLINE_DAY");
    if (
      (day.type !== undefined && typeof day.type !== "string") ||
      (day.equipment !== undefined && typeof day.equipment !== "string") ||
      [day.estimatedDuration, day.theoryMinutes].some(
        (value) => value !== undefined && (!Number.isSafeInteger(value) || Number(value) < 0),
      )
    )
      throw Error("INVALID_PAID_OUTLINE_DAY");
    ids.add(day.id);
    return {
      id: day.id,
      title: day.title,
      order: day.order as number,
      ...(day.type !== undefined ? { type: day.type as string } : {}),
      ...(day.equipment !== undefined ? { equipment: day.equipment as string } : {}),
      ...(day.estimatedDuration !== undefined
        ? { estimatedDuration: day.estimatedDuration as number }
        : {}),
      ...(day.theoryMinutes !== undefined ? { theoryMinutes: day.theoryMinutes as number } : {}),
    };
  });
  return {
    courseId: row.courseId,
    courseType: type,
    name: row.name,
    description: row.description,
    equipment: row.equipment,
    trainingLevel: row.trainingLevel,
    outline,
  };
}

/** Unentitled paid learner sees only the Next marketing outline; private
 * course titles, step content, user progress, media URLs never cross this GET.
 */
export async function getPaidCourseOutline(type: string): Promise<PaidCourseOutline> {
  if (!id(type)) throw Error("INVALID_PAID_COURSE_TYPE");
  const response = await apiRequest<unknown>("/api/v1/public/paid-course-outline/" + type, {
    method: "GET",
    credentials: "omit",
  });
  return projectPaidCourseOutline(response, type);
}
