"use server";
import { prisma } from "@/shared/prisma";
import { getCurrentUserId } from "@/utils/getCurrentUserId";
import { TrainingStatus } from "@prisma/client";

export async function getCoursesWithProgress() {
  const userId = await getCurrentUserId();

  try {
    const allCourses = await prisma.course.findMany({
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
    const userFavorites = await prisma.favoriteCourse.findMany({
      where: { userId },
      select: { courseId: true },
    });
    const favoriteCourseIds = new Set(userFavorites.map((f) => f.courseId));
    console.log(userCourses);
    const data = allCourses.map((course) => {
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
        createdAt: course.createdAt,
        authorUsername: course.author.username,
        favoritedBy: course.favoritedBy,
        reviews: course.reviews,
        access: course.access,
        userStatus: userCourse?.status ?? TrainingStatus.NOT_STARTED,
        startedAt: userCourse?.startedAt ?? null,
        completedAt: userCourse?.completedAt ?? null,
        isFavorite: favoriteCourseIds.has(course.id),
      };
    });

    return { data };
  } catch (error) {
    console.error("Ошибка в getCoursesWithProgress:", error);
    throw new Error("Не удалось загрузить курсы с прогрессом");
  }
}
