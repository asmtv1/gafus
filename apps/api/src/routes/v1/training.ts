/**
 * Training Routes
 * Endpoints для работы с тренировками
 */
import { type Context, Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getTrainingDays,
  getTrainingDayWithMonetizedSteps,
  requireCourseStepPremiumOrRewardedUnlock,
  syncUserCourseStatusFromDays,
  updateStepAndDay,
  validateTheoryStepForCompletion,
} from "@gafus/core/services/training";
import { saveDiaryEntry, getDiaryEntries } from "@gafus/core/services/diary";
import { checkCourseAccess, checkCourseAccessById } from "@gafus/core/services/course";
import {
  requirePremiumOrRewardedAccessForVideoUrl,
  SubscriptionOrCreditsRequiredError,
} from "@gafus/core/services/rewardedCredits";
import {
  checkVideoAccess,
  getProgress,
  getVideoManifestInfo,
  saveProgress,
} from "@gafus/core/services/video";
import {
  createStepNotificationForStepStart,
  getDayFromDayOnCourseId,
  pauseStepNotification,
  resetStepNotification,
  resumeStepNotification,
} from "@gafus/core/services/notifications";
import { createWebLogger } from "@gafus/logger";
import {
  downloadFileFromCDN,
  extractVideoIdFromCdnUrl,
  getSignedDownloadUrl,
  streamFileFromCDN,
} from "@gafus/cdn-upload";
import { getVideoAccessService, VIDEO_PLAYBACK_TOKEN_TTL_MINUTES } from "@gafus/video-access";
import { rewriteHlsManifest } from "../../lib/hlsManifest";

const logger = createWebLogger("api-training");

const HLS_SEGMENT_FILE_PATTERN = /^[a-zA-Z0-9._-]+\.(ts|m4s|mp4|m3u8|vtt|aac)$/;
const PLAYBACK_ACCESS_CACHE_TTL_MS = 60_000;
const PLAYBACK_ACCESS_DENIED_CACHE_TTL_MS = 10_000;
const HLS_DIRECT_RESOURCE_TTL_SECONDS = VIDEO_PLAYBACK_TOKEN_TTL_MINUTES * 60;

type VideoPlaybackAccess = {
  video: Awaited<ReturnType<typeof getVideoManifestInfo>>;
  hasAccess: boolean;
};

const playbackAccessCache = new Map<string, { expiresAt: number; value: VideoPlaybackAccess }>();
const playbackAccessInFlight = new Map<string, Promise<VideoPlaybackAccess>>();

export function invalidateVideoPlaybackAccessCache(userId?: string, videoId?: string): void {
  if (!userId && !videoId) {
    playbackAccessCache.clear();
    playbackAccessInFlight.clear();
    return;
  }
  for (const key of playbackAccessCache.keys()) {
    const separatorIndex = key.lastIndexOf(":");
    const cachedUserId = key.slice(0, separatorIndex);
    const cachedVideoId = key.slice(separatorIndex + 1);
    if ((!userId || cachedUserId === userId) && (!videoId || cachedVideoId === videoId)) {
      playbackAccessCache.delete(key);
    }
  }
}

function validateHlsSegmentPath(segmentPath: string): string | null {
  const normalized = segmentPath.trim();
  if (!normalized) return null;
  if (
    normalized.includes("..") ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.includes("://")
  ) {
    return null;
  }
  if (!HLS_SEGMENT_FILE_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

async function getCachedVideoPlaybackAccess(
  userId: string,
  videoId: string,
): Promise<VideoPlaybackAccess> {
  const key = `${userId}:${videoId}`;
  const now = Date.now();
  const cached = playbackAccessCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const existingRequest = playbackAccessInFlight.get(key);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const video = await getVideoManifestInfo(videoId);
    const hasAccess = video ? await checkVideoAccess({ userId, videoId }) : false;
    const value = { video, hasAccess };
    playbackAccessCache.set(key, {
      expiresAt:
        Date.now() +
        (hasAccess && video?.transcodingStatus === "COMPLETED"
          ? PLAYBACK_ACCESS_CACHE_TTL_MS
          : PLAYBACK_ACCESS_DENIED_CACHE_TTL_MS),
      value,
    });
    if (playbackAccessCache.size > 5_000) {
      const oldestKey = playbackAccessCache.keys().next().value;
      if (oldestKey) playbackAccessCache.delete(oldestKey);
    }
    return value;
  })().finally(() => playbackAccessInFlight.delete(key));

  playbackAccessInFlight.set(key, request);
  return request;
}

