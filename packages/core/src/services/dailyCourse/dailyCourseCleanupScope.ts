/** Author-scoped selection used by BOTH cleanup preview and destructive cleanup.
 * Keep every WHERE predicate in one module to avoid accidentally broadening
 * rights when adding future cleanup modes. No SQL or mutations here.
 */
import type { Prisma } from "@gafus/prisma";
import type { DailyCourseActor, DailyCourseCleanupMode } from "./dailyCourseService";

const isElevated = (actor: DailyCourseActor) =>
  actor.role === "ADMIN" || actor.role === "MODERATOR";

function dateKeyToDate(dateKey: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("INVALID_DATE");
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function cleanupScheduleWhere(
  actor: DailyCourseActor,
  mode: DailyCourseCleanupMode,
  today: string,
): Prisma.DailyCourseScheduleWhereInput {
  return {
    ...(mode === "future" ? { date: { gt: dateKeyToDate(today) } } : {}),
    ...(isElevated(actor) ? {} : { bundle: { authorId: actor.id } }),
  };
}

export function cleanupBundleWhere(
  actor: DailyCourseActor,
  mode: DailyCourseCleanupMode,
  scheduleIds: string[],
): Prisma.DailyCourseBundleWhereInput {
  return {
    ...(isElevated(actor) ? {} : { authorId: actor.id }),
    ...(mode === "future" ? { schedules: { some: { id: { in: scheduleIds } } } } : {}),
  };
}

export function cleanupAllDailyCourseStepWhere(actor: DailyCourseActor): Prisma.StepWhereInput {
  return {
    isDailyCourse: true,
    ...(isElevated(actor) ? {} : { authorId: actor.id }),
  };
}

export function cleanupLinkedDailyCourseStepWhere(
  actor: DailyCourseActor,
  linkedStepIds: string[],
): Prisma.StepWhereInput {
  return {
    id: { in: linkedStepIds },
    isDailyCourse: true,
    ...(isElevated(actor) ? {} : { authorId: actor.id }),
  };
}

export function scopedScheduleIdWhere(
  actor: DailyCourseActor,
  scheduleIds: string[],
): Prisma.DailyCourseScheduleWhereInput {
  return {
    id: { in: scheduleIds },
    ...(isElevated(actor) ? {} : { bundle: { authorId: actor.id } }),
  };
}

export function scopedBundleIdWhere(
  actor: DailyCourseActor,
  bundleIds: string[],
): Prisma.DailyCourseBundleWhereInput {
  return {
    id: { in: bundleIds },
    ...(isElevated(actor) ? {} : { authorId: actor.id }),
  };
}

export function scopedSafeDailyCourseStepIdWhere(
  actor: DailyCourseActor,
  stepIds: string[],
): Prisma.StepWhereInput {
  return {
    id: { in: stepIds },
    isDailyCourse: true,
    ...(isElevated(actor) ? {} : { authorId: actor.id }),
    stepLinks: { none: {} },
  };
}
