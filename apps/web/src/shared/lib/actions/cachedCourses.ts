"use server";

import { unstable_cache } from "next/cache";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { reportErrorToDashboard } from "../actions/reportError";
import { getAuthoredCourses } from "../course/getAuthoredCourses";
import { getCoursesWithProgress } from "../course/getCourses";
import { getFavoritesCourses } from "../course/getFavoritesCourses";
import { getTrainingDays } from "../training/getTrainingDays";

// Типы для прогресса пользователя
interface UserCourseProgress {
  courseId: string;
  status: TrainingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
}

interface UserProgressData {
  userCourses: UserCourseProgress[];
  favoriteCourseIds: string[];
}

// Базовый список всех курсов (постоянное кэширование)
// ВАЖНО: Эта функция кэширует ВСЕ курсы (публичные + приватные) без пользовательских данных
export const getAllCoursesCached = unstable_cache(
  async () => {
    try {
      console.warn("[React Cache] Fetching all courses (permanent cache)");
      
      // Получаем ВСЕ курсы (публичные + приватные) без пользовательских данных
      const allCourses = await prisma.course.findMany({
        include: {
          author: { select: { username: true } },
          reviews: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  profile: { select: { avatarUrl: true } },
                },
              },
            },
          },
          access: {
            include: {
              user: {
                select: { id: true },
              },
            },
          },
          dayLinks: {
            include: {
              day: {
                include: {
                  stepLinks: {
                    include: {
                      step: { select: { title: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const data = allCourses.map((course) => ({
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
        reviews: course.reviews.map((review) => ({
          rating: review.rating ?? 0,
          comment: review.comment ?? "",
          createdAt: review.createdAt ? new Date(review.createdAt) : new Date(),
          user: {
            username: review.user.username,
            profile: review.user.profile,
          },
        })),
        access: course.access,
        dayLinks: course.dayLinks.map((dl) => ({
          order: dl.order,
          day: {
            id: dl.day.id,
            title: dl.day.title,
            stepLinks: dl.day.stepLinks.map((sl) => ({
              id: sl.id,
              order: sl.order,
              step: { title: sl.step.title },
            })),
          },
        })),
      }));

      console.warn(`[React Cache] Cached ${data.length} courses (public + private) permanently`);
      return { success: true, data };
    } catch (error) {
      console.error("❌ Error in getAllCoursesCached:", error);

      await reportErrorToDashboard({
        message:
          error instanceof Error ? error.message : "Unknown error in getAllCoursesCached",
        stack: error instanceof Error ? error.stack : undefined,
        appName: "web",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "getAllCoursesCached",
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        tags: ["courses", "cache", "server-action"],
      });

      return { success: false, error: "Что-то пошло не так при получении курсов" };
    }
  },
  ["courses-all-permanent"],
  {
    revalidate: false, // Постоянное кэширование - инвалидируется только вручную
    tags: ["courses", "courses-all-permanent"],
  },
);

// Кэшированная версия получения только прогресса пользователя по курсам
export async function getUserCoursesProgressCached(userId?: string) {
  const cachedFunction = unstable_cache(
    async () => {
      try {
        console.warn("[React Cache] Fetching user courses progress for user:", userId);
        
        if (!userId) {
          return { success: true, data: [] };
        }

        // Получаем только прогресс пользователя по курсам
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

        const data: UserCourseProgress[] = userCourses.map((uc) => ({
          courseId: uc.courseId,
          status: uc.status as TrainingStatus,
          startedAt: uc.startedAt ? new Date(uc.startedAt) : null,
          completedAt: uc.completedAt ? new Date(uc.completedAt) : null,
        }));

        const favorites = Array.from(favoriteCourseIds);

        console.warn(`[React Cache] Cached progress for ${data.length} courses and ${favorites.length} favorites for user:`, userId);
        return { 
          success: true, 
          data: {
            userCourses: data,
            favoriteCourseIds: favorites,
          } as UserProgressData
        };
      } catch (error) {
        console.error("❌ Error in getUserCoursesProgressCached:", error);

        await reportErrorToDashboard({
          message:
            error instanceof Error ? error.message : "Unknown error in getUserCoursesProgressCached",
          stack: error instanceof Error ? error.stack : undefined,
          appName: "web",
          environment: process.env.NODE_ENV || "development",
          additionalContext: {
            action: "getUserCoursesProgressCached",
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            userId,
          },
          tags: ["courses", "cache", "server-action"],
        });

        return { success: false, error: "Что-то пошло не так при получении прогресса курсов" };
      }
    },
    ["user-courses-progress", userId || "anonymous"], // Включаем userId в ключ кэша
    {
      revalidate: false, // НЕ инвалидируется по времени - только вручную при изменении прогресса
      tags: ["courses", "user-progress", `user-${userId || "anonymous"}`], // Включаем userId в теги
    },
  );

  return await cachedFunction();
}

// Кэшированная версия получения всех курсов с прогрессом пользователя (для обратной совместимости)
export async function getCoursesWithProgressCached(userId?: string) {
  const cachedFunction = unstable_cache(
    async () => {
      try {
        console.warn("[React Cache] Fetching all courses with progress for user:", userId);
        const result = await getCoursesWithProgress(userId);
        console.warn(`[React Cache] Cached ${result.data.length} courses successfully for user:`, userId);
        return { success: true, data: result.data };
      } catch (error) {
        console.error("❌ Error in getCoursesWithProgressCached:", error);

        await reportErrorToDashboard({
          message:
            error instanceof Error ? error.message : "Unknown error in getCoursesWithProgressCached",
          stack: error instanceof Error ? error.stack : undefined,
          appName: "web",
          environment: process.env.NODE_ENV || "development",
          additionalContext: {
            action: "getCoursesWithProgressCached",
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            userId,
          },
          tags: ["courses", "cache", "server-action"],
        });

        return { success: false, error: "Что-то пошло не так при получении курсов" };
      }
    },
    ["courses-all", userId || "anonymous"], // Включаем userId в ключ кэша
    {
      revalidate: 60, // 60 секунд - синхронизируем с revalidate страницы
      tags: ["courses", "courses-all", `user-${userId || "anonymous"}`], // Включаем userId в теги
    },
  );

  return await cachedFunction();
}

// Функция для объединения всех курсов с прогрессом пользователя
export async function getCoursesWithUserProgressCached(userId?: string) {
  try {
    console.warn("[React Cache] Combining all courses with user progress for user:", userId);
    
    // Получаем все курсы (из постоянного кэша)
    const allCoursesResult = await getAllCoursesCached();
    if (!allCoursesResult.success) {
      return allCoursesResult;
    }

    // Получаем прогресс пользователя
    const userProgressResult = await getUserCoursesProgressCached(userId);
    if (!userProgressResult.success) {
      return userProgressResult;
    }

    const allCourses = allCoursesResult.data;
    const userProgress = userProgressResult.data as UserProgressData;

    if (!allCourses) {
      return { success: false, error: "Не удалось получить список курсов" };
    }

    // Создаем мапы для быстрого поиска
    const userCoursesMap = new Map(
      userProgress.userCourses.map((uc) => [uc.courseId, uc])
    );
    const favoriteCourseIds = new Set(userProgress.favoriteCourseIds);

    // Фильтруем курсы по доступу пользователя
    const accessibleCourses = allCourses.filter((course) => {
      // Публичные курсы доступны всем
      if (!course.isPrivate) {
        return true;
      }
      
      // Приватные курсы доступны только пользователям с доступом
      if (userId && course.access) {
        return course.access.some((access) => access.user.id === userId);
      }
      
      return false;
    });

    // Объединяем курсы с прогрессом пользователя
    const coursesWithProgress = accessibleCourses.map((course) => {
      const userCourse = userCoursesMap.get(course.id);
      
      return {
        ...course,
        userStatus: userCourse?.status || TrainingStatus.NOT_STARTED,
        startedAt: userCourse?.startedAt || null,
        completedAt: userCourse?.completedAt || null,
        isFavorite: favoriteCourseIds.has(course.id),
        // Убираем access из результата, так как он не нужен клиенту
        access: undefined,
      };
    });

    console.warn(`[React Cache] Combined ${coursesWithProgress.length} accessible courses with user progress`);
    return { success: true, data: coursesWithProgress };
  } catch (error) {
    console.error("❌ Error in getCoursesWithUserProgressCached:", error);

    await reportErrorToDashboard({
      message:
        error instanceof Error ? error.message : "Unknown error in getCoursesWithUserProgressCached",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "getCoursesWithUserProgressCached",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        userId,
      },
      tags: ["courses", "cache", "server-action"],
    });

    return { success: false, error: "Что-то пошло не так при получении курсов с прогрессом" };
  }
}

// Кэшированная версия получения избранных курсов
export const getFavoritesCoursesCached = unstable_cache(
  async (userId?: string) => {
    try {
      console.warn("[React Cache] Fetching favorite courses");
      const result = await getFavoritesCourses(userId);
      console.warn(`[React Cache] Cached ${result.data.length} favorite courses successfully`);
      return { success: true, data: result.data };
    } catch (error) {
      console.error("❌ Error in getFavoritesCoursesCached:", error);

      await reportErrorToDashboard({
        message:
          error instanceof Error ? error.message : "Unknown error in getFavoritesCoursesCached",
        stack: error instanceof Error ? error.stack : undefined,
        appName: "web",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "getFavoritesCoursesCached",
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        tags: ["courses", "favorites", "cache", "server-action"],
      });

      return { success: false, error: "Что-то пошло не так при получении избранных курсов" };
    }
  },
  ["courses-favorites"],
  {
    revalidate: 60, // 60 секунд - синхронизируем с revalidate страницы
    tags: ["courses", "courses-favorites"],
  },
);

// Кэшированная версия получения созданных курсов
export const getAuthoredCoursesCached = unstable_cache(
  async () => {
    try {
      console.warn("[React Cache] Fetching authored courses");
      const result = await getAuthoredCourses();
      console.warn(`[React Cache] Cached ${result.length} authored courses successfully`);
      return { success: true, data: result };
    } catch (error) {
      console.error("❌ Error in getAuthoredCoursesCached:", error);

      await reportErrorToDashboard({
        message:
          error instanceof Error ? error.message : "Unknown error in getAuthoredCoursesCached",
        stack: error instanceof Error ? error.stack : undefined,
        appName: "web",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "getAuthoredCoursesCached",
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        tags: ["courses", "authored", "cache", "server-action"],
      });

      return { success: false, error: "Что-то пошло не так при получении созданных курсов" };
    }
  },
  ["courses-authored"],
  {
    revalidate: 60, // 60 секунд - синхронизируем с revalidate страницы
    tags: ["courses", "courses-authored"],
  },
);

// Кэшированная версия получения дней тренировок
export const getTrainingDaysCached = unstable_cache(
  async (typeParam?: string, userId?: string) => {
    try {
      console.warn("[React Cache] Fetching training days for type:", typeParam, "userId:", userId);
      const result = await getTrainingDays(typeParam, userId);
      console.warn(`[React Cache] Cached ${result.trainingDays.length} training days successfully`);
      return { success: true, data: result };
    } catch (error) {
      console.error("❌ Error in getTrainingDaysCached:", error);
      console.error("❌ Error details:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        typeParam,
      });

      await reportErrorToDashboard({
        message:
          error instanceof Error ? error.message : "Unknown error in getTrainingDaysCached",
        stack: error instanceof Error ? error.stack : undefined,
        appName: "web",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "getTrainingDaysCached",
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          typeParam,
        },
        tags: ["training", "days", "cache", "server-action"],
      });

      return { 
        success: false, 
        error: "Что-то пошло не так при получении дней тренировок",
        data: {
          trainingDays: [],
          courseDescription: null,
          courseId: null,
          courseVideoUrl: null,
          courseEquipment: null,
          courseTrainingLevel: null,
        }
      };
    }
  },
  ["training-days"],
  {
    revalidate: false, // Бесконечное кэширование - инвалидируется только вручную
    tags: ["training", "days"],
  }
);


// Кэшированная версия получения отдельного дня курса
export const getTrainingDayCached = unstable_cache(
  async (dayId: string, userId?: string) => {
    try {
      console.warn("[React Cache] Fetching training day:", dayId, "userId:", userId);
      
      const day = await prisma.trainingDay.findUnique({
        where: { id: dayId },
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          equipment: true,
          stepLinks: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              step: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  durationSec: true,
                  videoUrl: true,
                }
              }
            }
          }
        }
      });

      if (!day) {
        return { success: false, error: "День не найден" };
      }

      // Получаем курсы, которые используют этот день
      const courses = await prisma.dayOnCourse.findMany({
        where: { dayId },
        select: {
          course: {
            select: {
              id: true,
              type: true,
              description: true,
              videoUrl: true
            }
          },
          order: true
        }
      });

      const result = {
        trainingDayId: day.id,
        day: courses[0]?.order || 1,
        title: day.title,
        type: day.type,
        courseId: courses[0]?.course.id || null,
        courseDescription: courses[0]?.course.description || null,
        courseVideoUrl: courses[0]?.course.videoUrl || null,
        equipment: day.equipment,
        description: day.description,
        steps: day.stepLinks.map(link => ({
          id: link.step.id,
          title: link.step.title,
          description: link.step.description,
          durationSec: link.step.durationSec,
          videoUrl: link.step.videoUrl,
          order: link.order
        })),
        estimatedDuration: day.stepLinks.reduce((total, link) => total + link.step.durationSec, 0)
      };

      console.warn(`[React Cache] Cached training day ${dayId} successfully`);
      return { success: true, data: result };
    } catch (error) {
      console.error("❌ Error in getTrainingDayCached:", error);
      await reportErrorToDashboard({
        message: error instanceof Error ? error.message : "Unknown error in getTrainingDayCached",
        stack: error instanceof Error ? error.stack : undefined,
        appName: "web",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "getTrainingDayCached",
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          dayId,
        },
        tags: ["training", "day", "cache", "server-action"],
      });

      return { 
        success: false, 
        error: "Что-то пошло не так при получении дня тренировки"
      };
    }
  },
  ["training-day"],
  {
    revalidate: false, // Бесконечное кэширование - инвалидируется только вручную
    tags: ["training", "day"],
  }
);

