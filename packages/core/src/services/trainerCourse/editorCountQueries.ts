import { prisma } from "@gafus/prisma";

/** Exact bounded membership/count reads used by trainer author's HTTP ports.
 * Preserve legacy scope: only TRAINER is restricted; elevated ADMIN may edit
 * across owners. Final mutations still enforce authorization in Core.
 */
export function countOwnedTrainingDays(
  ids: string[], ownerId: string, elevated: boolean,
): Promise<number> {
  return prisma.trainingDay.count({
    where: { id: { in: ids }, ...(elevated ? {} : { authorId: ownerId }) },
  });
}
export function countOwnedTrainingSteps(
  ids: string[], ownerId: string, elevated: boolean,
): Promise<number> {
  return prisma.step.count({
    where: { id: { in: ids }, ...(elevated ? {} : { authorId: ownerId }) },
  });
}
export function countExistingCourseUsers(ids: string[]): Promise<number> {
  return prisma.user.count({ where: { id: { in: ids }, role: "USER" } });
}
export function countEditableCourseDays(ids: string[], actor: { id: string; role: "TRAINER" | "ADMIN" }): Promise<number> {
  return prisma.trainingDay.count({
    where: { id: { in: ids }, ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}) },
  });
}
export function countEditableDaySteps(ids: string[], actor: { id: string; role: "TRAINER" | "ADMIN" }): Promise<number> {
  return prisma.step.count({
    where: { id: { in: ids }, ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}) },
  });
}
