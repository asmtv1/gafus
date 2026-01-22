/**
 * Training Routes
 * Endpoints для работы с тренировками
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getTrainingDays,
  getTrainingDayWithUserSteps,
} from "@gafus/core/services/training";
import { createWebLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import { getRelativePathFromCDNUrl } from "@gafus/cdn-upload";
import { getVideoAccessService } from "@gafus/video-access";

const logger = createWebLogger("api-training");

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
  createIfMissing: z.enum(["true", "false"]).optional().transform(v => v === "true"),
});

trainingRoutes.get("/day", zValidator("query", dayQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseType, dayOnCourseId, createIfMissing } = c.req.valid("query");

    const result = await getTrainingDayWithUserSteps(
      user.id,
      courseType,
      dayOnCourseId,
      { createIfMissing }
    );

    if (!result) {
      return c.json({ success: false, error: "День тренировки не найден", code: "NOT_FOUND" }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error("Error fetching training day", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/video/url ====================
// Получить URL для воспроизведения видео (HLS манифест)
const videoUrlSchema = z.object({
  videoUrl: z.string().min(1, "videoUrl обязателен"),
});

trainingRoutes.post("/video/url", zValidator("json", videoUrlSchema), async (c) => {
  try {
    logger.info("[training/video/url] === ЗАПРОС ПОЛУЧЕН ===", {
      method: c.req.method,
      path: c.req.path,
      url: c.req.url,
      hasUser: !!c.get("user"),
    });

    const user = c.get("user");
    if (!user) {
      logger.error("[training/video/url] Пользователь не найден в контексте");
      return c.json({ success: false, error: "Не авторизован", code: "UNAUTHORIZED" }, 401);
    }

    const { videoUrl } = c.req.valid("json");

    logger.info("[training/video/url] Запрос video URL", {
      userId: user.id,
      videoUrl,
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

    // Если уже HLS манифест - возвращаем как есть
    const isHLS = videoUrl.endsWith(".m3u8") || videoUrl.includes("/hls/playlist.m3u8");
    if (isHLS) {
      logger.info("[training/video/url] HLS манифест, возвращаем как есть", { videoUrl });
      return c.json({ success: true, data: { url: videoUrl } });
    }

    // Для CDN видео ищем TrainerVideo и получаем signed URL
    const isCDNVideo =
      videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
      videoUrl.includes("storage.yandexcloud.net/gafus-media");

    if (isCDNVideo) {
      logger.info("[training/video/url] CDN видео, ищем в БД", { videoUrl });
      const relativePath = getRelativePathFromCDNUrl(videoUrl);
      
      logger.info("[training/video/url] Извлеченный relativePath", { relativePath });
      
      // Ищем по relativePath
      const videoByPath = await prisma.trainerVideo.findFirst({
        where: {
          relativePath,
        },
        select: {
          id: true,
          transcodingStatus: true,
          hlsManifestPath: true,
        },
      });

      logger.info("[training/video/url] Результат поиска в БД", {
        found: !!videoByPath,
        videoId: videoByPath?.id,
        transcodingStatus: videoByPath?.transcodingStatus,
        hasHlsManifest: !!videoByPath?.hlsManifestPath,
      });

      if (videoByPath && videoByPath.transcodingStatus === "COMPLETED" && videoByPath.hlsManifestPath) {
        // Генерируем signed URL
        const videoAccessService = getVideoAccessService();
        const token = videoAccessService.generateToken({
          videoId: videoByPath.id,
          userId: user.id,
          ttlMinutes: 120,
        });

        // Получаем URL web приложения для manifest endpoint
        // Manifest endpoint находится в web приложении, а не в API
        // Используем тот же подход, что и в getSignedVideoUrl из web
        const webAppUrl = process.env.WEB_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://gafus.ru";
        const signedUrl = `${webAppUrl}/api/video/${videoByPath.id}/manifest?token=${token}`;
        logger.info("[training/video/url] Сгенерирован signed URL", { 
          signedUrl,
          videoId: videoByPath.id,
          webAppUrl,
          tokenLength: token.length,
        });
        return c.json({ success: true, data: { url: signedUrl } });
      }

      logger.warn("[training/video/url] Видео не найдено или ещё обрабатывается", {
        videoUrl,
        relativePath,
        found: !!videoByPath,
        transcodingStatus: videoByPath?.transcodingStatus,
      });
      return c.json(
        { success: false, error: "Видео не найдено или ещё обрабатывается", code: "NOT_FOUND" },
        404
      );
    }

    // Для других URL возвращаем как есть
    logger.info("[training/video/url] Неизвестный тип видео, возвращаем как есть", { videoUrl });
    return c.json({ success: true, data: { url: videoUrl } });
  } catch (error) {
    logger.error("Error getting video URL", error as Error, {
      videoUrl: c.req.valid("json")?.videoUrl,
    });
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});
