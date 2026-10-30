import type { DiaryEntryWire, DiaryRead } from "@gafus/types";
import { apiRequest, ApiError } from "../../shared/api/client";

export type VerifiedDiaryEntry = Pick<DiaryEntryWire,
  "id" | "content" | "createdAt" | "updatedAt" | "dayId" |
  "dayOnCourseId" | "dayOrder" | "dayTitle">;

const validId = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const validIso = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown> : null;

/** Only canonical server-owned learner diary fields, never Core/user DTO extras. */
export function projectDiaryEntries(raw: unknown): VerifiedDiaryEntry[] {
  const response = record(raw);
  if (!response || !Array.isArray(response.entries))
    throw Error("INVALID_DIARY_READ");
  const seen = new Set<string>();
  return response.entries.map((rawEntry: unknown) => {
    const entry = record(rawEntry);
    const dayOrder = entry?.dayOrder;
    if (!entry || !validId(entry.id) || !validId(entry.dayId) ||
      !validId(entry.dayOnCourseId) || typeof entry.content !== "string" ||
      entry.content.length > 10000 || typeof entry.dayTitle !== "string" ||
      typeof dayOrder !== "number" || !Number.isSafeInteger(dayOrder) || dayOrder < 0 ||
      !validIso(entry.createdAt) || !validIso(entry.updatedAt) ||
      seen.has(entry.id)) throw Error("INVALID_DIARY_ENTRY");
    seen.add(entry.id);
    return {
      id: entry.id, content: entry.content,
      createdAt: entry.createdAt, updatedAt: entry.updatedAt,
      dayId: entry.dayId, dayOnCourseId: entry.dayOnCourseId,
      dayOrder, dayTitle: entry.dayTitle,
    } satisfies VerifiedDiaryEntry;
  });
}

/** Existing authenticated Core diary GET: course + upper-bound day, no progress POST. */
export async function getTrainingDiary(
  courseId: string, upToDayOnCourseId: string,
): Promise<VerifiedDiaryEntry[]> {
  if (!validId(courseId) || !validId(upToDayOnCourseId))
    throw Error("INVALID_DIARY_TARGET");
  const params = new URLSearchParams({ courseId, upToDayOnCourseId });
  const raw = await apiRequest<DiaryRead["data"]>(
    "/api/v1/training/diary?" + params.toString(),
    { method: "GET", browserAuth: true },
  );
  return projectDiaryEntries(raw);
}

/** Existing plain 200 ACK, no idempotency claim; caller must fresh-GET reconcile. */
export async function postTrainingDiary(
  dayOnCourseId: string, content: string,
): Promise<void> {
  const normalized = content.trim();
  if (!validId(dayOnCourseId) || !normalized || normalized.length > 10000)
    throw Error("INVALID_DIARY_WRITE");
  const ack = await apiRequest<unknown>("/api/v1/training/diary", {
    method: "POST", browserAuth: true, expectedStatus: 200,
    json: { dayOnCourseId, content: normalized },
  });
  if (ack !== undefined)
    throw new ApiError(200, "Сохранение не подтверждено", "DIARY_ACK_MISMATCH");
}
