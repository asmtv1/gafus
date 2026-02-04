/**
 * Training Routes
 * Endpoints для работы с тренировками
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { getTrainingDays, getTrainingDayWithUserSteps } from "@gafus/core/services/training";
import { createWebLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import type { TrainingStatus as PrismaTrainingStatus } from "@gafus/prisma";
import { getRelativePathFromCDNUrl, downloadFileFromCDN } from "@gafus/cdn-upload";
import { getVideoAccessService } from "@gafus/video-access";
import { TrainingStatus, calculateDayStatusFromStatuses } from "@gafus/types";

const logger = createWebLogger("api-training");

// Проверяем, что VIDEO_ACCESS_SECRET установлен (только для логирования)
// В production это критично, иначе getVideoAccessService() выбросит ошибку
if (process.env.NODE_ENV === "production" && !process.env.VIDEO_ACCESS_SECRET) {
  logger.warn("[training/video/url] ВНИМАНИЕ: VIDEO_ACCESS_SECRET не установлен в production!");
  logger.warn("[training/video/url] Это приведет к ошибке при попытке создать VideoAccessService");
}

export const trainingRoutes = new Hono();

// ==================== GET /training/days ====================
// Получить дни тренировок курса
const daysQuerySchema = z.object({
  type: z.string().optional(),
});

trainingRoutes.get("/days", zValidator("query", daysQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { type } = c.req.valid("query");

    const result = await getTrainingDays(user.id, type);
    return c.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === "COURSE_ACCESS_DENIED") {
      return c.json({ success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" }, 403);
    }
    logger.error("Error fetching training days", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /training/day ====================
// Получить день с шагами пользователя
const dayQuerySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
  dayOnCourseId: z.string().min(1, "dayOnCourseId обязателен"), // Принимаем cuid, а не только UUID
  createIfMissing: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

trainingRoutes.get("/day", zValidator("query", dayQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseType, dayOnCourseId, createIfMissing } = c.req.valid("query");

    const result = await getTrainingDayWithUserSteps(user.id, courseType, dayOnCourseId, {
      createIfMissing,
    });

    if (!result) {
      return c.json({ success: false, error: "День тренировки не найден", code: "NOT_FOUND" }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error("Error fetching training day", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/start ====================
const startStepBodySchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
  dayOnCourseId: z.string().min(1, "dayOnCourseId обязателен"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  status: z.literal("IN_PROGRESS").optional(),
  durationSec: z.number().int().min(0, "durationSec >= 0"),
});

trainingRoutes.post("/step/start", zValidator("json", startStepBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { dayOnCourseId, stepIndex, durationSec } = c.req.valid("json");

    await prisma.$transaction(
      async (tx) => {
        const dayOnCourse = await tx.dayOnCourse.findUnique({
          where: { id: dayOnCourseId },
          include: {
            day: {
              include: {
                stepLinks: { include: { step: true }, orderBy: { order: "asc" } },
              },
            },
          },
        });

        if (!dayOnCourse?.day) {
          throw new Error("DayOnCourse or day not found");
        }

        const stepLink = dayOnCourse.day.stepLinks[stepIndex];
        if (!stepLink?.step) {
          throw new Error("Step not found");
        }

        const userTraining =
          (await tx.userTraining.findFirst({
            where: { userId: user.id, dayOnCourseId },
            select: { id: true },
          })) ??
          (await tx.userTraining.create({
            data: { userId: user.id, dayOnCourseId },
            select: { id: true },
          }));

        const existing = await tx.userStep.findFirst({
          where: { userTrainingId: userTraining.id, stepOnDayId: stepLink.id },
        });
        if (existing) {
          await tx.userStep.update({
            where: { id: existing.id },
            data: {
              status: TrainingStatus.IN_PROGRESS,
              paused: false,
              remainingSec: durationSec,
            },
          });
        } else {
          await tx.userStep.create({
            data: {
              userTrainingId: userTraining.id,
              stepOnDayId: stepLink.id,
              status: TrainingStatus.IN_PROGRESS,
              paused: false,
              remainingSec: durationSec,
            },
          });
        }

        const stepOnDayIds = dayOnCourse.day.stepLinks.map((l) => l.id);
        const userStepsAfter = await tx.userStep.findMany({
          where: { userTrainingId: userTraining.id },
        });
        const allStepStatuses = stepOnDayIds.map(
          (id) =>
            userStepsAfter.find((s) => s.stepOnDayId === id)?.status ?? TrainingStatus.NOT_STARTED,
        );
        const dayStatus = calculateDayStatusFromStatuses(allStepStatuses);
        const firstNotCompleted = allStepStatuses.findIndex((s) => s !== TrainingStatus.COMPLETED);
        const nextIndex = firstNotCompleted === -1 ? stepOnDayIds.length - 1 : firstNotCompleted;

        await tx.userTraining.update({
          where: { id: userTraining.id },
          data: { status: dayStatus as PrismaTrainingStatus, currentStepIndex: nextIndex },
        });
      },
      { timeout: 10000 },
    );

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "DayOnCourse or day not found") {
      return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
    }
    if (error instanceof Error && error.message === "Step not found") {
      return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
    }
    logger.error("Error starting step", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/pause ====================
const pauseStepBodySchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
  dayOnCourseId: z.string().min(1, "dayOnCourseId обязателен"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  timeLeftSec: z.number().int().min(0, "timeLeftSec >= 0"),
});

trainingRoutes.post("/step/pause", zValidator("json", pauseStepBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { dayOnCourseId, stepIndex, timeLeftSec } = c.req.valid("json");

    const dayOnCourse = await prisma.dayOnCourse.findUnique({
      where: { id: dayOnCourseId },
      include: {
        day: {
          include: {
            stepLinks: { orderBy: { order: "asc" } },
          },
        },
      },
    });

    if (!dayOnCourse?.day) {
      return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
    }

    const stepLink = dayOnCourse.day.stepLinks[stepIndex];
    if (!stepLink) {
      return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
    }

    const userTraining = await prisma.userTraining.findFirst({
      where: { userId: user.id, dayOnCourseId },
      select: { id: true },
    });
    if (!userTraining) {
      return c.json({ success: false, error: "Тренировка не найдена", code: "NOT_FOUND" }, 404);
    }

    const existing = await prisma.userStep.findFirst({
      where: { userTrainingId: userTraining.id, stepOnDayId: stepLink.id },
    });
    if (!existing) {
      return c.json({ success: false, error: "Шаг пользователя не найден", code: "NOT_FOUND" }, 404);
    }

    await prisma.userStep.update({
      where: { id: existing.id },
      data: { paused: true, remainingSec: timeLeftSec },
    });

    return c.json({ success: true });
  } catch (error) {
    logger.error("Error pausing step", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/resume ====================
const resumeStepBodySchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
  dayOnCourseId: z.string().min(1, "dayOnCourseId обязателен"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
});

trainingRoutes.post("/step/resume", zValidator("json", resumeStepBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { dayOnCourseId, stepIndex } = c.req.valid("json");

    const dayOnCourse = await prisma.dayOnCourse.findUnique({
      where: { id: dayOnCourseId },
      include: {
        day: {
          include: {
            stepLinks: { orderBy: { order: "asc" } },
          },
        },
      },
    });

    if (!dayOnCourse?.day) {
      return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
    }

    const stepLink = dayOnCourse.day.stepLinks[stepIndex];
    if (!stepLink) {
      return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
    }

    const userTraining = await prisma.userTraining.findFirst({
      where: { userId: user.id, dayOnCourseId },
      select: { id: true },
    });
    if (!userTraining) {
      return c.json({ success: false, error: "Тренировка не найдена", code: "NOT_FOUND" }, 404);
    }

    const existing = await prisma.userStep.findFirst({
      where: { userTrainingId: userTraining.id, stepOnDayId: stepLink.id },
    });
    if (!existing) {
      return c.json({ success: false, error: "Шаг пользователя не найден", code: "NOT_FOUND" }, 404);
    }

    await prisma.userStep.update({
      where: { id: existing.id },
      data: { paused: false },
    });

    return c.json({ success: true });
  } catch (error) {
    logger.error("Error resuming step", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/reset ====================
const resetStepBodySchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
  dayOnCourseId: z.string().min(1, "dayOnCourseId обязателен"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  durationSec: z.number().int().min(0, "durationSec >= 0").optional(),
});

trainingRoutes.post("/step/reset", zValidator("json", resetStepBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { dayOnCourseId, stepIndex } = c.req.valid("json");

    const dayOnCourse = await prisma.dayOnCourse.findUnique({
      where: { id: dayOnCourseId },
      include: {
        day: {
          include: {
            stepLinks: { orderBy: { order: "asc" } },
          },
        },
      },
    });

    if (!dayOnCourse?.day) {
      return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
    }

    const stepLink = dayOnCourse.day.stepLinks[stepIndex];
    if (!stepLink) {
      return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
    }

    const userTraining = await prisma.userTraining.findFirst({
      where: { userId: user.id, dayOnCourseId },
      select: { id: true },
    });
    if (!userTraining) {
      return c.json({ success: false, error: "Тренировка не найдена", code: "NOT_FOUND" }, 404);
    }

    const existing = await prisma.userStep.findFirst({
      where: { userTrainingId: userTraining.id, stepOnDayId: stepLink.id },
    });
    if (!existing) {
      return c.json({ success: true });
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.userStep.update({
          where: { id: existing.id },
          data: { status: TrainingStatus.NOT_STARTED, paused: false, remainingSec: null },
        });

        const stepOnDayIds = dayOnCourse.day.stepLinks.map((l) => l.id);
        const userStepsAfter = await tx.userStep.findMany({
          where: { userTrainingId: userTraining.id },
        });
        const allStepStatuses = stepOnDayIds.map(
          (id) =>
            userStepsAfter.find((s) => s.stepOnDayId === id)?.status ?? TrainingStatus.NOT_STARTED,
        );
        const dayStatus = calculateDayStatusFromStatuses(allStepStatuses);
        const firstNotCompleted = allStepStatuses.findIndex((s) => s !== TrainingStatus.COMPLETED);
        const nextIndex = firstNotCompleted === -1 ? stepOnDayIds.length - 1 : firstNotCompleted;

        await tx.userTraining.update({
          where: { id: userTraining.id },
          data: { status: dayStatus as PrismaTrainingStatus, currentStepIndex: nextIndex },
        });
      },
      { timeout: 10000 },
    );

    return c.json({ success: true });
  } catch (error) {
    logger.error("Error resetting step", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/complete/practice ====================
const completePracticeBodySchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
  dayOnCourseId: z.string().min(1, "dayOnCourseId обязателен"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  stepTitle: z.string().optional(),
  stepOrder: z.number().int().min(0).optional(),
});

trainingRoutes.post(
  "/step/complete/practice",
  zValidator("json", completePracticeBodySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const { dayOnCourseId, stepIndex } = c.req.valid("json");

      await prisma.$transaction(
        async (tx) => {
          const dayOnCourse = await tx.dayOnCourse.findUnique({
            where: { id: dayOnCourseId },
            include: {
              day: {
                include: {
                  stepLinks: { include: { step: true }, orderBy: { order: "asc" } },
                },
              },
            },
          });

          if (!dayOnCourse?.day) {
            throw new Error("DayOnCourse or day not found");
          }

          const stepLink = dayOnCourse.day.stepLinks[stepIndex];
          if (!stepLink?.step) {
            throw new Error("Step not found");
          }

          const userTraining =
            (await tx.userTraining.findFirst({
              where: { userId: user.id, dayOnCourseId },
              select: { id: true },
            })) ??
            (await tx.userTraining.create({
              data: { userId: user.id, dayOnCourseId },
              select: { id: true },
            }));

          const existing = await tx.userStep.findFirst({
            where: { userTrainingId: userTraining.id, stepOnDayId: stepLink.id },
          });
          if (existing) {
            await tx.userStep.update({
              where: { id: existing.id },
              data: { status: TrainingStatus.COMPLETED },
            });
          } else {
            await tx.userStep.create({
              data: {
                userTrainingId: userTraining.id,
                stepOnDayId: stepLink.id,
                status: TrainingStatus.COMPLETED,
              },
            });
          }

          const stepOnDayIds = dayOnCourse.day.stepLinks.map((l) => l.id);
          const userStepsAfter = await tx.userStep.findMany({
            where: { userTrainingId: userTraining.id },
          });
          const allStepStatuses = stepOnDayIds.map(
            (id) =>
              userStepsAfter.find((s) => s.stepOnDayId === id)?.status ?? TrainingStatus.NOT_STARTED,
          );
          const dayStatus = calculateDayStatusFromStatuses(allStepStatuses);
          const allCompleted = dayStatus === TrainingStatus.COMPLETED;
          const firstNotCompleted = allStepStatuses.findIndex((s) => s !== TrainingStatus.COMPLETED);
          const nextIndex =
            allCompleted ? stepOnDayIds.length - 1 : firstNotCompleted === -1 ? 0 : firstNotCompleted;

          await tx.userTraining.update({
            where: { id: userTraining.id },
            data: {
              status: dayStatus as PrismaTrainingStatus,
              currentStepIndex: nextIndex,
            },
          });
        },
        { timeout: 10000 },
      );

      return c.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "DayOnCourse or day not found") {
        return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
      }
      if (error instanceof Error && error.message === "Step not found") {
        return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
      }
      logger.error("Error completing practice step", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);

// ==================== POST /training/video/url ====================
// Получить URL для воспроизведения видео (HLS манифест)
const videoUrlSchema = z.object({
  videoUrl: z.string().min(1, "videoUrl обязателен"),
});

trainingRoutes.post("/video/url", zValidator("json", videoUrlSchema), async (c) => {
  // Логируем сразу при входе в обработчик
  try {
    logger.info("[training/video/url] === ЗАПРОС ПОЛУЧЕН ===", {
      method: c.req.method,
      path: c.req.path,
      url: c.req.url,
      hasUser: !!c.get("user"),
      headers: {
        contentType: c.req.header("Content-Type"),
        hasAuth: !!c.req.header("Authorization"),
      },
    });

    // Получаем пользователя
    let user;
    try {
      user = c.get("user");
      if (!user) {
        logger.error("[training/video/url] Пользователь не найден в контексте");
        return c.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, 401);
      }
      logger.info("[training/video/url] Пользователь получен", { userId: user.id });
    } catch (error) {
      logger.error("[training/video/url] Ошибка получения пользователя", error as Error);
      return c.json({ success: false, error: "Ошибка авторизации", code: "AUTH_ERROR" }, 401);
    }

    // Получаем и валидируем videoUrl
    let videoUrl: string;
    try {
      const body = c.req.valid("json");
      videoUrl = body.videoUrl;
      logger.info("[training/video/url] VideoUrl получен из body", {
        videoUrl: videoUrl?.substring(0, 100),
        videoUrlLength: videoUrl?.length,
      });
    } catch (error) {
      logger.error("[training/video/url] Ошибка получения videoUrl из body", error as Error, {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          success: false,
          error: "Неверный формат запроса",
          code: "VALIDATION_ERROR",
        },
        400,
      );
    }

    if (!videoUrl || typeof videoUrl !== "string" || videoUrl.length === 0) {
      logger.warn("[training/video/url] videoUrl пустой или невалидный", { videoUrl });
      return c.json(
        {
          success: false,
          error: "videoUrl обязателен",
          code: "VALIDATION_ERROR",
        },
        400,
      );
    }

    logger.info("[training/video/url] Запрос video URL", {
      userId: user.id,
      videoUrl: videoUrl.substring(0, 100),
    });

    // Внешние видео (YouTube, VK, RuTube) - возвращаем как есть
    const externalPatterns = [
      /youtube\.com/,
      /youtu\.be/,
      /rutube\.ru/,
      /vimeo\.com/,
      /vk\.com\/video/,
      /vkvideo\.ru/,
    ];

    if (externalPatterns.some((pattern) => pattern.test(videoUrl))) {
      logger.info("[training/video/url] Внешнее видео, возвращаем как есть", { videoUrl });
      return c.json({ success: true, data: { url: videoUrl } });
    }

    // Для CDN видео ищем TrainerVideo и получаем signed URL
    const isCDNVideo =
      videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
      videoUrl.includes("storage.yandexcloud.net/gafus-media");

    if (isCDNVideo) {
      logger.info("[training/video/url] CDN видео, ищем в БД", { videoUrl });

      // Если уже HLS манифест - ищем по hlsManifestPath
      const isHLS = videoUrl.endsWith(".m3u8") || videoUrl.includes("/hls/playlist.m3u8");

      let relativePath: string;
      try {
        relativePath = getRelativePathFromCDNUrl(videoUrl);
        logger.info("[training/video/url] Извлеченный relativePath", { relativePath, isHLS });
      } catch (error) {
        logger.error("[training/video/url] Ошибка извлечения relativePath", error as Error, {
          videoUrl: videoUrl.substring(0, 100),
        });
        return c.json(
          {
            success: false,
            error: "Ошибка обработки URL видео",
            code: "INVALID_URL",
          },
          400,
        );
      }

      // Ищем по relativePath (как в web версии)
      // Вариант 1: Ищем по hlsManifestPath (если videoUrl уже указывает на .m3u8)
      let videoByPath = null;

      try {
        if (isHLS) {
          const hlsManifestPath = relativePath.startsWith("uploads/")
            ? relativePath.replace("uploads/", "")
            : relativePath;

          logger.info("[training/video/url] Поиск по hlsManifestPath", { hlsManifestPath });

          videoByPath = await prisma.trainerVideo.findFirst({
            where: {
              hlsManifestPath,
              transcodingStatus: "COMPLETED",
            },
            select: {
              id: true,
              transcodingStatus: true,
              hlsManifestPath: true,
            },
          });

          if (videoByPath) {
            logger.info("[training/video/url] Видео найдено по hlsManifestPath", {
              videoId: videoByPath.id,
              hlsManifestPath,
            });
          }
        }

        // Вариант 2: Ищем по relativePath (videoUrl в Step может указывать на старый путь)
        // После транскодирования файлы удалены, но relativePath остался
        if (!videoByPath) {
          logger.info("[training/video/url] Поиск по relativePath", { relativePath });

          videoByPath = await prisma.trainerVideo.findFirst({
            where: {
              relativePath,
            },
            select: {
              id: true,
              transcodingStatus: true,
              hlsManifestPath: true,
            },
          });

          if (videoByPath) {
            logger.info("[training/video/url] Видео найдено по relativePath", {
              videoId: videoByPath.id,
              relativePath,
            });
          }
        }
      } catch (error) {
        logger.error("[training/video/url] Ошибка поиска видео в БД", error as Error, {
          relativePath,
          isHLS,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
        return c.json(
          {
            success: false,
            error: "Ошибка поиска видео в базе данных",
            code: "DATABASE_ERROR",
          },
          500,
        );
      }

      logger.info("[training/video/url] Результат поиска в БД", {
        found: !!videoByPath,
        videoId: videoByPath?.id,
        transcodingStatus: videoByPath?.transcodingStatus,
        hasHlsManifest: !!videoByPath?.hlsManifestPath,
      });

      if (
        videoByPath &&
        videoByPath.transcodingStatus === "COMPLETED" &&
        videoByPath.hlsManifestPath
      ) {
        try {
          logger.info("[training/video/url] Генерация signed URL", {
            videoId: videoByPath.id,
            userId: user.id,
            hasHlsManifest: !!videoByPath.hlsManifestPath,
          });

          // Генерируем signed URL
          let videoAccessService;
          try {
            // Проверяем наличие VIDEO_ACCESS_SECRET перед вызовом
            // В production это обязательно, но проверяем всегда для ясности
            if (!process.env.VIDEO_ACCESS_SECRET) {
              const isProduction = process.env.NODE_ENV === "production";
              logger.warn("[training/video/url] VIDEO_ACCESS_SECRET не установлен!", {
                nodeEnv: process.env.NODE_ENV,
                isProduction,
              });
              return c.json(
                {
                  success: false,
                  error: isProduction
                    ? "VIDEO_ACCESS_SECRET не установлен в переменных окружения (обязательно в production)"
                    : "VIDEO_ACCESS_SECRET не установлен в переменных окружения",
                  code: "SERVICE_NOT_CONFIGURED",
                },
                500,
              );
            }

            videoAccessService = getVideoAccessService();
            logger.info("[training/video/url] VideoAccessService получен", {
              hasSecret: !!process.env.VIDEO_ACCESS_SECRET,
              secretLength: process.env.VIDEO_ACCESS_SECRET?.length || 0,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(
              "[training/video/url] Ошибка получения VideoAccessService",
              error as Error,
              {
                errorMessage,
                errorStack: error instanceof Error ? error.stack : undefined,
                hasSecret: !!process.env.VIDEO_ACCESS_SECRET,
                nodeEnv: process.env.NODE_ENV,
                isProduction: process.env.NODE_ENV === "production",
              },
            );

            // Если это ошибка отсутствия VIDEO_ACCESS_SECRET, возвращаем понятное сообщение
            if (errorMessage.includes("VIDEO_ACCESS_SECRET") || !process.env.VIDEO_ACCESS_SECRET) {
              return c.json(
                {
                  success: false,
                  error: "VIDEO_ACCESS_SECRET не установлен в переменных окружения",
                  code: "SERVICE_NOT_CONFIGURED",
                },
                500,
              );
            }

            return c.json(
              {
                success: false,
                error: errorMessage || "Ошибка инициализации сервиса доступа к видео",
                code: "SERVICE_INIT_ERROR",
              },
              500,
            );
          }

          let token: string;
          try {
            token = videoAccessService.generateToken({
              videoId: videoByPath.id,
              userId: user.id,
              ttlMinutes: 120,
            });
            logger.info("[training/video/url] Токен сгенерирован", { tokenLength: token.length });
          } catch (error) {
            logger.error("[training/video/url] Ошибка генерации токена", error as Error, {
              videoId: videoByPath.id,
              userId: user.id,
            });
            return c.json(
              {
                success: false,
                error: "Ошибка генерации токена доступа",
                code: "TOKEN_GENERATION_ERROR",
              },
              500,
            );
          }

          // Возвращаем URL на API endpoint для манифеста (для мобильного приложения)
          // API endpoint поддерживает JWT аутентификацию, в отличие от web endpoint
          const apiUrl =
            process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://api.gafus.ru";
          const signedUrl = `${apiUrl}/api/v1/training/video/${videoByPath.id}/manifest?token=${token}`;
          logger.info("[training/video/url] Сгенерирован signed URL", {
            signedUrl,
            videoId: videoByPath.id,
            apiUrl,
            tokenLength: token.length,
          });
          return c.json({ success: true, data: { url: signedUrl } });
        } catch (error) {
          logger.error("[training/video/url] Ошибка генерации signed URL", error as Error, {
            videoId: videoByPath.id,
            userId: user.id,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            errorName: error instanceof Error ? error.name : undefined,
          });
          return c.json(
            {
              success: false,
              error: error instanceof Error ? error.message : "Ошибка генерации signed URL",
              code: "TOKEN_GENERATION_ERROR",
            },
            500,
          );
        }
      }

      logger.warn("[training/video/url] Видео не найдено или ещё обрабатывается", {
        videoUrl,
        relativePath,
        found: !!videoByPath,
        transcodingStatus: videoByPath?.transcodingStatus,
      });
      return c.json(
        { success: false, error: "Видео не найдено или ещё обрабатывается", code: "NOT_FOUND" },
        404,
      );
    }

    // Для других URL возвращаем как есть
    logger.info("[training/video/url] Неизвестный тип видео, возвращаем как есть", { videoUrl });
    return c.json({ success: true, data: { url: videoUrl } });
  } catch (error) {
    // Безопасное получение videoUrl для логирования
    let videoUrlForLog = "unknown";
    try {
      const body = c.req.valid("json");
      videoUrlForLog = body?.videoUrl?.substring(0, 100) || "unknown";
    } catch {
      // Игнорируем ошибку валидации при логировании
    }

    logger.error("[training/video/url] КРИТИЧЕСКАЯ ОШИБКА в обработчике", error as Error, {
      videoUrl: videoUrlForLog,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      errorName: error instanceof Error ? error.name : undefined,
      path: c.req.path,
      method: c.req.method,
    });

    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Внутренняя ошибка сервера",
        code: "INTERNAL_SERVER_ERROR",
      },
      500,
    );
  }
});

// ==================== GET /training/video/:videoId/manifest ====================
// Получить HLS манифест с подписанными URL для сегментов
// Для мобильного приложения (использует JWT аутентификацию)
const videoManifestParamsSchema = z.object({
  videoId: z.string().min(1),
});

trainingRoutes.get("/video/:videoId/manifest", async (c) => {
  try {
    const { videoId } = c.req.param();

    // Получаем токен из query параметров
    const token = c.req.query("token");
    if (!token) {
      return c.json({ success: false, error: "Токен не предоставлен" }, 401);
    }

    // Проверяем токен доступа к видео
    const videoAccessService = getVideoAccessService();
    const tokenData = videoAccessService.verifyToken(token);

    if (!tokenData) {
      return c.json({ success: false, error: "Недействительный токен" }, 403);
    }

    // Проверяем, что токен для этого видео
    if (tokenData.videoId !== videoId) {
      return c.json({ success: false, error: "Недостаточно прав доступа" }, 403);
    }

    // Получаем информацию о видео из БД
    const video = await prisma.trainerVideo.findUnique({
      where: { id: videoId },
      select: {
        hlsManifestPath: true,
        transcodingStatus: true,
      },
    });

    if (!video) {
      return c.json({ success: false, error: "Видео не найдено" }, 404);
    }

    // Проверяем статус транскодирования
    if (video.transcodingStatus !== "COMPLETED") {
      return c.json(
        {
          success: false,
          error: "Видео ещё обрабатывается",
          status: video.transcodingStatus,
        },
        425, // 425 Too Early
      );
    }

    if (!video.hlsManifestPath) {
      return c.json({ success: false, error: "HLS манифест не найден" }, 404);
    }

    // Скачиваем манифест из Object Storage
    logger.info("[training/video/:videoId/manifest] Загрузка манифеста", {
      videoId,
      hlsManifestPath: video.hlsManifestPath,
    });

    const manifestBuffer = await downloadFileFromCDN(video.hlsManifestPath);
    const manifestContent = manifestBuffer.toString("utf-8");

    logger.info("[training/video/:videoId/manifest] Манифест загружен", {
      videoId,
      manifestLength: manifestContent.length,
      firstLines: manifestContent.split("\n").slice(0, 5),
    });

    // Получаем base URL для формирования абсолютных URL
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://api.gafus.ru";

    // Парсим манифест и добавляем токены к URL сегментов
    const segmentBaseUrl = `${apiUrl}/api/v1/training/video/${videoId}/segment`;
    const lines = manifestContent.split("\n");
    const modifiedLines = lines.map((line) => {
      // Строки с URI= (EXT-X-MAP, EXT-X-KEY и т.д.) — перезаписываем путь на прокси
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch) {
        const segmentPath = uriMatch[1].trim();
        const segmentUrl = `${segmentBaseUrl}?path=${encodeURIComponent(segmentPath)}&token=${token}`;
        return line.replace(uriMatch[0], `URI="${segmentUrl}"`);
      }
      // Обычная строка сегмента (не комментарий)
      if (line.trim() && !line.startsWith("#")) {
        const segmentPath = line.trim();
        const segmentUrl = `${segmentBaseUrl}?path=${encodeURIComponent(segmentPath)}&token=${token}`;
        return segmentUrl;
      }
      return line;
    });

    const modifiedManifest = modifiedLines.join("\n");

    logger.info("[training/video/:videoId/manifest] Манифест модифицирован", {
      videoId,
      originalLines: lines.length,
      modifiedLines: modifiedLines.length,
      apiUrl,
    });

    // Возвращаем модифицированный манифест
    c.header("Content-Type", "application/vnd.apple.mpegurl");
    c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    c.header("Pragma", "no-cache");
    c.header("Expires", "0");
    return c.text(modifiedManifest, 200);
  } catch (error) {
    logger.error("[training/video/:videoId/manifest] Ошибка получения манифеста", error as Error, {
      videoId: c.req.param("videoId"),
    });
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Ошибка получения манифеста",
        code: "INTERNAL_SERVER_ERROR",
      },
      500,
    );
  }
});

// ==================== GET /training/video/:videoId/segment ====================
// Получить сегмент HLS видео
// Для мобильного приложения (использует JWT аутентификацию)
trainingRoutes.get("/video/:videoId/segment", async (c) => {
  try {
    const { videoId } = c.req.param();

    // Получаем токен и путь к сегменту из query параметров
    const token = c.req.query("token");
    const segmentPath = c.req.query("path");

    if (!token) {
      return c.json({ success: false, error: "Токен не предоставлен" }, 401);
    }

    if (!segmentPath) {
      return c.json({ success: false, error: "Путь к сегменту не предоставлен" }, 400);
    }

    // Проверяем токен доступа к видео
    const videoAccessService = getVideoAccessService();
    const tokenData = videoAccessService.verifyToken(token);

    if (!tokenData) {
      return c.json({ success: false, error: "Недействительный токен" }, 403);
    }

    // Проверяем, что токен для этого видео
    if (tokenData.videoId !== videoId) {
      return c.json({ success: false, error: "Недостаточно прав доступа" }, 403);
    }

    // Получаем информацию о видео для определения базового пути
    const video = await prisma.trainerVideo.findUnique({
      where: { id: videoId },
      select: {
        hlsManifestPath: true,
        transcodingStatus: true,
      },
    });

    if (!video || video.transcodingStatus !== "COMPLETED" || !video.hlsManifestPath) {
      return c.json({ success: false, error: "Видео не найдено или не готово" }, 404);
    }

    // Формируем полный путь к сегменту относительно манифеста
    // segmentPath может быть относительным (например, "segment_001.ts")
    const baseDir = video.hlsManifestPath.split("/").slice(0, -1).join("/");
    const fullSegmentPath =
      segmentPath.startsWith("/") || segmentPath.includes("://")
        ? segmentPath // Уже абсолютный путь
        : `${baseDir}/${segmentPath}`; // Относительный путь

    // Скачиваем сегмент из Object Storage
    const segmentBuffer = await downloadFileFromCDN(fullSegmentPath);

    // Определяем Content-Type на основе расширения файла
    let contentType = "application/octet-stream";
    if (segmentPath.endsWith(".ts")) {
      contentType = "video/mp2t";
    } else if (segmentPath.endsWith(".m3u8")) {
      contentType = "application/vnd.apple.mpegurl";
    }

    // Возвращаем сегмент
    return c.body(segmentBuffer, 200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000", // 1 год для сегментов
    });
  } catch (error) {
    logger.error("[training/video/:videoId/segment] Ошибка получения сегмента", error as Error, {
      videoId: c.req.param("videoId"),
      segmentPath: c.req.query("path"),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Ошибка получения сегмента",
        code: "INTERNAL_SERVER_ERROR",
      },
      500,
    );
  }
});
