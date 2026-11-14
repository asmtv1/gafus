import { prisma } from "@gafus/prisma";

/** Administrative course-content invalidation. Owner row lock prevents a
 * demoted staff member from invalidating caches with an old JWT. Revisions
 * remain serialized by PostgreSQL in the same transaction as the ACL read.
 */
export async function refreshCourseContentRevision(actorId: string): Promise<string | null> {
  const rows = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
    const actor = await tx.user.findUnique({
      where: { id: actorId }, select: { role: true },
    });
    if (actor?.role !== "ADMIN" && actor?.role !== "MODERATOR") {
      throw new Error("FORBIDDEN");
    }
    return tx.$queryRaw<{ revision: bigint }[]>`
      UPDATE "CourseContentRevision" SET "revision" = "revision" + 1
      WHERE "id" = 1 RETURNING "revision"
    `;
  });
  if (rows.length !== 1 || typeof rows[0]?.revision !== "bigint") return null;
  return rows[0].revision.toString();
}
