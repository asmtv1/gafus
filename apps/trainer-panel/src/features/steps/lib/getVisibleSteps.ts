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
    : {
        OR: [
          { authorId: userId },
          {
            stepLinks: {
              some: {
                day: {
                  dayLinks: {
                    some: {
                      course: {
                        userCourses: {
                          some: {
                            userId: userId,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

  return prisma.step.findMany({
    where,
    include: {
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
