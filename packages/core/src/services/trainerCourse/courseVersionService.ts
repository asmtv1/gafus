/**
 * Global PostgreSQL Course.version CAS: database trigger is SOLE incrementer.
 * DO NOT run until the additive Course.version migration is applied.
 * Name-only: no full-form/day/access changes.
 */
import { createWebLogger } from "@gafus/logger";
import { invalidateCourseContentCache } from "../training/trainingDayContent";
import { publishCourseContentChange } from "../training/trainingContentRevision";

const logger = createWebLogger("trainer-course-version");
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const isVersion = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= 2147483647;

export type VersionedName = { id: string; name: string; version: number };
export type CourseVersionActor = { id: string; role: string };
export type CourseVersionResult =
  | { status: "found"; data: VersionedName }
  | { status: "updated"; data: VersionedName }
  | { status: "stale" | "not_found" | "invalid" | "unknown" };

/** Persistence is the sole owner of Course.version, SQL owner predicate,
 * transaction row lock and trigger. The Core handler owns status/validation.
 * A missing binding becomes the existing UNKNOWN status, never a blind retry.
 */
export interface CourseVersionRowsPort {
  readCourseVersionRows(courseId: string, actor: CourseVersionActor): Promise<VersionedName[]>;
  writeCourseNameVersionRows(
    input: { courseId: string; name: string; expectedVersion: number },
    actor: CourseVersionActor,
  ): Promise<VersionedName[]>;
  setCourseLogoVersionRows(
    input: { courseId: string; logoUrl: string; expectedVersion: number },
    actor: CourseVersionActor,
  ): Promise<CourseLogoVersionResult>;
}
function requireCourseVersionRowsPort(port: CourseVersionRowsPort | undefined): Readonly<CourseVersionRowsPort> {
  if (!port) throw new Error("COURSE_VERSION_PORT_UNBOUND");
  return port;
}

function validActor(actor: CourseVersionActor): boolean {
  return !!actor && idPattern.test(actor.id) &&
    (actor.role === "TRAINER" || actor.role === "ADMIN");
}
function isDbRow(row: unknown): row is VersionedName {
  if (!row || typeof row !== "object") return false;
  const x = row as Record<string, unknown>;
  return typeof x.id === "string" && x.id.length > 0 &&
    typeof x.name === "string" && isVersion(x.version);
}

/** Private GET version + name; owner checked within SQL predicate. */
export async function readCourseNameVersion(
  courseId: string, actor: CourseVersionActor,
  rowsPort?: CourseVersionRowsPort,
): Promise<CourseVersionResult> {
  if (!idPattern.test(courseId) || !validActor(actor))
    return { status: "invalid" };
  try {
    const rows = await (requireCourseVersionRowsPort(rowsPort)).readCourseVersionRows(courseId, actor);
    if (rows.length === 0) return { status: "not_found" };
    if (rows.length !== 1 || !isDbRow(rows[0]))
      return { status: "unknown" };
    return { status: "found", data: rows[0] };
  } catch {
    logger.error("COURSE_VERSION_PRIVATE_READ_UNKNOWN");
    return { status: "unknown" };
  }
}

/**
 * Authorized CAS and data update are ONE SQL statement.
 * A stale or wrong-owner update affects zero rows. DB trigger increments once
 * and UPDATE RETURNING carries the new version. Never SET version manually.
 */
export async function updateCourseNameVersioned(
  input: { courseId: string; name: string; expectedVersion: number },
  actor: CourseVersionActor,
  rowsPort?: CourseVersionRowsPort,
): Promise<CourseVersionResult> {
  if (!input || !idPattern.test(input.courseId) ||
      typeof input.name !== "string" || input.name.length < 1 ||
      input.name.length > 500 || !isVersion(input.expectedVersion) ||
      !validActor(actor))
    return { status: "invalid" };
  let rows: VersionedName[];
  try {
    rows = await (requireCourseVersionRowsPort(rowsPort)).writeCourseNameVersionRows(input, actor);
  } catch {
    logger.error("COURSE_VERSION_WRITE_UNKNOWN");
    return { status: "unknown" };
  }
  if (rows.length === 0) {
    const lookup = await readCourseNameVersion(input.courseId, actor, rowsPort);
    if (lookup.status === "found") return { status: "stale" };
    return lookup.status === "not_found"
      ? { status: "not_found" } : { status: "unknown" };
  }
  if (rows.length !== 1 || !isDbRow(rows[0]) ||
      rows[0].id !== input.courseId ||
      rows[0].name !== input.name ||
      rows[0].version !== input.expectedVersion + 1)
    return { status: "unknown" };

  // Only a proven committed winner may publish. Post-commit faults are UNKNOWN,
  // not rolled back; they must not trigger retries.
  try {
    invalidateCourseContentCache(input.courseId);
    await publishCourseContentChange();
  } catch {
    logger.error("COURSE_VERSION_POST_COMMIT_UNKNOWN");
    return { status: "unknown" };
  }
  return { status: "updated", data: rows[0] };
}


/**
 * DB-only logo set/clear CAS. SELECT FOR UPDATE captures previous URL and
 * locks same Course row; the one subsequent UPDATE advances DB version ONCE.
 * Never interacts with S3/CDN/provider and never changes access/day relations.
 */
export type CourseLogoVersionResult =
  | { status: "updated"; data: { version: number; previousLogoUrl: string | null } }
  | { status: "stale" | "not_found" | "invalid" | "unknown" };

export async function setCourseLogoVersioned(
  input: { courseId: string; logoUrl: string; expectedVersion: number },
  actor: CourseVersionActor,
  rowsPort?: CourseVersionRowsPort,
): Promise<CourseLogoVersionResult> {
  if (!input || !idPattern.test(input.courseId) ||
      !validActor(actor) || !isVersion(input.expectedVersion) ||
      typeof input.logoUrl !== "string" || input.logoUrl.length > 2000)
    return { status: "invalid" };
  try {
    return await (requireCourseVersionRowsPort(rowsPort)).setCourseLogoVersionRows(input,actor);
  } catch {
    logger.error("COURSE_LOGO_VERSION_UNKNOWN");
    return { status: "unknown" };
  }
}
