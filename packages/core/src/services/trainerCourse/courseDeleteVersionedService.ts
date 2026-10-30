/**
 * Actor-scoped course deletion guarded by Course.version and a row lock.
 * CDN/media deletion is outside this DB-only operation.
 */
import { prisma } from "@gafus/prisma";
import { invalidateCourseContentCache } from "../training/trainingDayContent";
import { publishCourseContentChange } from "../training/trainingContentRevision";

export type DeleteVersionedResult =
  | { status: "deleted"; logoImg: string }
  | { status: "stale" | "not_found" | "invalid" | "unknown" };

const safeId = /^[a-zA-Z0-9_-]{1,128}$/;
export async function deleteCourseVersioned(
  id: string,
  expectedVersion: number,
  actor: { id: string; role: "TRAINER" | "ADMIN" },
): Promise<DeleteVersionedResult> {
  if (!safeId.test(id) || !actor || !safeId.test(actor.id) ||
    (actor.role !== "TRAINER" && actor.role !== "ADMIN") ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1 || expectedVersion > 2147483647)
    return { status: "invalid" };
  try {
    const outcome = await prisma.$transaction(async tx => {
      // Row lock protects version and ownership until dependent rows are removed.
      const rows = actor.role === "ADMIN"
        ? await tx.$queryRaw<{ id: string; version: number; logoImg: string }[]>`
            SELECT "id", "version", "logoImg" FROM "Course"
            WHERE "id" = ${id} FOR UPDATE
          `
        : await tx.$queryRaw<{ id: string; version: number; logoImg: string }[]>`
            SELECT "id", "version", "logoImg" FROM "Course"
            WHERE "id" = ${id} AND "authorId" = ${actor.id} FOR UPDATE
          `;
      if (rows.length === 0) return { status: "not_found" as const };
      if (rows.length !== 1 || rows[0]?.id !== id ||
        !Number.isSafeInteger(rows[0].version))
        throw Error("UNEXPECTED_COURSE_VERSION");
      if (rows[0].version !== expectedVersion) return { status: "stale" as const };
      // Preserve Next dependency order within one atomic transaction.
      await tx.courseAccess.deleteMany({ where: { courseId: id } });
      await tx.favoriteCourse.deleteMany({ where: { courseId: id } });
      await tx.courseReview.deleteMany({ where: { courseId: id } });
      await tx.userCourse.deleteMany({ where: { courseId: id } });
      await tx.dayOnCourse.deleteMany({ where: { courseId: id } });
      const deleted = await tx.course.deleteMany({
        where: { id, ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}) },
      });
      if (deleted.count !== 1) throw Error("COURSE_DELETE_RACE");
      return { status: "deleted" as const, logoImg: rows[0].logoImg };
    }, { maxWait: 10_000, timeout: 20_000 });
    if (outcome.status === "deleted") {
      invalidateCourseContentCache(id);
      await publishCourseContentChange();
    }
    return outcome;
  } catch {
    return { status: "unknown" };
  }
}
