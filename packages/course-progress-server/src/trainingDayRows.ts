/**
 * Training-day persistence boundary. No HTTP/Next/cache/event delivery here.
 * Trainer ownership and step ownership are checked inside the *same* DB
 * transaction as the mutation, preventing check-then-write races.
 */
import { prisma } from "@gafus/prisma";

export type TrainingDayMutationActor = { id: string; role: "TRAINER" | "ADMIN" };
export interface TrainingDayCreateRowsInput {
  title: string;
  description?: string;
  type?: string;
  equipment?: string;
  showCoursePathExport?: boolean;
  shareProgressAcrossCourses?: boolean;
  stepIds: string[];
  authorId: string;
}
export interface TrainingDayUpdateRowsInput extends Omit<TrainingDayCreateRowsInput, "authorId"> {
  id: string;
}

const visibleDaysInclude = {
  author: { select: { username: true, profile: { select: { fullName: true } } } },
  stepLinks: {
    include: { step: { select: { id: true, title: true } } },
    orderBy: { order: "asc" as const },
  },
  dayLinks: {
    include: { course: { select: { id: true, name: true } } },
    orderBy: { order: "asc" as const },
  },
} as const;

export function readTrainingDayForEdit(id: string, actor?: TrainingDayMutationActor) {
  return prisma.trainingDay.findUnique({
    where: { id, ...(actor?.role === "TRAINER" ? { authorId: actor.id } : {}) },
    include: { stepLinks: { orderBy: { order: "asc" } } },
  });
}

export async function insertTrainingDay(
  input: TrainingDayCreateRowsInput, actor?: TrainingDayMutationActor,
) {
  if (actor && (actor.id !== input.authorId || !actor.id || !["ADMIN", "TRAINER"].includes(actor.role)))
    throw Error("DAY_AUTHOR_MISMATCH");
  const create = (tx: Pick<typeof prisma, "trainingDay">) => tx.trainingDay.create({
    data: {
      title: input.title,
      description: input.description ?? "",
      type: input.type ?? "regular",
      equipment: input.equipment ?? "",
      showCoursePathExport: input.showCoursePathExport ?? false,
      shareProgressAcrossCourses: input.shareProgressAcrossCourses ?? false,
      authorId: input.authorId,
      stepLinks: {
        create: input.stepIds.map((stepId, index) => ({ stepId, order: index + 1 })),
      },
    },
  });
  if (!actor) return create(prisma); // trusted legacy admin use, retained for compatibility
  return prisma.$transaction(async tx => {
    const ids = [...new Set(input.stepIds)];
    const count = await tx.step.count({
      where: { id: { in: ids },
        ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}) },
    });
    if (count !== ids.length) throw Error("STEP_OWNER_MISMATCH");
    return create(tx as typeof prisma);
  });
}

export async function replaceTrainingDay(input: TrainingDayUpdateRowsInput, actor?: TrainingDayMutationActor) {
  const where = { id: input.id, ...(actor?.role === "TRAINER" ? { authorId: actor.id } : {}) };
  const data = {
    title: input.title,
    description: input.description ?? "",
    type: input.type ?? "regular",
    equipment: input.equipment ?? "",
    showCoursePathExport: input.showCoursePathExport ?? false,
    shareProgressAcrossCourses: input.shareProgressAcrossCourses ?? false,
    stepLinks: {
      deleteMany: {},
      create: input.stepIds.map((stepId, index) => ({ stepId, order: index })),
    },
  };
  if (!actor) return prisma.trainingDay.update({ where, data });
  return prisma.$transaction(async tx => {
    const distinctStepIds = [...new Set(input.stepIds)];
    const count = await tx.step.count({
      where: { id: { in: distinctStepIds },
        ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}) },
    });
    if (count !== distinctStepIds.length) throw Error("STEP_OWNER_MISMATCH");
    return tx.trainingDay.update({ where, data });
  });
}

/** Duplicate IDs fail closed. Non-actor legacy writes preserve existing
 *  compatibility; actor writes require an atomic ownership check. */
export async function deleteTrainingDayRows(
  dayIds: string[], actor?: TrainingDayMutationActor,
): Promise<{ courseIds: string[]; deletedDayIds: string[] } | null> {
  if (actor) {
    const ids = [...new Set(dayIds)];
    if (ids.length !== dayIds.length) return null;
    const where = { id: { in: ids },
      ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}) };
    const courseIds = await prisma.$transaction(async tx => {
      const authorized = await tx.trainingDay.findMany({ where, select: { id: true } });
      if (authorized.length !== ids.length) throw Error("DAY_NOT_FOUND");
      const attached = await tx.dayOnCourse.findMany({
        where: { dayId: { in: ids } }, select: { courseId: true },
      });
      await tx.dayOnCourse.deleteMany({ where: { dayId: { in: ids } } });
      const deleted = await tx.trainingDay.deleteMany({ where });
      if (deleted.count !== ids.length) throw Error("DAY_DELETE_RACE");
      return [...new Set(attached.map(link => link.courseId))];
    });
    return { courseIds, deletedDayIds: ids };
  }

  // Backward-compatible trusted legacy admin path; preserve transaction-array
  // semantics while all route-level actor authentication is migrated.
  const attached = await prisma.dayOnCourse.findMany({
    where: { dayId: { in: dayIds } }, select: { courseId: true },
  });
  const courseIds = [...new Set(attached.map(link => link.courseId))];
  await prisma.$transaction([
    prisma.dayOnCourse.deleteMany({ where: { dayId: { in: dayIds } } }),
    prisma.trainingDay.deleteMany({ where: { id: { in: dayIds } } }),
  ]);
  return { courseIds, deletedDayIds: dayIds };
}

export function listVisibleTrainingDays(authorId: string | null, isAdminOrModerator: boolean) {
  const where = isAdminOrModerator ? {} : { authorId: authorId! };
  return prisma.trainingDay.findMany({
    where, include: visibleDaysInclude, orderBy: { createdAt: "desc" },
  });
}
