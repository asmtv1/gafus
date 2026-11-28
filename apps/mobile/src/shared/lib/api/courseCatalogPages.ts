import type { ApiResponse } from "./client";
import type { CourseListItem, CoursesResponse } from "./courses";

const malformed = (): ApiResponse<CoursesResponse> => ({
  success: false, error: "Сервер вернул некорректный список курсов", code: "INVALID_COURSE_CATALOG",
});
const stale = (): ApiResponse<CoursesResponse> => ({
  success: false, error: "Сессия изменилась", code: "G05_SESSION_CHANGED",
});

function isCard(value: unknown): value is CourseListItem {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return typeof card.id === "string" && card.id.length > 0 &&
    ["name", "type", "description", "shortDesc", "duration", "logoImg", "authorUsername",
      "trainingLevel", "userStatus", "createdAt", "updatedAt"].every(k => typeof card[k] === "string") &&
    ["isPaid", "isPrivate", "hasAccess", "isFavorite"].every(k => typeof card[k] === "boolean");
}

export async function collectCourseCatalog(
  fetchPage: (path: string) => Promise<ApiResponse<unknown>>,
  isCurrent: () => boolean,
): Promise<ApiResponse<CoursesResponse>> {
  const all: CourseListItem[] = [];
  const seen = new Set<string>();
  let path = "/api/v1/courses";
  for (;;) {
    if (!isCurrent()) return stale();
    const response = await fetchPage(path);
    if (!isCurrent()) return stale();
    if (!response.success) return { success:false, error:response.error, code:response.code, details:response.details };
    const data = response.data;
    if (!data || typeof data !== "object") return malformed();
    const legacy = Array.isArray(data);
    const page = data as { items?: unknown; next?: unknown };
    const items = legacy ? data : page.items;
    if ((legacy && all.length > 0) || !Array.isArray(items) ||
        !items.every(isCard)) return malformed();
    for (const card of items) {
      if (seen.has(card.id)) return malformed();
      seen.add(card.id);
      all.push(card);
    }
    if (legacy || page.next === null) return { success:true, data:all };
    const next = page.next as { id?: unknown; createdAt?: unknown } | null;
    if (!items.length || !next || typeof next.id !== "string" ||
        next.id !== items[items.length-1].id || typeof next.createdAt !== "string" ||
        !Number.isFinite(Date.parse(next.createdAt)) ||
        next.createdAt !== items[items.length-1].createdAt) return malformed();
    path = "/api/v1/courses?afterId=" + encodeURIComponent(next.id) +
      "&before=" + encodeURIComponent(next.createdAt);
  }
}
