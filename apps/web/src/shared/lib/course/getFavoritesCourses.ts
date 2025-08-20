"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";

import type { CourseAccess, CourseReview, FavoriteCourse } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";

export interface CourseWithUserData {
  id: string;
  name: string;
  type: string;
  description: string;
  shortDesc: string;
  duration: string;
  logoImg: string;
  isPrivate: boolean;
  avgRating: number | null;
  createdAt: Date;
  authorUsername: string;
  favoritedBy: FavoriteCourse[];
  reviews: CourseReview[];
  access: CourseAccess[];
  userStatus: TrainingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  isFavorite: boolean;
}

export async function getFavoritesCourses(): Promise<{
  data: CourseWithUserData[];
  favoriteIds: string[];
}> {
  const userId = await getCurrentUserId();

  try {
    const userFavorites = await prisma.favoriteCourse.findMany({
      where: { userId },
      select: { courseId: true },
    });

    const favoriteCourseIds: string[] = userFavorites.map((f) => f.courseId);

    const allCourses = await prisma.course.findMany({
      where: {
        id: { in: favoriteCourseIds },
      },
      include: {
        author: {
          select: {
            username: true,
          },
        },
        reviews: true,
        favoritedBy: true,
        access: true,
      },
    });

    const userCourses = await prisma.userCourse.findMany({
      where: { userId },
      select: {
        courseId: true,
        status: true,
        startedAt: true,
        completedAt: true,
      },
    });

    const data: CourseWithUserData[] = allCourses.map((course) => {
      const userCourse = userCourses.find((uc) => uc.courseId === course.id);

      return {
        id: course.id,
        name: course.name,
        type: course.type,
        description: course.description,
        shortDesc: course.shortDesc,
        duration: course.duration,
        logoImg: course.logoImg,
        isPrivate: course.isPrivate,
        avgRating: course.avgRating,
        createdAt: course.createdAt ? new Date(course.createdAt) : new Date(),
        authorUsername: course.author.username,
        favoritedBy: course.favoritedBy,
        reviews: course.reviews,
        access: course.access,
        userStatus: (userCourse?.status ?? TrainingStatus.NOT_STARTED) as TrainingStatus,
        startedAt: userCourse?.startedAt ? new Date(userCourse.startedAt) : null,
        completedAt: userCourse?.completedAt ? new Date(userCourse.completedAt) : null,
        isFavorite: true,
      };
    });

    return {
      data,
      favoriteIds: favoriteCourseIds,
    };
  } catch (error) {
    console.error("Ошибка в getFavoritesCourses:", error);
    throw new Error("Не удалось загрузить избранные курсы");
  }
}