async function createProtectedHlsManifest(params: {
  content: string;
  baseDir: string;
  apiUrl: string;
  videoId: string;
  token: string;
}): Promise<string> {
  const { content, baseDir, apiUrl, videoId, token } = params;
  return rewriteHlsManifest(content, async (rawPath) => {
    const safePath = validateHlsSegmentPath(rawPath);
    if (!safePath) throw new Error(`Недопустимый HLS resource path: ${rawPath}`);
    if (safePath.endsWith(".m3u8")) {
      return `${apiUrl}/api/v1/training/video/${videoId}/segment?path=${encodeURIComponent(safePath)}&token=${encodeURIComponent(token)}`;
    }
    return getSignedDownloadUrl(`${baseDir}/${safePath}`, HLS_DIRECT_RESOURCE_TTL_SECONDS);
  });
}

// Проверяем, что VIDEO_ACCESS_SECRET установлен (только для логирования)
// В production это критично, иначе getVideoAccessService() выбросит ошибку
if (process.env.NODE_ENV === "production" && !process.env.VIDEO_ACCESS_SECRET) {
  logger.warn("[training/video/url] ВНИМАНИЕ: VIDEO_ACCESS_SECRET не установлен в production!");
  logger.warn("[training/video/url] Это приведет к ошибке при попытке создать VideoAccessService");
}

export const trainingRoutes = new Hono();

const rewardedPlatformSchema = z.enum(["ANDROID", "IOS"]);

function isSubscriptionOrCreditsRequiredError(error: unknown): boolean {
  return (
    error instanceof SubscriptionOrCreditsRequiredError ||
    (error instanceof Error && error.name === "SubscriptionOrCreditsRequiredError")
  );
}

function subscriptionOrCreditsResponse(c: Context): Response {
  return c.json(
    {
      success: false,
      error: "Для действия нужна подписка или доступ к шагу за просмотр рекламы",
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    },
    402,
  );
}

function getRewardedPlatform(c: Context, platform?: string): "ANDROID" | "IOS" {
  const candidate =
    platform ??
    c.req.query("platform") ??
    c.req.header("x-rewarded-platform") ??
    c.req.header("x-platform");
  const parsed = rewardedPlatformSchema.safeParse(candidate);
  return parsed.success ? parsed.data : "ANDROID";
}

async function requireRewardedStepAccess(
  c: Context,
  input: { dayOnCourseId: string; stepIndex: number },
): Promise<Response | null> {
  const user = c.get("user");
  try {
    await requireCourseStepPremiumOrRewardedUnlock({
      userId: user.id,
      platform: getRewardedPlatform(c),
      dayOnCourseId: input.dayOnCourseId,
      stepIndex: input.stepIndex,
    });
    return null;
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    throw error;
  }
}

