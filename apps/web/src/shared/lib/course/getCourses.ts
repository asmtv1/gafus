"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";

import type { CourseWithExtras, CourseWithProgressData } from "@gafus/types";

import { getCurrentUserId } from "@/utils/getCurrentUserId";

export async function getCoursesWithProgress(): Promise<{ data: CourseWithProgressData[] }> {
  const userId = await getCurrentUserId();

  try {
    const allCourses: CourseWithExtras[] = await prisma.course.findMany({
      where: {
        OR: [{ isPrivate: false }, { access: { some: { userId } } }],
      },
      include: {
        author: {
          select: {
            username: true,
          },
        },
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profile: {
                  select: {
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
        favoritedBy: true,
        access: {
          include: {
            user: {
              select: { id: true },
            },
          },
        },
        userCourses: {
          include: {
            user: {
              include: {
                profile: {
                  select: {
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
        dayLinks: {
          include: {
            day: {
              include: {
                stepLinks: {
                  include: {
                    step: {
                      select: {
                        title: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
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

    const favoriteCourseIds = new Set(userFavorites.map((f: { courseId: string }) => f.courseId));

    const data: CourseWithProgressData[] = allCourses.map((course) => {
      const userCourse = userCourses.find((uc) => uc.courseId === course.id);

      // Правильно обрабатываем enum из Prisma
      const userStatus = userCourse?.status
        ? (userCourse.status as TrainingStatus)
        : TrainingStatus.NOT_STARTED;

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
        reviews: course.reviews.map((review: CourseWithExtras["reviews"][0]) => ({
          rating: review.rating ?? 0,
          comment: review.comment ?? "",
          createdAt: review.createdAt ? new Date(review.createdAt) : new Date(),
          user: {
            username: review.user.username,
            profile: review.user.profile,
          },
        })),
        access: course.access,
        userStatus,
        startedAt: userCourse?.startedAt ? new Date(userCourse.startedAt) : null,
        completedAt: userCourse?.completedAt ? new Date(userCourse.completedAt) : null,
        isFavorite: favoriteCourseIds.has(course.id),
        userCourses: course.userCourses.map((uc: CourseWithExtras["userCourses"][0]) => ({
          userId: uc.userId,
          status: uc.status as TrainingStatus,
          startedAt: uc.startedAt ? new Date(uc.startedAt) : null,
          completedAt: uc.completedAt ? new Date(uc.completedAt) : null,
          user: {
            username: uc.user.username,
            profile: uc.user.profile,
          },
        })),
        dayLinks: course.dayLinks.map((dl: CourseWithExtras["dayLinks"][0]) => ({
          order: dl.order,
          day: {
            id: dl.day.id,
            title: dl.day.title,
            stepLinks: dl.day.stepLinks.map(
              (sl: CourseWithExtras["dayLinks"][0]["day"]["stepLinks"][0]) => ({
                id: sl.id,
                order: sl.order,
                step: {
                  title: sl.step.title,
                },
              }),
            ),
          },
        })),
      };
    });

    return { data };
  } catch (error) {
    console.error("Ошибка в getCoursesWithProgress:", error);
    throw new Error("Не удалось загрузить курсы с прогрессом");
  }
}
