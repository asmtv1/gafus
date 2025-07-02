"use server";

import { prisma } from "@gafus/prisma";
import { getCurrentUserId } from "@/utils/getCurrentUserId";
import { TrainingStatus } from "@gafus/types";
import type {
  Course,
  CourseAccess,
  CourseReview,
  FavoriteCourse,
} from "@prisma/client";

export type CourseWithUserData = {
  id: number;
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
};

export async function getFavoritesCourses(): Promise<{
  data: CourseWithUserData[];
}> {
  const userId = await getCurrentUserId();

  try {
    // Получаем ID избранных курсов текущего пользователя
    const userFavorites = await prisma.favoriteCourse.findMany({
      where: { userId },
      select: { courseId: true },
    });

    // courseId — число (Int)
    const favoriteCourseIds: number[] = userFavorites.map(
      (f: { courseId: number }) => f.courseId
    );

    // Получаем полные данные о курсах с связями
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

    // Получаем статус пользователя по курсам
    type UserCourseType = {
      courseId: number;
      status: TrainingStatus;
      startedAt: Date | null;
      completedAt: Date | null;
    };

    const userCourses = (await prisma.userCourse.findMany({
      where: { userId },
      select: {
        courseId: true,
        status: true,
        startedAt: true,
        completedAt: true,
      },
    })) as UserCourseType[];

    // Формируем окончательный массив с пользовательскими данными

    const data: CourseWithUserData[] = allCourses.map(
      (
        course: Course & {
          author: { username: string };
          favoritedBy: FavoriteCourse[];
          reviews: CourseReview[];
          access: CourseAccess[];
        }
      ) => {
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
          isFavorite: true,
        };
      }
    );

    return { data };
  } catch (error) {
    console.error("Ошибка в getFavoritesCourses:", error);
    throw new Error("Не удалось загрузить курсы с прогрессом");
  }
}