async function requireCourseAccessByCourseId(
  c: Context,
  courseId: string,
): Promise<Response | null> {
  const user = c.get("user");
  const access = await checkCourseAccessById(courseId, user.id);
  if (access.hasAccess) return null;

  return c.json({ success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" }, 403);
}

const courseIdSchema = z
  .string()
  .min(1, "courseId обязателен")
  .refine(
    (value) =>
      z.string().cuid().safeParse(value).success || z.string().uuid().safeParse(value).success,
    {
      message: "courseId должен быть CUID или UUID",
    },
  );

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
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  platform: rewardedPlatformSchema.optional(),
  createIfMissing: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

trainingRoutes.get("/day", zValidator("query", dayQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseType, dayOnCourseId, createIfMissing, platform } = c.req.valid("query");

    const result = await getTrainingDayWithMonetizedSteps(user.id, courseType, dayOnCourseId, {
      createIfMissing,
      platform: getRewardedPlatform(c, platform),
    });

    if (!result) {
      const access = await checkCourseAccess(courseType, user.id);
      if (!access.hasAccess) {
        return c.json({ success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" }, 403);
      }
      return c.json({ success: false, error: "День тренировки не найден", code: "NOT_FOUND" }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === "PERSONALIZATION_REQUIRED") {
      return c.json(
        {
          success: false,
          error: "Для этого курса нужно заполнить персонализацию",
          code: "PERSONALIZATION_REQUIRED",
        },
        428,
      );
    }
    logger.error("Error fetching training day", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/start ====================
const startStepBodySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  status: z.literal("IN_PROGRESS").optional(),
  durationSec: z.number().int().min(0, "durationSec >= 0"),
});

trainingRoutes.post("/step/start", zValidator("json", startStepBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseId, dayOnCourseId, stepIndex, durationSec } = c.req.valid("json");
    const courseAccessResponse = await requireCourseAccessByCourseId(c, courseId);
    if (courseAccessResponse) return courseAccessResponse;
    const rewardedAccessResponse = await requireRewardedStepAccess(c, { dayOnCourseId, stepIndex });
    if (rewardedAccessResponse) return rewardedAccessResponse;

    const result = await updateStepAndDay(user.id, dayOnCourseId, stepIndex, {
      type: "start",
      remainingSec: durationSec,
    });
    try {
      await syncUserCourseStatusFromDays(user.id, result.courseId);
    } catch (syncErr) {
      logger.error("Error syncing course status after step/start", syncErr as Error);
    }

    // Ставим отложенный пуш «Время вышло» в очередь (fire-and-forget)
    void createStepNotificationForStepStart(user.id, dayOnCourseId, stepIndex, durationSec).catch(
      (notifErr) => {
        logger.error("Error creating step notification (step/start)", notifErr as Error, {
          userId: user.id,
          dayOnCourseId,
          stepIndex,
        });
      },
    );

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "DayOnCourse or day not found") {
      return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
    }
    if (error instanceof Error && error.message === "Step not found") {
      return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
    }
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error starting step", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/pause ====================
const pauseStepBodySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  timeLeftSec: z.number().int().min(0, "timeLeftSec >= 0"),
});

trainingRoutes.post("/step/pause", zValidator("json", pauseStepBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseId, dayOnCourseId, stepIndex, timeLeftSec } = c.req.valid("json");
    const courseAccessResponse = await requireCourseAccessByCourseId(c, courseId);
    if (courseAccessResponse) return courseAccessResponse;
    const rewardedAccessResponse = await requireRewardedStepAccess(c, { dayOnCourseId, stepIndex });
    if (rewardedAccessResponse) return rewardedAccessResponse;

    const result = await updateStepAndDay(user.id, dayOnCourseId, stepIndex, {
      type: "pause",
      remainingSec: timeLeftSec,
    });
    try {
      await syncUserCourseStatusFromDays(user.id, result.courseId);
    } catch (syncErr) {
      logger.error("Error syncing course status after step/pause", syncErr as Error);
    }

    // Очищаем job из push-очереди при постановке таймера на паузу
    try {
      const day = await getDayFromDayOnCourseId(dayOnCourseId);
      await pauseStepNotification(user.id, day, stepIndex, timeLeftSec);
    } catch (notifErr) {
      logger.error("Error pausing step notification (step/pause)", notifErr as Error, {
        userId: user.id,
        dayOnCourseId,
        stepIndex,
      });
    }

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "DayOnCourse or day not found") {
      return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
    }
    if (error instanceof Error && error.message === "Step not found") {
      return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
    }
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error pausing step", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/resume ====================
const resumeStepBodySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
});

trainingRoutes.post("/step/resume", zValidator("json", resumeStepBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseId, dayOnCourseId, stepIndex } = c.req.valid("json");
    const courseAccessResponse = await requireCourseAccessByCourseId(c, courseId);
    if (courseAccessResponse) return courseAccessResponse;
    const rewardedAccessResponse = await requireRewardedStepAccess(c, { dayOnCourseId, stepIndex });
    if (rewardedAccessResponse) return rewardedAccessResponse;

    const result = await updateStepAndDay(user.id, dayOnCourseId, stepIndex, { type: "resume" });
    try {
      await syncUserCourseStatusFromDays(user.id, result.courseId);
    } catch (syncErr) {
      logger.error("Error syncing course status after step/resume", syncErr as Error);
    }

    // Возвращаем отложенный push-job в очередь при возобновлении
    try {
      const day = await getDayFromDayOnCourseId(dayOnCourseId);
      await resumeStepNotification(user.id, day, stepIndex, 0, dayOnCourseId);
    } catch (notifErr) {
      logger.error("Error resuming step notification (step/resume)", notifErr as Error, {
        userId: user.id,
        dayOnCourseId,
        stepIndex,
      });
    }

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "DayOnCourse or day not found") {
      return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
    }
    if (error instanceof Error && error.message === "Step not found") {
      return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
    }
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error resuming step", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/reset ====================
const resetStepBodySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  durationSec: z.number().int().min(0, "durationSec >= 0").optional(),
});

