"use server";

import { unstable_cache } from "next/cache";

import { prisma } from "@gafus/prisma";
import type { Prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";
import { reportErrorToDashboard } from "../actions/reportError";
import { getAuthoredCourses } from "../course/getAuthoredCourses";
import { getCoursesWithProgress } from "../course/getCourses";
import { getFavoritesCourses } from "../course/getFavoritesCourses";
import { getTrainingDays } from "../training/getTrainingDays";
import {
  dayIdSchema,
  optionalTrainingTypeSchema,
  optionalUserIdSchema,
} from "../validation/schemas";

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

// Создаем логгер для cached-courses
const logger = createWebLogger('web-cached-courses');

// Базовый список всех курсов (постоянное кэширование)
// ВАЖНО: Эта функция кэширует ВСЕ курсы (публичные + приватные) без пользовательских данных
export const getAllCoursesCached = unstable_cache(
  async () => {
    try {
      logger.warn("[React Cache] Fetching all courses (permanent cache, { operation: 'warn' })");
      
      // Получаем ВСЕ курсы (публичные + приватные) без пользовательских данных
      type CourseWithRelations = Prisma.CourseGetPayload<{
        include: {
          author: { select: { username: true } };
          reviews: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  profile: { select: { avatarUrl: true } },
                };
              };
            };
          };
          access: {
            include: {
              user: {
                select: { id: true };
              };
            };
          };
          dayLinks: {
            include: {
              day: {
                include: {
                  stepLinks: {
                    include: {
                      step: { select: { title: true } };
                    };
                  };
                };
              };
            };
          };
        };
      }>;

      const allCourses: CourseWithRelations[] = await prisma.course.findMany({
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

      const data = allCourses.map((course: CourseWithRelations) => ({
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
        reviews: course.reviews.map((review: CourseWithRelations["reviews"][number]) => ({
          rating: review.rating ?? 0,
          comment: review.comment ?? "",
          createdAt: review.createdAt ? new Date(review.createdAt) : new Date(),
          user: {
            username: review.user.username,
            profile: review.user.profile,
          },
        })),
        access: course.access,
        dayLinks: course.dayLinks.map((dl: CourseWithRelations["dayLinks"][number]) => ({
          order: dl.order,
          day: {
            id: dl.day.id,
            title: dl.day.title,
            stepLinks: dl.day.stepLinks.map((sl: CourseWithRelations["dayLinks"][number]["day"]["stepLinks"][number]) => ({
              id: sl.id,
              order: sl.order,
              step: { title: sl.step.title },
            })),
          },
        })),
      }));

      logger.warn(`[React Cache] Cached ${data.length} courses (public + private, { operation: 'warn' }) permanently`);
      return { success: true, data };
    } catch (error) {
      logger.error("❌ Error in getAllCoursesCached:", error as Error, { operation: 'error' });

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
  const safeUserId = optionalUserIdSchema.parse(userId);
  const cacheKeyUserId = safeUserId ?? "anonymous";
  const cachedFunction = unstable_cache(
    async () => {
      try {
        logger.warn("[React Cache] Fetching user courses progress for user:", { safeUserId, operation: 'warn' });
        
        if (!safeUserId) {
          return { success: true, data: [] };
        }

        // Получаем только прогресс пользователя по курсам
        const userCourses = await prisma.userCourse.findMany({
          where: { userId: safeUserId },
          select: {
            courseId: true,
            status: true,
            startedAt: true,
            completedAt: true,
          },
        });

        const userFavorites = await prisma.favoriteCourse.findMany({
          where: { userId: safeUserId },
          select: { courseId: true },
        });

        const favoriteCourseIds = new Set(userFavorites.map((f: { courseId: string }) => f.courseId));

        const data: UserCourseProgress[] = userCourses.map((uc: {
          courseId: string;
          status: unknown;
          startedAt: Date | null;
          completedAt: Date | null;
        }) => ({
          courseId: uc.courseId,
          status: uc.status as TrainingStatus,
          startedAt: uc.startedAt ? new Date(uc.startedAt) : null,
          completedAt: uc.completedAt ? new Date(uc.completedAt) : null,
        }));

        const favorites = Array.from(favoriteCourseIds);

        logger.warn(
          `[React Cache] Cached progress for ${data.length} courses and ${favorites.length} favorites for user: ${safeUserId}`,
          { operation: 'warn' }
        );
        return {
          success: true,
          data: {
            userCourses: data,
            favoriteCourseIds: favorites,
          } as UserProgressData,
        };
      } catch (error) {
        logger.error("❌ Error in getUserCoursesProgressCached:", error as Error, { operation: 'error' });

        await reportErrorToDashboard({
          message:
            error instanceof Error ? error.message : "Unknown error in getUserCoursesProgressCached",
          stack: error instanceof Error ? error.stack : undefined,
          appName: "web",
          environment: process.env.NODE_ENV || "development",
          additionalContext: {
            action: "getUserCoursesProgressCached",
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            userId: safeUserId,
          },
          tags: ["courses", "cache", "server-action"],
        });

        return { success: false, error: "Что-то пошло не так при получении прогресса курсов" };
      }
    },
    ["user-courses-progress", cacheKeyUserId], // Включаем userId в ключ кэша
    {
      revalidate: false, // НЕ инвалидируется по времени - только вручную при изменении прогресса
      tags: ["courses", "user-progress", `user-${cacheKeyUserId}`], // Включаем userId в теги
    },
  );

  return await cachedFunction();
}

// Кэшированная версия получения всех курсов с прогрессом пользователя (для обратной совместимости)
export async function getCoursesWithProgressCached(userId?: string) {
  const safeUserId = optionalUserIdSchema.parse(userId);
  const cacheKeyUserId = safeUserId ?? "anonymous";
  const cachedFunction = unstable_cache(
    async () => {
      try {
        logger.warn("[React Cache] Fetching all courses with progress for user:", { safeUserId, operation: 'warn' });
        const result = await getCoursesWithProgress(safeUserId);
        logger.warn(
          `[React Cache] Cached ${result.data.length} courses successfully for user: ${safeUserId}`,
          { operation: 'warn' }
        );
        return { success: true, data: result.data };
      } catch (error) {
        logger.error("❌ Error in getCoursesWithProgressCached:", error as Error, { operation: 'error' });

        await reportErrorToDashboard({
          message:
            error instanceof Error ? error.message : "Unknown error in getCoursesWithProgressCached",
          stack: error instanceof Error ? error.stack : undefined,
          appName: "web",
          environment: process.env.NODE_ENV || "development",
          additionalContext: {
            action: "getCoursesWithProgressCached",
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            userId: safeUserId,
          },
          tags: ["courses", "cache", "server-action"],
        });

        return { success: false, error: "Что-то пошло не так при получении курсов" };
      }
    },
    ["courses-all", cacheKeyUserId], // Включаем userId в ключ кэша
    {
      revalidate: 60, // 60 секунд - синхронизируем с revalidate страницы
      tags: ["courses", "courses-all", `user-${cacheKeyUserId}`], // Включаем userId в теги
    },
  );

  return await cachedFunction();
}

// Функция для объединения всех курсов с прогрессом пользователя
export async function getCoursesWithUserProgressCached(userId?: string) {
  const safeUserId = optionalUserIdSchema.parse(userId);
  try {
    logger.warn("[React Cache] Combining all courses with user progress for user:", { safeUserId, operation: 'warn' });
    
    // Получаем все курсы (из постоянного кэша)
    const allCoursesResult = await getAllCoursesCached();
    if (!allCoursesResult.success) {
      return allCoursesResult;
    }

    // Получаем прогресс пользователя
    const userProgressResult = await getUserCoursesProgressCached(safeUserId);
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
      if (safeUserId && course.access) {
        return course.access.some((access: { user: { id: string } }) => access.user.id === safeUserId);
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

    logger.warn(`[React Cache] Combined ${coursesWithProgress.length} accessible courses with user progress`, { operation: 'warn' });
    return { success: true, data: coursesWithProgress };
  } catch (error) {
    logger.error("❌ Error in getCoursesWithUserProgressCached:", error as Error, { operation: 'error' });

    await reportErrorToDashboard({
      message:
        error instanceof Error ? error.message : "Unknown error in getCoursesWithUserProgressCached",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "getCoursesWithUserProgressCached",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        userId: safeUserId,
      },
      tags: ["courses", "cache", "server-action"],
    });

    return { success: false, error: "Что-то пошло не так при получении курсов с прогрессом" };
  }
}

// Кэшированная версия получения избранных курсов
export async function getFavoritesCoursesCached(userId?: string) {
  const safeUserId = optionalUserIdSchema.parse(userId);
  const cacheKeyUserId = safeUserId ?? "anonymous";
  const cachedFunction = unstable_cache(
    async () => {
      try {
        logger.warn("[React Cache] Fetching favorite courses", { operation: 'warn' });
        const result = await getFavoritesCourses(safeUserId);
        logger.warn(`[React Cache] Cached ${result.data.length} favorite courses successfully`, { operation: 'warn' });
        return { success: true, data: result.data };
      } catch (error) {
        logger.error("❌ Error in getFavoritesCoursesCached:", error as Error, { operation: 'error' });

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
    ["courses-favorites", cacheKeyUserId],
    {
      revalidate: 60, // 60 секунд - синхронизируем с revalidate страницы
      tags: ["courses", "courses-favorites", `user-${cacheKeyUserId}`],
    },
  );

  return await cachedFunction();
}

// Кэшированная версия получения созданных курсов
export const getAuthoredCoursesCached = unstable_cache(
  async () => {
    try {
      logger.warn("[React Cache] Fetching authored courses", { operation: 'warn' });
      const result = await getAuthoredCourses();
      logger.warn(`[React Cache] Cached ${result.length} authored courses successfully`, { operation: 'warn' });
      return { success: true, data: result };
    } catch (error) {
      logger.error("❌ Error in getAuthoredCoursesCached:", error as Error, { operation: 'error' });

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
    const safeType = optionalTrainingTypeSchema.parse(typeParam);
    const safeUserId = optionalUserIdSchema.parse(userId);
    try {
      logger.warn("[React Cache] Fetching training days for type:", { safeType, safeUserId, operation: 'warn' });
      const result = await getTrainingDays(safeType, safeUserId);
      logger.warn(`[React Cache] Cached ${result.trainingDays.length} training days successfully`, { operation: 'warn' });
      return { success: true, data: result };
    } catch (error) {
      logger.error("❌ Error in getTrainingDaysCached:", error as Error, { operation: 'error' });
      logger.error("❌ Error details:", new Error(`Error in getTrainingDaysCached: ${error instanceof Error ? error.message : "Unknown error"}`), {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        typeParam: safeType,
        userId: safeUserId,
        operation: 'error'
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
          typeParam: safeType,
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
        },
      };
    }
  },
  // Меняем ключ версионирования, чтобы сбросить старый кэш с другим расчётом времени
  ["training-days-v2"],
  {
    revalidate: false, // Бесконечное кэширование - инвалидируется только вручную
    tags: ["training", "days"],
  }
);


// Кэшированная версия получения отдельного дня курса
export const getTrainingDayCached = unstable_cache(
  async (dayId: string, userId?: string) => {
    const safeDayId = dayIdSchema.parse(dayId);
    const safeUserId = optionalUserIdSchema.parse(userId);
    try {
      logger.warn("[React Cache] Fetching training day:", { safeDayId, safeUserId, operation: 'warn' });
      
      const day = await prisma.trainingDay.findUnique({
        where: { id: safeDayId },
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
                // Поле estimatedDurationSec уже есть в БД, но ещё не проброшено в Prisma-типах,
                // поэтому используем any только в select
                select: {
                  id: true,
                  title: true,
                  description: true,
                  durationSec: true,
                  estimatedDurationSec: true,
                  type: true,
                  videoUrl: true,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
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
        where: { dayId: safeDayId },
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
        steps: day.stepLinks.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (link: { order: number; step: any }) => ({
          id: link.step.id,
          title: link.step.title,
          description: link.step.description,
          durationSec: link.step.durationSec ?? 0,
          estimatedDurationSec: link.step.estimatedDurationSec ?? null,
          videoUrl: link.step.videoUrl,
          order: link.order,
        })),
        estimatedDuration: day.stepLinks.reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (total: number, link: { step: any }) => {
          const step = link.step as {
            durationSec: number | null;
            estimatedDurationSec: number | null;
            type: string | null;
          };
          if (step.type === "TRAINING") {
            return total + (step.durationSec ?? 0);
          }
          return total + (step.estimatedDurationSec ?? 0);
        }, 0),
      };

      logger.warn(`[React Cache] Cached training day ${safeDayId} successfully`, { operation: 'warn' });
      return { success: true, data: result };
    } catch (error) {
      logger.error("❌ Error in getTrainingDayCached:", error as Error, { operation: 'error' });
      await reportErrorToDashboard({
        message: error instanceof Error ? error.message : "Unknown error in getTrainingDayCached",
        stack: error instanceof Error ? error.stack : undefined,
        appName: "web",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          action: "getTrainingDayCached",
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          dayId: safeDayId,
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
