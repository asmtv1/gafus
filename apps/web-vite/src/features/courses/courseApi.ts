import type { CourseWithProgressData } from "@gafus/types";
import { TrainingStatus } from "@gafus/types";
import { publicCourseCoverUrl } from "@gafus/types";
import { apiRequest } from "../../shared/api/client";

/**
 * JSON-friendly projection of the already existing Hono GET /api/v1/courses
 * contract. No duplicate entitlement or progress computation in Web.
 */
export type CourseListItem = Pick<
  CourseWithProgressData,
  | "id"
  | "name"
  | "type"
  | "shortDesc"
  | "duration"
  | "isPaid"
  | "isPrivate"
  | "hasAccess"
  | "isFavorite"
  | "userStatus"
  | "trainingLevel"
> & {
  logoImg?: string;
  avgRating?: number | null;
  /** Existing authenticated Hono/Core course data, owned by this viewer. */
  startedAt?: string | null;
  completedAt?: string | null;
  startedUsersCount?: number;
};

/** Only authenticated owner-scoped course data is rendered by Web. */
export type CourseCatalogItem = CourseListItem;

function isCourse(value: unknown): value is CourseListItem {
  if (!value || typeof value !== "object") return false;
  const course = value as Record<string, unknown>;
  return (
    typeof course.id === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(course.id) &&
    typeof course.name === "string" &&
    typeof course.type === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(course.type) &&
    typeof course.shortDesc === "string" &&
    typeof course.duration === "string" &&
    typeof course.isPaid === "boolean" &&
    typeof course.isPrivate === "boolean" &&
    typeof course.hasAccess === "boolean" &&
    typeof course.isFavorite === "boolean" &&
    Object.values(TrainingStatus).includes(course.userStatus as TrainingStatus) &&
    ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"].includes(String(course.trainingLevel)) &&
    (course.avgRating === undefined || course.avgRating === null ||
      (typeof course.avgRating === "number" && Number.isFinite(course.avgRating) &&
        course.avgRating >= 0 && course.avgRating <= 5)) &&
    ([course.startedAt, course.completedAt].every(date =>
      date === undefined || date === null ||
      (typeof date === "string" && !Number.isNaN(Date.parse(date)) &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(date)))) &&
    (course.startedUsersCount === undefined ||
      (typeof course.startedUsersCount === "number" &&
        Number.isSafeInteger(course.startedUsersCount) && course.startedUsersCount >= 0))
  );
}

/** Authenticated Hono/Core catalogs provide genuine createdAt timestamps.
 * Match source Next's newest-first ordering without inferring absent dates. */
function newestFirstFromCore(courses: CourseListItem[]): CourseListItem[] {
  const creationDate = (course: CourseListItem): number | null => {
    const raw = (course as CourseListItem & { createdAt?: unknown }).createdAt;
    if (typeof raw !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(raw)) return null;
    const instant = Date.parse(raw);
    return Number.isFinite(instant) ? instant : null;
  };
  const dates = courses.map(creationDate);
  if (dates.some(value => value === null)) return courses;
  const byId = new Map(courses.map((course,index) => [course.id, dates[index] ?? 0]));
  return [...courses].sort((a,b) => (byId.get(b.id) ?? 0) - (byId.get(a.id) ?? 0));
}

/** Only allowlisted Core fields enter the viewer-scoped browser cache.
 * Owner IDs, raw relations and unknown media fields are never copied. */
function projectCourse(course: CourseListItem): CourseListItem {
  return {
    id: course.id,
    name: course.name,
    // avgRating is an existing non-sensitive Core catalog field. Never put
    // owner-scope information or extra keys in the strict anonymous DTO.
    ...("avgRating" in course &&
      (course.avgRating === null || typeof course.avgRating === "number")
      ? { avgRating: course.avgRating } : {}),
    ...(() => {
      const logoImg = publicCourseCoverUrl("logoImg" in course ? course.logoImg : null);
      return logoImg ? { logoImg } : {};
    })(),
    type: course.type,
    shortDesc: course.shortDesc,
    duration: course.duration,
    isPaid: course.isPaid,
    isPrivate: course.isPrivate,
    hasAccess: course.hasAccess,
    isFavorite: course.isFavorite,
    userStatus: course.userStatus,
    trainingLevel: course.trainingLevel,
    ...("startedAt" in course && course.startedAt !== undefined
      ? { startedAt: course.startedAt } : {}),
    ...("completedAt" in course && course.completedAt !== undefined
      ? { completedAt: course.completedAt } : {}),
    ...("startedUsersCount" in course &&
      typeof course.startedUsersCount === "number"
      ? { startedUsersCount: course.startedUsersCount } : {}),
  };
}

/** The Web catalog never issues anonymous HTTP requests. The App and
 * component boundaries reject missing principals before invoking this API. */
export async function listCourses(): Promise<CourseListItem[]> {
  const data = await apiRequest<unknown>("/api/v1/courses");
  if (!Array.isArray(data) || !data.every(isCourse) ||
    new Set(data.map(course => course.id)).size !== data.length) {
    throw new Error("Сервер вернул некорректный список курсов");
  }
  return newestFirstFromCore(data).map(projectCourse);
}

/** Reuses existing authenticated Hono POST /courses/favorites.
 * Explicit add/remove are idempotent; never use toggle during retries.
 */
export async function setCourseFavorite(courseId: string, add: boolean): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(courseId)) {
    throw new Error("Некорректный идентификатор курса");
  }
  const result = await apiRequest<unknown>("/api/v1/courses/favorites", {
    method: "POST",
    json: { courseId, action: add ? "add" : "remove" },
  });
  if (
    !result ||
    typeof result !== "object" ||
    typeof (result as Record<string, unknown>).isFavorite !== "boolean"
  ) {
    throw new Error("Сервер вернул некорректное избранное");
  }
  // The successful response must confirm the explicit add/remove action,
  // not merely contain a boolean. Never mark the mutation successful on an
  // opposite ACK or silently replay a possibly committed POST.
  if ((result as { isFavorite: boolean }).isFavorite !== add) {
    throw new Error("Сервер не подтвердил изменение избранного");
  }
  return add;
}
