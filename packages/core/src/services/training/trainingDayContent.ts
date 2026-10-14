/**
 * Shared course-day content only: NO user progress, personalization, or grants.
 *
 * Access is checked by the caller on EVERY read, even when this content is cached.
 * The short-lived, per-process cache is OFF unless ENABLE_COURSE_CACHE=true.
 */
import { prisma, type Prisma } from "@gafus/prisma";
import {
  courseContentSyncEnabled,
  getVerifiedCourseContentRevision,
} from "./trainingContentRevision";
import { observeCourseContentDbRead, recordCourseCacheEvent } from "./trainingContentMetrics";

const trainingDayContentSelect = {
  id: true,
  order: true,
  courseId: true,
  course: {
    select: {
      duration: true,
      isPersonalized: true,
    },
  },
  day: {
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      showCoursePathExport: true,
      stepLinks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          step: {
            select: {
              id: true,
              title: true,
              description: true,
              durationSec: true,
              estimatedDurationSec: true,
              videoUrl: true,
              imageUrls: true,
              pdfUrls: true,
              type: true,
              checklist: true,
              requiresVideoReport: true,
              requiresWrittenFeedback: true,
              hasTestQuestions: true,
              surveySlug: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.DayOnCourseSelect;

export async function loadTrainingDayContent(courseType: string, dayOnCourseId: string) {
  const started = performance.now();
  try {
    return await prisma.dayOnCourse.findFirst({
      where: { id: dayOnCourseId, course: { type: courseType } },
      select: trainingDayContentSelect,
    });
  } catch (error) {
    recordCourseCacheEvent("dbError");
    throw error;
  } finally {
    observeCourseContentDbRead(performance.now() - started);
  }
}

/**
 * One cache per Node.js process, shared by the Hono and Next.js entrypoints
 * within that process. No user-scoped state or authorization result is stored.
 *
 * Until trainer writes can invalidate ALL running processes, do not enable the
 * flag in production. The bounded TTL is only a secondary stale-data limit.
 */
const CONTENT_TTL_MS = 60_000;
const CONTENT_MAX_ENTRIES = 256;
type TrainingDayContent = Awaited<ReturnType<typeof loadTrainingDayContent>>;
type ContentCacheEntry = {
  value: NonNullable<TrainingDayContent>;
  courseId: string;
  expiresAt: number;
};

const contentCache = new Map<string, ContentCacheEntry>();
const pendingLoads = new Map<string, Promise<TrainingDayContent>>();
let cacheGeneration = 0;
let wasEnabled = false;
let observedRevision: string | null = null;
let nextProbeId = 0;
let latestAppliedProbeId = 0;

function keyFor(courseType: string, dayOnCourseId: string): string {
  return JSON.stringify([courseType, dayOnCourseId]);
}

function enabled(): boolean {
  return process.env.ENABLE_COURSE_CACHE === "true";
}

/** Clear all entries and cancel pending cache fills (not active DB requests). */
export function clearTrainingDayContentCache(): void {
  cacheGeneration++;
  contentCache.clear();
  pendingLoads.clear();
}

/** Local-process invalidation for one course. Trainer writes are wired later. */
export function invalidateCourseContentCache(courseId: string): void {
  recordCourseCacheEvent("localInvalidation");
  // In-flight requests may not yet have resolved their course IDs. Do not let
  // them repopulate a stale entry after any content mutation.
  cacheGeneration++;
  pendingLoads.clear();
  for (const [key, entry] of contentCache) {
    if (entry.courseId === courseId) contentCache.delete(key);
  }
}

/** Local-process invalidation for a day-on-course ID. */
export function invalidateTrainingDayContentCache(dayOnCourseId: string): void {
  recordCourseCacheEvent("localInvalidation");
  cacheGeneration++;
  pendingLoads.clear();
  for (const key of contentCache.keys()) {
    const tuple = JSON.parse(key) as [string, string];
    if (tuple[1] === dayOnCourseId) contentCache.delete(key);
  }
}

/**
 * A TrainingDay can belong to multiple courses. Evict every cached course-day
 * link that refers to any of the edited/deleted TrainingDay records.
 */
export function invalidateTrainingDaysContentCache(dayIds: readonly string[]): void {
  if (dayIds.length === 0) return;
  recordCourseCacheEvent("localInvalidation");
  const changed = new Set(dayIds);
  cacheGeneration++;
  pendingLoads.clear();
  for (const [key, entry] of contentCache) {
    if (changed.has(entry.value.day.id)) contentCache.delete(key);
  }
}

/**
 * Steps can be shared across days and courses. Target every cached occurrence,
 * including media replacements and deletions where the DB linkage is gone.
 */
export function invalidateStepsContentCache(stepIds: readonly string[]): void {
  if (stepIds.length === 0) return;
  recordCourseCacheEvent("localInvalidation");
  const changed = new Set(stepIds);
  cacheGeneration++;
  pendingLoads.clear();
  for (const [key, entry] of contentCache) {
    if (entry.value.day.stepLinks.some(({ step }) => changed.has(step.id))) {
      contentCache.delete(key);
    }
  }
}

/**
 * Only cache the shared Prisma projection; personalized placeholders, progress,
 * paid/private course access and monetized-step gates are evaluated afterwards.
 * On cache infrastructure failures, read directly from Prisma.
 */
export async function getTrainingDayContent(
  courseType: string,
  dayOnCourseId: string,
): Promise<TrainingDayContent> {
  // Retain the existing rollout gate. Reader freshness now relies only on
  // PostgreSQL's transactionally maintained version, not on Redis reads.
  if (!enabled() || !courseContentSyncEnabled()) {
    recordCourseCacheEvent("bypassDisabled");
    if (wasEnabled) {
      clearTrainingDayContentCache();
      observedRevision = null;
      wasEnabled = false;
    }
    return loadTrainingDayContent(courseType, dayOnCourseId);
  }
  wasEnabled = true;

  // One lightweight PostgreSQL revision query per request (no Redis GET).
  // It changes atomically with the lesson edit, even if Redis publication fails.
  // Version probes can resolve out of order: an older in-flight query must not
  // revert a revision newer requests already observed.
  const probeId = ++nextProbeId;
  const revision = await getVerifiedCourseContentRevision();
  if (probeId < latestAppliedProbeId) {
    if (revision === null || revision !== observedRevision) {
      recordCourseCacheEvent("bypassRevision");
      return loadTrainingDayContent(courseType, dayOnCourseId);
    }
  } else {
    latestAppliedProbeId = probeId;
    if (revision === null) {
      recordCourseCacheEvent("bypassRevision");
      clearTrainingDayContentCache();
      observedRevision = null;
      return loadTrainingDayContent(courseType, dayOnCourseId);
    }
    if (revision !== observedRevision) {
      if (observedRevision !== null) recordCourseCacheEvent("revisionFlush");
      clearTrainingDayContentCache();
      observedRevision = revision;
    }
  }

  const key = keyFor(courseType, dayOnCourseId);
  try {
    const hit = contentCache.get(key);
    if (hit) {
      if (hit.expiresAt > Date.now()) {
        // Refresh insertion order for bounded LRU eviction.
        contentCache.delete(key);
        contentCache.set(key, hit);
        recordCourseCacheEvent("hit");
        return hit.value;
      }
      contentCache.delete(key);
      recordCourseCacheEvent("ttlExpired");
    }
    const pending = pendingLoads.get(key);
    if (pending) {
      recordCourseCacheEvent("inflightReuse");
      return pending;
    }
  } catch {
    return loadTrainingDayContent(courseType, dayOnCourseId);
  }

  if (pendingLoads.size >= CONTENT_MAX_ENTRIES) {
    recordCourseCacheEvent("bypassOverflow");
    // Bound the number of unrelated concurrent cold misses as well.
    return loadTrainingDayContent(courseType, dayOnCourseId);
  }

  recordCourseCacheEvent("miss");
  const generation = cacheGeneration;
  const task = Promise.resolve()
    .then(() => loadTrainingDayContent(courseType, dayOnCourseId))
    .then((content) => {
      // Missing records and results from before an invalidation are never saved.
      if (content && enabled() && generation === cacheGeneration) {
        try {
          contentCache.delete(key);
          contentCache.set(key, {
            value: content,
            courseId: content.courseId,
            expiresAt: Date.now() + CONTENT_TTL_MS,
          });
          while (contentCache.size > CONTENT_MAX_ENTRIES) {
            const oldestKey = contentCache.keys().next().value;
            if (oldestKey === undefined) break;
            contentCache.delete(oldestKey);
            recordCourseCacheEvent("eviction");
          }
        } catch {
          // A failed cache write must never fail a successful database read.
          contentCache.delete(key);
        }
      }
      return content;
    })
    .finally(() => {
      // An invalidation may have started a newer request for the same key.
      if (pendingLoads.get(key) === task) pendingLoads.delete(key);
    });
  try {
    pendingLoads.set(key, task);
  } catch {
    // The already-started DB request is still valid if the map is unusable.
    return task;
  }
  return task;
}
