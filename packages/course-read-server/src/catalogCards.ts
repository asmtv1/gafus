import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";

export interface CatalogCursor {
  createdAt: Date;
  id: string;
}

export async function readCatalogCardPage(userId: string, cursor?: CatalogCursor) {
  const membership = { where: { userId }, select: { userId: true } };
  const pageSize = 60;
  const rows = await prisma.course.findMany({
    where: {
      OR: [{ isPrivate: false }, { access: { some: { userId } } }],
      ...(cursor && { AND: [{ OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ] }] }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    select: {
      id: true, name: true, type: true, description: true, shortDesc: true, duration: true,
      equipment: true, updatedAt: true,
      author: { select: { username: true, profile: { select: { avatarUrl: true } } } },
      logoImg: true, avgRating: true, trainingLevel: true, createdAt: true,
      isPaid: true, isPrivate: true, access: membership, favoritedBy: membership,
      userCourses: { where: { userId }, select: { status: true, startedAt: true, completedAt: true } },
      _count: { select: { reviews: true, userCourses: {
        where: { status: { in: [TrainingStatus.IN_PROGRESS, TrainingStatus.COMPLETED] } },
      } } },
    },
  });
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  return { items, next: rows.length > pageSize ? { id: last.id, createdAt: last.createdAt } : null };
}
