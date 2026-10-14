/**
 * Small, dedicated import surface: do NOT import the queues index for this.
 * The existing Redis instance is shared across the already deployed services.
 *
 * The global revision is read before every local content-cache hit. Redis
 * disconnection never authorizes reuse of local stale course content.
 */
import { connection } from "./redis.js";

const VERSION_KEY = "gafus:training-content:revision:v1";
const REDIS_TIMEOUT_MS = 800;

async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("COURSE_CACHE_REDIS_TIMEOUT")), REDIS_TIMEOUT_MS);
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function assertReady(): void {
  if (connection.status !== "ready") {
    throw new Error("COURSE_CACHE_REDIS_UNAVAILABLE");
  }
}

/** Does not return stale local data if the Redis revision cannot be checked. */
export async function readCourseContentRevision(): Promise<string> {
  assertReady();
  const value = await bounded(connection.get(VERSION_KEY));
  if (value !== null && !/^[0-9]+$/.test(value)) {
    throw new Error("COURSE_CACHE_REDIS_REVISION_INVALID");
  }
  return value ?? "0";
}

/** Call once after successfully committing a shared course-content mutation. */
export async function bumpCourseContentRevision(): Promise<void> {
  assertReady();
  await bounded(connection.incr(VERSION_KEY));
}
