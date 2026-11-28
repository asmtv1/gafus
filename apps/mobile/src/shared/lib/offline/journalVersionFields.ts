const VERSION = /^(?:none|[0-9a-f]{64})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type JournalVersionFields = { expectedVersion?: string; previousEventId?: string };
export function readJournalVersionFields(payload: Record<string, unknown>): JournalVersionFields {
  const version = payload.expectedVersion;
  const previous = payload.previousEventId;
  if ((version !== undefined && (typeof version !== "string" || !VERSION.test(version))) ||
      (previous !== undefined && (typeof previous !== "string" || !UUID.test(previous))) ||
      (version !== undefined && previous !== undefined)) throw new Error("V2_INVALID_PROGRESS_VERSION");
  return {
    ...(typeof version === "string" ? { expectedVersion: version } : {}),
    ...(typeof previous === "string" ? { previousEventId: previous } : {}),
  };
}
export function validProgressVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION.test(value);
}
/** Exact durable resource identity, never a position/index. */
export function stepJournalResource(p: Record<string, unknown>): string | null {
  if (typeof p.courseId === "string" && typeof p.dayOnCourseId === "string" &&
      typeof p.expectedStepOnDayId === "string" && typeof p.expectedStepId === "string")
    return JSON.stringify(["training", p.courseId, p.dayOnCourseId, p.expectedStepOnDayId, p.expectedStepId]);
  if (typeof p.scheduleId === "string" && typeof p.expectedBundleStepId === "string" &&
      typeof p.expectedStepId === "string")
    return JSON.stringify(["daily", p.scheduleId, p.expectedBundleStepId, p.expectedStepId]);
  if (typeof p.videoId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(p.videoId))
    return JSON.stringify(["video", p.videoId]);
  return null;
}
