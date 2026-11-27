/**
 * Read-only SQL projections for the legacy public course catalog.
 * Caller owns access/visibility policy and response projection.
 * Never return unscoped member progress or private course memberships.
 */
import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import type { Prisma } from "@gafus/prisma";

const courseSelect = {
  id: true,
  name: true,
  type: true,
  description: true,
  shortDesc: true,
  duration: true,
  logoImg: true,
  isPrivate: true,
  isPaid: true,
  avgRating: true,
  trainingLevel: true,
  equipment: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      username: true,
      profile: { select: { avatarUrl: true } },
    },
  },
  reviews: {
    select: {
      rating: true,
      comment: true,
      createdAt: true,
      user: {
        select: {
          username: true,
          profile: { select: { avatarUrl: true } },
        },
      },
    },
  },
  _count: {
    select: {
      userCourses: {
        where: { status: { in: [TrainingStatus.IN_PROGRESS, TrainingStatus.COMPLETED] } },
      },
    },
  },
  dayLinks: {
    select: {
      id: true,
      order: true,
      day: {
        select: {
          id: true,
          title: true,
          stepLinks: {
            select: {
              id: true,
              order: true,
              step: { select: { title: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CourseSelect;


export async function readCatalogCourseRows(userId?: string) {
  return prisma.course.findMany({
    where: userId ? { OR: [{ isPrivate: false }, { access: { some: { userId } } }] } : { isPrivate: false },
    select: {
      ...courseSelect,
      // The catalog only needs the current viewer's entitlement. Selecting all
      // CourseAccess rows leaks member identifiers and scales with every buyer.
      // Membership is personal. Do not select or serialize other users' favorite rows.
      favoritedBy: {
        where: { userId: userId ?? "" },
        select: { userId: true },
      },
      access: {
        where: { userId: userId ?? "" },
        select: { userId: true },
      },
    },
  });

}

export async function readCatalogProgressRows(userId?: string) {
  return userId
    ? await prisma.userCourse.findMany({
        where: { userId },
        select: {
          courseId: true,
          status: true,
          startedAt: true,
          completedAt: true,
        },
      })
    : [];

}

export async function readCatalogFavoriteRows(userId?: string) {
  return userId
    ? await prisma.favoriteCourse.findMany({
        where: { userId },
        select: { courseId: true },
      })
    : [];
}

export async function readCourseAccessByType(courseType: string) {
  return await prisma.course.findUnique({
    where: { type: courseType },
    select: { id: true, isPrivate: true, isPaid: true },
  });
}

export async function readCourseAccessById(courseId: string) {
  return await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, isPrivate: true, isPaid: true },
  });
}

export async function readCourseMetadataRow(courseType: string) {
  return await prisma.course.findFirst({
    where: { type: courseType },
    select: {
      id: true,
      name: true,
      shortDesc: true,
      logoImg: true,
      description: true,
      isPaid: true,
      isPrivate: true,
      videoUrl: true,
      equipment: true,
      trainingLevel: true,
    },
  });
}

export async function readCourseOutlineRow(courseType: string) {
  return await prisma.course.findFirst({
    where: { type: courseType },
    select: {
      dayLinks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          day: { select: { title: true, type: true, equipment: true,
            stepLinks: { select: { step: { select: {
              type: true, durationSec: true, estimatedDurationSec: true,
            } } } },
          } },
        },
      },
    },
  });
}
