/**
 * Trainer Panel can publish best-effort Redis hints after edits, but readers
 * validate only the transactionally updated PostgreSQL content revision.
 * The version table and its triggers are created by the course cache migration.
 *
 * COURSE_CACHE_SYNC_ENABLED remains a deployment switch. Readers also require
 * REDIS_URL for compatibility, although hot reads do not access Redis.
 */
import { prisma } from "@gafus/prisma";
import { recordCourseCacheEvent } from "./trainingContentMetrics";

// Redis outages must not emit a log line for every user reading a lesson.
const READ_WARNING_INTERVAL_MS = 30_000;
let lastReadWarningAt = Number.NEGATIVE_INFINITY;

export function courseContentSyncEnabled(): boolean {
  return process.env.COURSE_CACHE_SYNC_ENABLED === "true" && Boolean(process.env.REDIS_URL);
}

/**
 * Fail closed: null means "do not use local content cache", not revision 0.
 * Errors are intentionally not exposed to course viewers.
 */
export async function getSharedCourseContentRevision(): Promise<string | null> {
  if (!courseContentSyncEnabled()) return null;
  try {
    const { readCourseContentRevision } = await import("@gafus/queues/course-cache-sync");
    return await readCourseContentRevision();
  } catch (error) {
    recordCourseCacheEvent("redisReadFailure");
    if (Date.now() - lastReadWarningAt >= READ_WARNING_INTERVAL_MS) {
      lastReadWarningAt = Date.now();
      console.warn(
        "[CourseContentCache] Redis revision unavailable: bypassing course cache",
        error,
      );
    }
    return null;
  }
}

/**
 * PostgreSQL is the only authoritative revision: content-table triggers update
 * this row in the same transaction as a lesson edit. Redis publication is a
 * best-effort notification; another Redis GET cannot improve coherence but
 * adds latency and makes the cache unnecessarily unavailable on Redis outages.
 *
 * Every cache reuse still verifies this committed revision. A missing row
 * or database error fails closed to direct Prisma content reads.
 */
export async function getVerifiedCourseContentRevision(): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ revision: bigint }[]>`
      SELECT "revision" FROM "CourseContentRevision" WHERE "id" = 1
    `;
    if (rows.length !== 1 || typeof rows[0]?.revision !== "bigint") {
      throw new Error("COURSE_CACHE_DURABLE_REVISION_MISSING");
    }
    return rows[0].revision.toString();
  } catch (error) {
    recordCourseCacheEvent("dbRevisionFailure");
    if (Date.now() - lastReadWarningAt >= READ_WARNING_INTERVAL_MS) {
      lastReadWarningAt = Date.now();
      console.warn(
        "[CourseContentCache] Durable revision check unavailable; bypassing cache",
        error,
      );
    }
    return null;
  }
}

/** A failed notification never reverses an already committed trainer edit. */
export async function publishCourseContentChange(): Promise<void> {
  if (!courseContentSyncEnabled()) return;
  try {
    const { bumpCourseContentRevision } = await import("@gafus/queues/course-cache-sync");
    await bumpCourseContentRevision();
    recordCourseCacheEvent("redisPublishSuccess");
  } catch (error) {
    recordCourseCacheEvent("redisPublishFailure");
    console.error(
      "[CourseContentCache] Redis revision publication failed; PostgreSQL revision remains authoritative",
      error,
    );
  }
}
