/**
 * Global PostgreSQL Course.version CAS: database trigger is SOLE incrementer.
 * DO NOT run until the additive Course.version migration is applied.
 * Name-only: no full-form/day/access changes.
 */
import { prisma } from "@gafus/prisma";
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
): Promise<CourseVersionResult> {
  if (!idPattern.test(courseId) || !validActor(actor))
    return { status: "invalid" };
  try {
    const rows = actor.role === "ADMIN"
      ? await prisma.$queryRaw<VersionedName[]>`
          SELECT "id","name","version" FROM "Course" WHERE "id" = ${courseId}
        `
      : await prisma.$queryRaw<VersionedName[]>`
          SELECT "id","name","version" FROM "Course"
          WHERE "id" = ${courseId} AND "authorId" = ${actor.id}
        `;
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
): Promise<CourseVersionResult> {
  if (!input || !idPattern.test(input.courseId) ||
      typeof input.name !== "string" || input.name.length < 1 ||
      input.name.length > 500 || !isVersion(input.expectedVersion) ||
      !validActor(actor))
    return { status: "invalid" };
  let rows: VersionedName[];
  try {
    rows = actor.role === "ADMIN"
      ? await prisma.$queryRaw<VersionedName[]>`
          UPDATE "Course" SET "name" = ${input.name},
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${input.courseId} AND "version" = ${input.expectedVersion}
          RETURNING "id","name","version"
        `
      : await prisma.$queryRaw<VersionedName[]>`
          UPDATE "Course" SET "name" = ${input.name},
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${input.courseId} AND "authorId" = ${actor.id}
            AND "version" = ${input.expectedVersion}
          RETURNING "id","name","version"
        `;
  } catch {
    logger.error("COURSE_VERSION_WRITE_UNKNOWN");
    return { status: "unknown" };
  }
  if (rows.length === 0) {
    const lookup = await readCourseNameVersion(input.courseId, actor);
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
): Promise<CourseLogoVersionResult> {
  if (!input || !idPattern.test(input.courseId) ||
      !validActor(actor) || !isVersion(input.expectedVersion) ||
      typeof input.logoUrl !== "string" || input.logoUrl.length > 2000)
    return { status: "invalid" };
  try {
    return await prisma.$transaction(async tx => {
      const existing = actor.role === "ADMIN"
        ? await tx.$queryRaw<{ logoImg: string; version: number }[]>`
            SELECT "logoImg","version" FROM "Course"
            WHERE "id"=${input.courseId} FOR UPDATE
          `
        : await tx.$queryRaw<{ logoImg: string; version: number }[]>`
            SELECT "logoImg","version" FROM "Course"
            WHERE "id"=${input.courseId} AND "authorId"=${actor.id}
            FOR UPDATE
          `;
      if (existing.length === 0) return { status: "not_found" as const };
      if (existing.length !== 1 || !isVersion(existing[0]?.version))
        return { status: "unknown" as const };
      if (existing[0].version !== input.expectedVersion)
        return { status: "stale" as const };
      const updated = actor.role === "ADMIN"
        ? await tx.$queryRaw<{ version: number }[]>`
            UPDATE "Course"
            SET "logoImg"=${input.logoUrl}, "updatedAt"=CURRENT_TIMESTAMP
            WHERE "id"=${input.courseId}
              AND "version"=${input.expectedVersion}
            RETURNING "version"
          `
        : await tx.$queryRaw<{ version: number }[]>`
            UPDATE "Course"
            SET "logoImg"=${input.logoUrl}, "updatedAt"=CURRENT_TIMESTAMP
            WHERE "id"=${input.courseId} AND "authorId"=${actor.id}
              AND "version"=${input.expectedVersion}
            RETURNING "version"
          `;
      if (updated.length !== 1 || updated[0]?.version !== input.expectedVersion + 1)
        throw Error("UNEXPECTED_LOGO_VERSION");
      return {
        status: "updated" as const,
        data: {
          version: updated[0].version,
          previousLogoUrl: existing[0].logoImg || null,
        },
      };
    });
  } catch {
    logger.error("COURSE_LOGO_VERSION_UNKNOWN");
    return { status: "unknown" };
  }
}
