export const WALK_TRACK_PAGE_SIZE = 200;
export const WALK_TRACK_MAX_POINTS = 100_000;
export const WALK_DISPLAY_TOLERANCE_METERS = 2;

/** Every API/SQLite page must make forward progress. Never silently truncate a route. */
export function appendWalkTrackPage<T extends { seq: number }>(
  target: T[], page: readonly T[], after: number,
): number {
  let cursor = after;
  if (page.length > WALK_TRACK_PAGE_SIZE || target.length + page.length > WALK_TRACK_MAX_POINTS) {
    throw new Error("WALK_TRACK_LIMIT");
  }
  for (const point of page) {
    if (!Number.isSafeInteger(point.seq) || point.seq <= cursor) throw new Error("WALK_TRACK_CURSOR");
    cursor = point.seq;
  }
  target.push(...page);
  return cursor;
}
