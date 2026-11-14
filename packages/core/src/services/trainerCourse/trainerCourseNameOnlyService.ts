/**
 * TR012 option A: isolated Core source/mock name-only CAS, NOT an API write.
 * Requires a separate authenticated revision read, still blocked.
 * No retry after UNKNOWN, and never use destructive full-form updateCourse.
 */
import { z } from "zod/v3";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("trainer-course-name-only");
const revisionPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const nameOnlyInput = z.object({
  courseId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  name: z.string().min(1).max(500),
  observedUpdatedAt: z.string().regex(revisionPattern),
}).strict();

export type TrainerCourseNameWriteStatus =
  | "updated" | "not_found" | "stale" | "unknown" | "invalid";

/** Caller must supply a server-verified actor, never a client-provided role. */
export interface TrainerCourseNameOnlyActor {
  id: string;
  role: string;
}

export interface TrainerCourseNameOnlyInput {
  courseId: string;
  name: string;
  observedUpdatedAt: string;
}

export type TrainerCourseNameOnlyResult = { status: TrainerCourseNameWriteStatus };

/** Explicit persistence + postcommit publication ports. No live CAS route is
 * enabled until the separate all-writers/migration proof is approved. */
export interface TrainerCourseNameOnlyPorts {
  writeObservedCas(where: { id: string; authorId?: string; updatedAt: Date },
    name: string, newUpdatedAt: Date): Promise<{ count: number }>;
  readObservedRevision(courseId: string, authorId?: string): Promise<{
    updatedAt: Date;
  } | null>;
  invalidateCache(courseId: string): void;
  publishContentChange(): Promise<void>;
}

export function createTrainerCourseNameOnlyService(ports: TrainerCourseNameOnlyPorts) {
/**
 * Actor ownership and observed revision are in the SAME Prisma CAS predicate.
 * Advances timestamp at least 1 ms even if Date.now has not advanced.
 * Old full-form writers may still collide: real DB and all-writers proof gated.
 */
async function updateTrainerCourseNameOnly(
  input: TrainerCourseNameOnlyInput,
  actor: TrainerCourseNameOnlyActor,
): Promise<TrainerCourseNameOnlyResult> {
  const parsed = nameOnlyInput.safeParse(input);
  if (!parsed.success || !actor || typeof actor.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(actor.id)) return { status: "invalid" };
  if (actor.role !== "TRAINER" && actor.role !== "ADMIN") {
    return { status: "not_found" };
  }
  const observed = new Date(parsed.data.observedUpdatedAt);
  if (!Number.isFinite(observed.getTime()) ||
      observed.toISOString() !== parsed.data.observedUpdatedAt) {
    return { status: "invalid" };
  }
  const nextTime = Math.max(Date.now(), observed.getTime() + 1);
  if (!Number.isFinite(nextTime) || nextTime > 8.64e15) {
    return { status: "invalid" };
  }
  const where = {
    id: parsed.data.courseId,
    ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}),
    updatedAt: observed,
  };
  let count: number;
  try {
    const result = await ports.writeObservedCas(where,parsed.data.name,new Date(nextTime));
    count = result.count;
  } catch {
    logger.error("TRAINER_COURSE_NAME_WRITE_UNKNOWN");
    return { status: "unknown" };
  }

  if (count !== 1) {
    if (count !== 0) return { status: "unknown" };
    try {
      const found = await ports.readObservedRevision(parsed.data.courseId,actor.role === "TRAINER" ? actor.id : undefined);
      if (!found) return { status: "not_found" };
      // A matching revision after count0 is ambiguous, not provably stale.
      return { status: found.updatedAt.getTime() === observed.getTime()
        ? "unknown" : "stale" };
    } catch {
      logger.error("TRAINER_COURSE_NAME_REVISION_LOOKUP_UNKNOWN");
      return { status: "unknown" };
    }
  }

  // Commit already happened; failed publication is UNKNOWN, never "failed".
  try {
    ports.invalidateCache(parsed.data.courseId);
    await ports.publishContentChange();
    return { status: "updated" };
  } catch {
    logger.error("TRAINER_COURSE_NAME_PUBLICATION_UNKNOWN");
    return { status: "unknown" };
  }
}

  return { updateTrainerCourseNameOnly };
}
