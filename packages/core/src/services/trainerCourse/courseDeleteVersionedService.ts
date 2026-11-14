/**
 * Actor-scoped course deletion guarded by Course.version and a row lock.
 * CDN/media deletion is outside this DB-only operation.
 */
import { invalidateCourseContentCache } from "../training/trainingDayContent";
import { publishCourseContentChange } from "../training/trainingContentRevision";

export type DeleteVersionedResult =
  | { status: "deleted"; logoImg: string }
  | { status: "stale" | "not_found" | "invalid" | "unknown" };

const safeId = /^[a-zA-Z0-9_-]{1,128}$/;
/** Inject the DB transaction at an outer composition root; Core owns all
 * validation, cache invalidation and post-commit publication decisions. */
export function createCourseVersionedDeleter(
  deleteVersionedCourseRows: (
    id: string, expectedVersion: number,
    actor: {id: string; role: "TRAINER" | "ADMIN"},
  ) => Promise<DeleteVersionedResult>,
) {
  return async function deleteCourseVersioned(
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
    const outcome = await deleteVersionedCourseRows(id,expectedVersion,actor);
    if (outcome.status === "deleted") {
      invalidateCourseContentCache(id);
      await publishCourseContentChange();
    }
    return outcome;
  } catch {
    return { status: "unknown" };
  }
};

}
