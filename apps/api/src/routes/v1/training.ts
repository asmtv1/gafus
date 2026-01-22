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
import { getRelativePathFromCDNUrl, downloadFileFromCDN } from "@gafus/cdn-upload";
import { getVideoAccessService } from "@gafus/video-access";

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
      return c.json({ 
        success: false, 
        error: "Неверный формат запроса",
        code: "VALIDATION_ERROR"
      }, 400);
    }

    if (!videoUrl || typeof videoUrl !== "string" || videoUrl.length === 0) {
      logger.warn("[training/video/url] videoUrl пустой или невалидный", { videoUrl });
      return c.json({ 
        success: false, 
        error: "videoUrl обязателен",
        code: "VALIDATION_ERROR"
      }, 400);
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
        return c.json({ 
          success: false, 
          error: "Ошибка обработки URL видео",
          code: "INVALID_URL"
        }, 400);
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
              hlsManifestPath 
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
              relativePath 
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
        return c.json({ 
          success: false, 
          error: "Ошибка поиска видео в базе данных",
          code: "DATABASE_ERROR"
        }, 500);
      }

      logger.info("[training/video/url] Результат поиска в БД", {
        found: !!videoByPath,
        videoId: videoByPath?.id,
        transcodingStatus: videoByPath?.transcodingStatus,
        hasHlsManifest: !!videoByPath?.hlsManifestPath,
      });

      if (videoByPath && videoByPath.transcodingStatus === "COMPLETED" && videoByPath.hlsManifestPath) {
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
              return c.json({ 
                success: false, 
                error: isProduction 
                  ? "VIDEO_ACCESS_SECRET не установлен в переменных окружения (обязательно в production)"
                  : "VIDEO_ACCESS_SECRET не установлен в переменных окружения",
                code: "SERVICE_NOT_CONFIGURED"
              }, 500);
            }
            
            videoAccessService = getVideoAccessService();
            logger.info("[training/video/url] VideoAccessService получен", {
              hasSecret: !!process.env.VIDEO_ACCESS_SECRET,
              secretLength: process.env.VIDEO_ACCESS_SECRET?.length || 0,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error("[training/video/url] Ошибка получения VideoAccessService", error as Error, {
              errorMessage,
              errorStack: error instanceof Error ? error.stack : undefined,
              hasSecret: !!process.env.VIDEO_ACCESS_SECRET,
              nodeEnv: process.env.NODE_ENV,
              isProduction: process.env.NODE_ENV === "production",
            });
            
            // Если это ошибка отсутствия VIDEO_ACCESS_SECRET, возвращаем понятное сообщение
            if (errorMessage.includes("VIDEO_ACCESS_SECRET") || !process.env.VIDEO_ACCESS_SECRET) {
              return c.json({ 
                success: false, 
                error: "VIDEO_ACCESS_SECRET не установлен в переменных окружения",
                code: "SERVICE_NOT_CONFIGURED"
              }, 500);
            }
            
            return c.json({ 
              success: false, 
              error: errorMessage || "Ошибка инициализации сервиса доступа к видео",
              code: "SERVICE_INIT_ERROR"
            }, 500);
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
            return c.json({ 
              success: false, 
              error: "Ошибка генерации токена доступа",
              code: "TOKEN_GENERATION_ERROR"
            }, 500);
          }

          // Возвращаем URL на API endpoint для манифеста (для мобильного приложения)
          // API endpoint поддерживает JWT аутентификацию, в отличие от web endpoint
          const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://api.gafus.ru";
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
          return c.json({ 
            success: false, 
            error: error instanceof Error ? error.message : "Ошибка генерации signed URL",
            code: "TOKEN_GENERATION_ERROR"
          }, 500);
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
        404
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
    
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Внутренняя ошибка сервера",
      code: "INTERNAL_SERVER_ERROR"
    }, 500);
  }
});

// ==================== GET /training/video/:videoId/manifest ====================
// Получить HLS манифест с подписанными URL для сегментов
// Для мобильного приложения (использует JWT аутентификацию)
const videoManifestParamsSchema = z.object({
  videoId: z.string().min(1),
});

trainingRoutes.get(
  "/video/:videoId/manifest",
  async (c) => {
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
          425 // 425 Too Early
        );
      }

      if (!video.hlsManifestPath) {
        return c.json({ success: false, error: "HLS манифест не найден" }, 404);
      }

      // Скачиваем манифест из Object Storage
      const manifestBuffer = await downloadFileFromCDN(video.hlsManifestPath);
      const manifestContent = manifestBuffer.toString("utf-8");

      // Получаем base URL для формирования абсолютных URL
      const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://api.gafus.ru";

      // Парсим манифест и добавляем токены к URL сегментов
      const lines = manifestContent.split("\n");
      const modifiedLines = lines.map((line) => {
        // Если строка - это URL сегмента (не начинается с # и не пустая)
        if (line.trim() && !line.startsWith("#")) {
          // Генерируем signed URL для сегмента
          const segmentPath = line.trim();
          
          // Создаём абсолютный URL для прокси-эндпоинта сегмента
          const segmentUrl = `${apiUrl}/api/v1/training/video/${videoId}/segment?path=${encodeURIComponent(segmentPath)}&token=${token}`;
          
          return segmentUrl;
        }
        return line;
      });

      const modifiedManifest = modifiedLines.join("\n");

      // Возвращаем модифицированный манифест
      return c.text(modifiedManifest, 200, {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      });
    } catch (error) {
      logger.error("[training/video/:videoId/manifest] Ошибка получения манифеста", error as Error, {
        videoId: c.req.param("videoId"),
      });
      return c.json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Ошибка получения манифеста",
        code: "INTERNAL_SERVER_ERROR"
      }, 500);
    }
  }
);

// ==================== GET /training/video/:videoId/segment ====================
// Получить сегмент HLS видео
// Для мобильного приложения (использует JWT аутентификацию)
trainingRoutes.get(
  "/video/:videoId/segment",
  async (c) => {
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

      // Скачиваем сегмент из Object Storage
      const segmentBuffer = await downloadFileFromCDN(segmentPath);

      // Определяем Content-Type на основе расширения файла
      let contentType = "application/octet-stream";
      if (segmentPath.endsWith(".ts")) {
        contentType = "video/mp2t";
      } else if (segmentPath.endsWith(".m3u8")) {
        contentType = "application/vnd.apple.mpegurl";
      }

      // Возвращаем сегмент
      return new Response(segmentBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000", // 1 год для сегментов
        },
      });
    } catch (error) {
      logger.error("[training/video/:videoId/segment] Ошибка получения сегмента", error as Error, {
        videoId: c.req.param("videoId"),
        userId: c.get("user")?.id,
        segmentPath: c.req.query("path"),
      });
      return c.json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Ошибка получения сегмента",
        code: "INTERNAL_SERVER_ERROR"
      }, 500);
    }
  }
);
