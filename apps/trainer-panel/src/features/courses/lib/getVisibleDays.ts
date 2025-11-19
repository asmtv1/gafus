"use server";

import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";

export async function getVisibleDays() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return [];

  const userId = session.user.id;
  const role = session.user.role;
  const isAdminOrModerator = ["ADMIN", "MODERATOR"].includes(role);

  const days = await prisma.trainingDay.findMany({
    where: isAdminOrModerator ? {} : { authorId: userId },
    include: {
      author: {
        select: {
          username: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
      stepLinks: {
        include: {
          step: {
            select: { id: true, title: true },
          },
        },
        orderBy: { order: "asc" },
      },
      dayLinks: {
        include: {
          course: {
            select: { id: true, name: true },
          },
        },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return days;
}
