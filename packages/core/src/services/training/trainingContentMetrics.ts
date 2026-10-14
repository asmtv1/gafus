/**
 * Bounded, process-local counters for the shared training-day content cache.
 * No keys, course names, user identifiers, media URLs or credentials are kept.
 * Counters reset on process restart. This module has no Redis/Prisma imports.
 */
import { timingSafeEqual } from "node:crypto";

const EVENTS = [
  "hit",
  "miss",
  "inflightReuse",
  "bypassDisabled",
  "bypassRedis", // legacy counter retained for consumers of the existing metric schema
  "bypassRevision",
  "bypassOverflow",
  "revisionFlush",
  "ttlExpired",
  "eviction",
  "localInvalidation",
  "redisReadFailure",
  "redisPublishSuccess",
  "redisPublishFailure",
  "dbError",
  "dbRevisionFailure",
] as const;

export type CourseCacheEvent = (typeof EVENTS)[number];
type Counters = Record<CourseCacheEvent, number>;
const freshCounters = (): Counters =>
  Object.fromEntries(EVENTS.map((event) => [event, 0])) as Counters;

const DB_LATENCY_BOUNDS_MS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;
let startedAt = Date.now();
let counters = freshCounters();
let dbReads = 0;
let dbReadMsTotal = 0;
let dbReadMsMax = 0;
let dbReadHistogram = Array<number>(DB_LATENCY_BOUNDS_MS.length + 1).fill(0);

export function recordCourseCacheEvent(event: CourseCacheEvent): void {
  counters[event] += 1;
}

export function observeCourseContentDbRead(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  dbReads += 1;
  dbReadMsTotal += durationMs;
  dbReadMsMax = Math.max(dbReadMsMax, durationMs);
  const index = DB_LATENCY_BOUNDS_MS.findIndex((limit) => durationMs <= limit);
  dbReadHistogram[index < 0 ? DB_LATENCY_BOUNDS_MS.length : index] += 1;
}

export function getCourseCacheMetricsSnapshot() {
  return {
    startedAt,
    uptimeMs: Math.max(0, Date.now() - startedAt),
    flags: {
      enabled: process.env.ENABLE_COURSE_CACHE === "true",
      syncEnabled:
        process.env.COURSE_CACHE_SYNC_ENABLED === "true" && Boolean(process.env.REDIS_URL),
    },
    counters: { ...counters },
    prismaRead: {
      count: dbReads,
      averageMs: dbReads ? dbReadMsTotal / dbReads : 0,
      maxMs: dbReadMsMax,
      histogram: Object.fromEntries(
        DB_LATENCY_BOUNDS_MS.map((limit, index) => [String(limit), dbReadHistogram[index]]),
      ),
      over1000Ms: dbReadHistogram[DB_LATENCY_BOUNDS_MS.length],
    },
  };
}

/** Endpoint must stay inaccessible unless an explicitly configured strong secret is supplied. */
export function canReadCourseCacheMetrics(authorization: string | null): boolean {
  const secret = process.env.COURSE_CACHE_METRICS_TOKEN;
  if (!secret || secret.length < 24 || !authorization?.startsWith("Bearer ")) return false;
  // TextEncoder avoids Buffer's incompatible generic type definitions
  // between the legacy Next.js and modern Node TypeScript configurations.
  const supplied = new TextEncoder().encode(authorization.slice(7));
  const expected = new TextEncoder().encode(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Explicit test helper; never called by the normal cache runtime. */
export function resetCourseCacheMetricsForTests(): void {
  startedAt = Date.now();
  counters = freshCounters();
  dbReads = 0;
  dbReadMsTotal = 0;
  dbReadMsMax = 0;
  dbReadHistogram = Array<number>(DB_LATENCY_BOUNDS_MS.length + 1).fill(0);
}
