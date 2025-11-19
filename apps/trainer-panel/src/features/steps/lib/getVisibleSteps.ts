"use server";

import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";

import type { AuthUser } from "@gafus/types";

export async function getVisibleSteps() {
  const session = await getServerSession(authOptions);
  const user = session?.user as AuthUser;

  if (!user) {
    throw new Error("Unauthorized: No session or user found.");
  }

  const { id: userId, role } = user;
  const isAdminOrModerator = ["ADMIN", "MODERATOR"].includes(role);

  const where = isAdminOrModerator
    ? undefined
    : { authorId: userId };

  return prisma.step.findMany({
    where,
    select: {
      id: true,
      title: true,
      description: true,
      durationSec: true,
      type: true,
      videoUrl: true,
      imageUrls: true,
      pdfUrls: true,
      checklist: true,
      authorId: true,
      createdAt: true,
      updatedAt: true,
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
          day: {
            include: {
              // Нам нужны названия дней, а также курсы, где этот день используется
              dayLinks: {
                include: {
                  course: {
                    select: {
                      id: true,
                      name: true,
                      shortDesc: true,
                      logoImg: true,
                    },
                  },
                },
              },
            },
            select: undefined,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