trainingRoutes.post("/step/reset", zValidator("json", resetStepBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseId, dayOnCourseId, stepIndex } = c.req.valid("json");
    const courseAccessResponse = await requireCourseAccessByCourseId(c, courseId);
    if (courseAccessResponse) return courseAccessResponse;
    const rewardedAccessResponse = await requireRewardedStepAccess(c, { dayOnCourseId, stepIndex });
    if (rewardedAccessResponse) return rewardedAccessResponse;

    const result = await updateStepAndDay(user.id, dayOnCourseId, stepIndex, { type: "reset" });
    try {
      await syncUserCourseStatusFromDays(user.id, result.courseId);
    } catch (syncErr) {
      logger.error("Error syncing course status after step/reset", syncErr as Error);
    }

    // Полностью удаляем уведомление и job при рестарте шага
    try {
      const day = await getDayFromDayOnCourseId(dayOnCourseId);
      await resetStepNotification(user.id, day, stepIndex);
    } catch (notifErr) {
      logger.error("Error resetting step notification (step/reset)", notifErr as Error, {
        userId: user.id,
        dayOnCourseId,
        stepIndex,
      });
    }

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "DayOnCourse or day not found") {
      return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
    }
    if (error instanceof Error && error.message === "Step not found") {
      return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
    }
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    if (error instanceof Error && error.message.startsWith("INVALID_STATE")) {
      return c.json(
        {
          success: false,
          error: error.message.includes("not started")
            ? "Нельзя сбросить шаг, который не начат"
            : "Нельзя сбросить завершённый шаг",
          code: "INVALID_STATE",
        },
        400,
      );
    }
    logger.error("Error resetting step", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/complete/practice ====================
const completePracticeBodySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
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
      const { courseId, dayOnCourseId, stepIndex } = c.req.valid("json");
      const courseAccessResponse = await requireCourseAccessByCourseId(c, courseId);
      if (courseAccessResponse) return courseAccessResponse;
      const rewardedAccessResponse = await requireRewardedStepAccess(c, {
        dayOnCourseId,
        stepIndex,
      });
      if (rewardedAccessResponse) return rewardedAccessResponse;

      const result = await updateStepAndDay(user.id, dayOnCourseId, stepIndex, {
        type: "complete",
      });
      try {
        await syncUserCourseStatusFromDays(user.id, result.courseId);
      } catch (syncErr) {
        logger.error("Error syncing course status after step/complete/practice", syncErr as Error);
      }

      return c.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "DayOnCourse or day not found") {
        return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
      }
      if (error instanceof Error && error.message === "Step not found") {
        return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
      }
      if (isSubscriptionOrCreditsRequiredError(error)) {
        return subscriptionOrCreditsResponse(c);
      }
      logger.error("Error completing practice step", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);

const completeTheoryBodySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  stepTitle: z.string().optional(),
  stepOrder: z.number().int().min(0).optional(),
});

trainingRoutes.post(
  "/step/complete/theory",
  zValidator("json", completeTheoryBodySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const { courseId, dayOnCourseId, stepIndex } = c.req.valid("json");
      const courseAccessResponse = await requireCourseAccessByCourseId(c, courseId);
      if (courseAccessResponse) return courseAccessResponse;
      const rewardedAccessResponse = await requireRewardedStepAccess(c, {
        dayOnCourseId,
        stepIndex,
      });
      if (rewardedAccessResponse) return rewardedAccessResponse;

      const validation = await validateTheoryStepForCompletion(dayOnCourseId, stepIndex);
      if (!validation.valid) {
        const status = validation.code === "NOT_FOUND" ? 404 : 400;
        return c.json({ success: false, error: validation.error, code: validation.code }, status);
      }

      const result = await updateStepAndDay(user.id, dayOnCourseId, stepIndex, {
        type: "complete",
      });
      await syncUserCourseStatusFromDays(user.id, result.courseId);

      return c.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "DayOnCourse or day not found") {
        return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
      }
      if (error instanceof Error && error.message === "Step not found") {
        return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
      }
      if (isSubscriptionOrCreditsRequiredError(error)) {
        return subscriptionOrCreditsResponse(c);
      }
      logger.error("Error completing theory step", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);

const postDiaryBodySchema = z.object({
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  content: z.string().trim().min(1, "content обязателен").max(10000, "Слишком длинная запись"),
});

trainingRoutes.post("/diary", zValidator("json", postDiaryBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { dayOnCourseId, content } = c.req.valid("json");
    const result = await saveDiaryEntry(user.id, dayOnCourseId, content);

    if (!result.success) {
      const isForbidden = result.error === "Нет доступа к курсу";
      return c.json({ success: false, error: result.error }, isForbidden ? 403 : 400);
    }

    return c.json({ success: true });
  } catch (error) {
    logger.error("Error saving diary entry", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

const getDiaryQuerySchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
  upToDayOnCourseId: z.string().cuid("upToDayOnCourseId должен быть CUID").optional(),
});

trainingRoutes.get("/diary", zValidator("query", getDiaryQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseId, upToDayOnCourseId } = c.req.valid("query");
    const result = await getDiaryEntries(user.id, courseId, upToDayOnCourseId);

    if (result.error) {
      return c.json({ success: false, error: result.error }, 403);
    }

    return c.json({ success: true, data: { entries: result.entries } });
  } catch (error) {
    logger.error("Error getting diary entries", error as Error);
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
        logger.error(
          "[training/video/url] Пользователь не найден в контексте",
          new Error("training/video/url: no user in context"),
        );
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

    await requirePremiumOrRewardedAccessForVideoUrl({
      userId: user.id,
      platform: getRewardedPlatform(c),
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

    // Для CDN видео ищем TrainerVideo и получаем signed URL
    const isCDNVideo =
      videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
      videoUrl.includes("storage.yandexcloud.net/gafus-media");

    if (isCDNVideo) {
      const videoId = extractVideoIdFromCdnUrl(videoUrl);
      if (!videoId) {
        logger.warn("[training/video/url] Не удалось извлечь videoId из CDN URL", {
          videoUrl: videoUrl.substring(0, 100),
        });
        return c.json(
          { success: false, error: "Некорректный URL видео", code: "INVALID_URL" },
          400,
        );
      }

      let playbackAccess: VideoPlaybackAccess;
      try {
        playbackAccess = await getCachedVideoPlaybackAccess(user.id, videoId);
      } catch (error) {
        logger.error("[training/video/url] Ошибка поиска видео в БД", error as Error, { videoId });
        return c.json(
          { success: false, error: "Ошибка поиска видео в базе данных", code: "DATABASE_ERROR" },
          500,
        );
      }

      const { video, hasAccess } = playbackAccess;

      if (!video || video.transcodingStatus !== "COMPLETED" || !video.hlsManifestPath) {
        logger.warn("[training/video/url] Видео не найдено или ещё обрабатывается", {
          videoId,
          transcodingStatus: video?.transcodingStatus ?? "unknown",
        });
        return c.json(
          { success: false, error: "Видео не найдено или ещё обрабатывается", code: "NOT_FOUND" },
          404,
        );
      }

      if (!hasAccess) {
        logger.warn("[training/video/url] Нет доступа к видео", {
          userId: user.id,
          videoId,
        });
        return c.json(
          { success: false, error: "Недостаточно прав для просмотра видео", code: "FORBIDDEN" },
          403,
        );
      }

      try {
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

        const videoAccessService = getVideoAccessService();
        const token = videoAccessService.generateToken({
          videoId,
          userId: user.id,
          ttlMinutes: VIDEO_PLAYBACK_TOKEN_TTL_MINUTES,
        });

        const apiUrl =
          process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://api.gafus.ru";
        // .m3u8 в пути нужен для нативных плееров (iOS/Android), иначе возможна ошибка "Operation Stopped"
        const signedUrl = `${apiUrl}/api/v1/training/video/${videoId}/manifest.m3u8?token=${token}`;
        const posterUrl = video.thumbnailPath
          ? await getSignedDownloadUrl(video.thumbnailPath, HLS_DIRECT_RESOURCE_TTL_SECONDS)
          : undefined;
        logger.info("[training/video/url] Сгенерирован signed URL", {
          videoId,
          apiUrl,
        });
        return c.json({ success: true, data: { url: signedUrl, videoId, posterUrl } });
      } catch (error) {
        logger.error("[training/video/url] Ошибка генерации signed URL", error as Error, {
          videoId,
          userId: user.id,
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

    // Для других URL возвращаем как есть
    logger.info("[training/video/url] Неизвестный тип видео, возвращаем как есть", { videoUrl });
    return c.json({ success: true, data: { url: videoUrl } });
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }

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

const videoIdParamSchema = z.object({
  videoId: z.string().trim().min(1, "videoId обязателен").max(128, "videoId слишком длинный"),
});
const videoProgressBodySchema = z.object({
  positionSec: z
    .number()
    .int()
    .min(0)
    .max(86400 * 24),
});

// ==================== GET /training/video/:videoId/progress ====================
trainingRoutes.get(
  "/video/:videoId/progress",
  zValidator("param", videoIdParamSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const { videoId } = c.req.valid("param");
      const { hasAccess } = await getCachedVideoPlaybackAccess(user.id, videoId);
      if (!hasAccess) {
        return c.json(
          { success: false, error: "Недостаточно прав для просмотра видео", code: "FORBIDDEN" },
          403,
        );
      }

      const progress = await getProgress(user.id, videoId);
      return c.json({ success: true, data: progress });
    } catch (error) {
      logger.error("[training/video/progress] Ошибка получения прогресса", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);

// ==================== POST /training/video/:videoId/progress ====================
trainingRoutes.post(
  "/video/:videoId/progress",
  zValidator("param", videoIdParamSchema),
  zValidator("json", videoProgressBodySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const { videoId } = c.req.valid("param");
      const { positionSec } = c.req.valid("json");
      const { hasAccess } = await getCachedVideoPlaybackAccess(user.id, videoId);
      if (!hasAccess) {
        return c.json(
          { success: false, error: "Недостаточно прав для просмотра видео", code: "FORBIDDEN" },
          403,
        );
      }

      const result = await saveProgress(user.id, videoId, positionSec);
      if (!result.success) {
        return c.json(
          { success: false, error: result.error ?? "Не удалось сохранить прогресс" },
          400,
        );
      }
      return c.json({ success: true });
    } catch (error) {
      logger.error("[training/video/progress] Ошибка сохранения прогресса", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);

// ==================== GET /training/video/:videoId/manifest[.m3u8] ====================
// Получить HLS манифест с подписанными URL для сегментов (для мобильного приложения)
async function handleVideoManifest(c: Context) {
  try {
    const videoId = c.req.param("videoId");

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

    const playbackAccess = await getCachedVideoPlaybackAccess(tokenData.userId, videoId);
    const { video, hasAccess } = playbackAccess;

    if (!video) {
      return c.json({ success: false, error: "Видео не найдено" }, 404);
    }

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

    if (!hasAccess) {
      return c.json(
        { success: false, error: "Недостаточно прав для просмотра видео", code: "FORBIDDEN" },
        403,
      );
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

    const baseDir = video.hlsManifestPath.split("/").slice(0, -1).join("/");
    const modifiedManifest = await createProtectedHlsManifest({
      content: manifestContent,
      baseDir,
      apiUrl,
      videoId,
      token,
    });

    logger.info("[training/video/:videoId/manifest] Манифест модифицирован", {
      videoId,
      originalLines: manifestContent.split("\n").length,
      modifiedLines: modifiedManifest.split("\n").length,
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
}

trainingRoutes.get("/video/:videoId/manifest", handleVideoManifest);
trainingRoutes.get("/video/:videoId/manifest.m3u8", handleVideoManifest);

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

    const safeSegmentPath = validateHlsSegmentPath(segmentPath);
    if (!safeSegmentPath) {
      return c.json(
        {
          success: false,
          error: "Недопустимый путь к сегменту",
          code: "INVALID_SEGMENT_PATH",
        },
        400,
      );
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

    const playbackAccess = await getCachedVideoPlaybackAccess(tokenData.userId, videoId);
    const { video, hasAccess } = playbackAccess;

    if (!video || video.transcodingStatus !== "COMPLETED" || !video.hlsManifestPath) {
      return c.json({ success: false, error: "Видео не найдено или не готово" }, 404);
    }

    if (!hasAccess) {
      return c.json(
        { success: false, error: "Недостаточно прав для просмотра видео", code: "FORBIDDEN" },
        403,
      );
    }

    // Формируем полный путь к сегменту относительно манифеста
    // resource path может быть только именем файла из HLS-манифеста.
    const baseDir = video.hlsManifestPath.split("/").slice(0, -1).join("/");
    const fullSegmentPath = `${baseDir}/${safeSegmentPath}`;

    // В ABR master playlist ссылается на media playlist. Его также авторизуем через API,
    // а тяжёлые сегменты внутри уже выдаём прямыми подписанными URL Object Storage.
    if (safeSegmentPath.endsWith(".m3u8")) {
      const playlistBuffer = await downloadFileFromCDN(fullSegmentPath);
      const apiUrl =
        process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://api.gafus.ru";
      const playlist = await createProtectedHlsManifest({
        content: playlistBuffer.toString("utf-8"),
        baseDir,
        apiUrl,
        videoId,
        token,
      });
      return new Response(playlist, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "private, no-store",
        },
      });
    }

    // Fallback для старых уже выданных манифестов. Новые клиенты получают прямые
    // presigned Object Storage URLs и не гоняют медиатрафик через API.
    const rangeHeader = c.req.header("range");
    const validRange =
      rangeHeader?.startsWith("bytes=") && !rangeHeader.includes(",") ? rangeHeader : undefined;
    const { stream, contentLength, contentType, contentRange, isPartialContent } =
      await streamFileFromCDN(fullSegmentPath, validRange);

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Length": contentLength.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    };
    if (contentRange) {
      responseHeaders["Content-Range"] = contentRange;
    }

    return new Response(stream as unknown as BodyInit, {
      status: isPartialContent ? 206 : 200,
      headers: responseHeaders,
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
