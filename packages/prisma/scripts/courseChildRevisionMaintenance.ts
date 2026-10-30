/**
 * Seed-owned DayOnCourse insertion with one parent Course revision touch.
 * Trusted maintenance only. Locks parents in stable course-ID order,
 * then inserts child links in the SAME Prisma transaction.
 * Not a trainer-facing CAS and never invoked for user-edit paths.
 */
import type { PrismaClient } from "@prisma/client";

export type SeedDayLink = { courseId: string; dayId: string; order: number };
const safeId = /^[A-Za-z0-9_-]{1,128}$/;

export async function insertSeedCourseDaysVersioned(
  client: PrismaClient, links: readonly SeedDayLink[],
): Promise<void> {
  if (links.length === 0) return;
  const occupied = new Set<string>();
  for (const link of links) {
    if (!safeId.test(link.courseId) || !safeId.test(link.dayId) ||
        !Number.isSafeInteger(link.order) || link.order < 0)
      throw Error("INVALID_SEED_COURSE_DAY");
    const key = link.courseId + "#" + link.order;
    if (occupied.has(key)) throw Error("DUPLICATE_SEED_COURSE_ORDER");
    occupied.add(key);
  }
  const courseIds = [...new Set(links.map(link => link.courseId))].sort();
  await client.$transaction(async tx => {
    // Stable parent row-lock order prevents cross-course deadlock cycles.
    // DB BEFORE UPDATE trigger advances EACH affected Course exactly ONCE
    // despite any number of inserted child links.
    for (const courseId of courseIds) {
      const count = await tx.$executeRaw`
        UPDATE "Course" SET "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${courseId}
      `;
      if (count !== 1) throw Error("SEED_COURSE_NOT_FOUND");
    }
    await tx.dayOnCourse.createMany({ data: [...links] });
  }, { maxWait: 10000, timeout: 20000 });
}
