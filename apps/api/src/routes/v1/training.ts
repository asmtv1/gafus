/**
 * Training Routes
 * Endpoints для работы с тренировками
 */
import { type Context, Hono, type TypedResponse } from "hono";
import type {
  DiaryRead,
  TrainingDayRead,
  TrainingDaysRead,
} from "../../../../../packages/types/src/data/training";
import { z } from "zod/v3";
import { zValidator } from "@hono/zod-validator";

import {
  requireCourseStepOperationAccess,
  syncUserCourseStatusFromDays,
  validateTheoryStepForCompletion,
  withOnlineStepBinding,
} from "@gafus/core/services/training";
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
  createBoundStepNotificationForStart,
  pauseBoundStepNotification,
  resumeBoundStepNotification,
  resetBoundStepNotification,
  type BoundStepNotification,
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
import {
  localLegacyTrainingVideoEnabled,
  localLegacyTrainerVideoUrl,
  readLocalLegacyTrainerPlaylist,
  readLocalLegacyTrainerVideo,
} from "../../lib/localLegacyTrainingVideo";
import { readTrainingDayApplication } from "../../modules/training/composition/read-training-day.js";
import { readTrainingDaysApplication } from "../../modules/training/composition/read-training-days.js";
import { readDiaryApplication } from "../../modules/training/composition/read-diary.js";
import { writeDiaryApplication } from "../../modules/training/composition/write-diary.js";
import { writeStepProgressApplication } from "../../modules/training/composition/write-step-progress.js";

const logger = createWebLogger("api-training");

const HLS_SEGMENT_FILE_PATTERN = /^[a-zA-Z0-9._-]+\.(ts|m4s|mp4|m3u8|vtt|aac)$/;
const PLAYBACK_ACCESS_CACHE_TTL_MS = 60_000;
const PLAYBACK_ACCESS_DENIED_CACHE_TTL_MS = 10_000;
const HLS_DIRECT_RESOURCE_TTL_SECONDS = VIDEO_PLAYBACK_TOKEN_TTL_MINUTES * 60;

/** Local browser uses same-origin Vite proxy; native localhost calls use API port. */
function trainingVideoApiUrl(c: Context): string {
  if (localLegacyTrainingVideoEnabled()) {
    const host = c.req.header("host")?.toLowerCase();
    // The isolated trainer Vite shell also reverse-proxies /api/v1 on 5175.
    // Keep HLS segments same-origin so browsers do not require cross-origin credentials.
    return ["127.0.0.1:5173", "localhost:5173", "127.0.0.1:5175", "localhost:5175"]
      .includes(host ?? "") ? "" : "http://127.0.0.1:3001";
  }
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://api.gafus.ru";
}

async function trainingVideoPlaylist(path: string): Promise<Buffer> {
  return localLegacyTrainingVideoEnabled()
    ? readLocalLegacyTrainerPlaylist(path)
    : downloadFileFromCDN(path);
}

async function trainingVideoPoster(path: string, ttl: number): Promise<string> {
  return localLegacyTrainingVideoEnabled()
    ? localLegacyTrainerVideoUrl(path)
    : getSignedDownloadUrl(path, ttl);
}

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
  if (cached && cached.expiresAt > now) {
    // Cache only immutable video metadata. Entitlements can be revoked at any
    // time (subscription expiry, private assignment removal, rewarded expiry).
    return {
      video: cached.value.video,
      hasAccess: cached.value.video ? await checkVideoAccess({ userId, videoId }) : false,
    };
  }

  const existingRequest = playbackAccessInFlight.get(key);
  if (existingRequest) {
    const pending = await existingRequest;
    return {
      video: pending.video,
      hasAccess: pending.video ? await checkVideoAccess({ userId, videoId }) : false,
    };
  }

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
  const { content, apiUrl, videoId, token } = params;
  return rewriteHlsManifest(content, async (rawPath) => {
    const safePath = validateHlsSegmentPath(rawPath);
    if (!safePath) throw new Error(`Недопустимый HLS resource path: ${rawPath}`);
    // All playlist resources use the authenticated Hono stream. Direct signed
    // storage URLs may return 200 but are unreadable by hls.js when the bucket
    // has no Origin CORS allowance (the player stalls at 0:00). The stream
    // endpoint already validates the token, entitlement, filename and Range.
    return `${apiUrl}/api/v1/training/video/${videoId}/segment?path=${encodeURIComponent(safePath)}&token=${encodeURIComponent(token)}`;
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

function invalidStepStateResponse(c: Context, error: unknown): Response | null {
  if (error instanceof Error && error.message === "STALE_STEP_BINDING") {
    return c.json(
      {
        success: false,
        error: "Состав дня изменился. Обновите страницу.",
        code: "STALE_STEP_BINDING",
      },
      409,
    );
  }
  if (!(error instanceof Error) || !error.message.startsWith("INVALID_STATE")) return null;
  return c.json(
    {
      success: false,
      error: "Состояние шага уже изменилось. Обновите страницу.",
      code: "INVALID_STATE",
    },
    409,
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

async function requireStepMutationAccess(
  c: Context,
  input: {
    courseId: string;
    dayOnCourseId: string;
    stepIndex: number;
    expectedStepOnDayId?: string;
    expectedStepId?: string;
  },
): Promise<Response | null> {
  const user = c.get("user");
  try {
    await requireCourseStepOperationAccess({
      userId: user.id,
      platform: getRewardedPlatform(c),
      expectedCourseId: input.courseId,
      dayOnCourseId: input.dayOnCourseId,
      stepIndex: input.stepIndex,
      expectedStepOnDayId: input.expectedStepOnDayId,
      expectedStepId: input.expectedStepId,
    });
    return null;
  } catch (error) {
    const stale = invalidStepStateResponse(c, error);
    if (stale) return stale;
    if (
      error instanceof Error &&
      (error.message === "COURSE_ACCESS_DENIED" || error.message === "COURSE_DAY_MISMATCH")
    ) {
      return c.json({ success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" }, 403);
    }
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    throw error;
  }
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

    const result = await readTrainingDaysApplication.execute({
      actorUserId: user.id,
      courseType: type,
    });
    return c.json({ success: true, data: result }) satisfies Response &
      TypedResponse<TrainingDaysRead>;
  } catch (error) {
    if (error instanceof Error && error.message === "COURSE_ACCESS_DENIED") {
      return c.json({ success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" }, 403);
    }
    logger.error("Error fetching training days", new Error("TRAINING_DAYS_READ_FAILED"));
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

    const result = await readTrainingDayApplication.execute({
      actorUserId: user.id,
      courseType,
      dayOnCourseId,
      options: {
        createIfMissing,
        platform: getRewardedPlatform(c, platform),
      },
    });

    if (result.kind === "forbidden") {
      return c.json({ success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" }, 403);
    }
    if (result.kind === "not_found") {
      return c.json({ success: false, error: "День тренировки не найден", code: "NOT_FOUND" }, 404);
    }

    // Web-only opt-in; the application/Core projection is read-only and fails
    // closed to the unchanged Native DTO on stale state or concurrent writes.
    if (c.req.header("X-Gafus-Web-Step-Binding") === "1") {
      const bound = await withOnlineStepBinding(user.id, dayOnCourseId, result.detail);
      return c.json({ success: true, data: bound });
    }
    return c.json({ success: true, data: result.detail }) satisfies Response &
      TypedResponse<TrainingDayRead>;
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
    logger.error("Error fetching training day", new Error("TRAINING_DAY_READ_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// Only opted-in Web sends both original Step.id and stable StepOnDay.id.
// Existing Native packets omit both optional fields and stay unchanged.
const stepBindingBodyFields = {
  expectedStepOnDayId: z.string().min(1).max(128).optional(),
  expectedStepId: z.string().min(1).max(128).optional(),
};
type StepBindingFields = { expectedStepOnDayId?: string; expectedStepId?: string };
function parseStepBinding(
  c: Context,
  body: StepBindingFields,
): { expectedStepOnDayId: string; expectedStepId: string } | Response | undefined {
  if (body.expectedStepOnDayId === undefined && body.expectedStepId === undefined) return undefined;
  if (!body.expectedStepOnDayId || !body.expectedStepId) {
    return c.json(
      { success: false, code: "INVALID_STEP_BINDING", error: "Неполная привязка шага" },
      400,
    );
  }
  return { expectedStepOnDayId: body.expectedStepOnDayId, expectedStepId: body.expectedStepId };
}

/** Stable notification target from the actual acknowledged mutation, never
 * the mutable day stepIndex. Original old-client notification path is untouched. */
function boundNotificationTarget(
  dayOnCourseId: string,
  result: { stepOnDayId?: string; stepId?: string },
  binding: { expectedStepOnDayId: string; expectedStepId: string },
): BoundStepNotification {
  return {
    dayOnCourseId,
    stepOnDayId: result.stepOnDayId ?? binding.expectedStepOnDayId,
    stepId: result.stepId ?? binding.expectedStepId,
  };
}

// ==================== POST /training/step/start ====================
const startStepBodySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  ...stepBindingBodyFields,
  status: z.literal("IN_PROGRESS").optional(),
  durationSec: z.number().int().min(0, "durationSec >= 0"),
});

trainingRoutes.post("/step/start", zValidator("json", startStepBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseId, dayOnCourseId, stepIndex, durationSec } = c.req.valid("json");
    const binding = parseStepBinding(c, c.req.valid("json"));
    if (binding instanceof Response) return binding;
    const accessResponse = await requireStepMutationAccess(c, {
      courseId,
      dayOnCourseId,
      stepIndex,
      ...(binding ? binding : {}),
    });
    if (accessResponse) return accessResponse;

    const result = await writeStepProgressApplication.execute(
      user.id,
      dayOnCourseId,
      stepIndex,
      {
        type: "start",
        remainingSec: durationSec,
      },
      binding ? { ...binding, expectedCourseId: courseId } : undefined,
    );
    try {
      await syncUserCourseStatusFromDays(user.id, result.courseId);
    } catch {
      logger.error(
        "Error syncing course status after step/start",
        new Error("TRAINING_STEP_START_SYNC_FAILED"),
      );
    }

    // Strict isolated WORK fault injection: the REAL Core progress and durable
    // StepNotification SQL intent have committed, but no Redis add was made.
    // Only the specifically leased synthetic actor and explicit local-mode
    // runner can exercise this. Never available on normal/prod Hono startup.
    if (
      binding &&
      result.stepJustStarted &&
      process.env.NODE_ENV === "development" &&
      process.env.GAFUS_LOCAL_ISOLATED_API === "1" &&
      process.env.AG1_OUTBOX_FAULT_USER_ID === user.id &&
      process.env.AG1_OUTBOX_FAULT_AFTER_SQL_COMMIT === "1"
    ) {
      return c.json({ success: false, code: "LOCAL_OUTBOX_FAULT_AFTER_SQL_COMMIT" }, 503);
    }

    // Ставим отложенный пуш «Время вышло» в очередь (fire-and-forget)
    // Bound duplicate start is a no-op in Core: do not schedule another event.
    if (!binding || result.stepJustStarted !== false) {
      const notificationStart = binding
        ? createBoundStepNotificationForStart(
            user.id,
            boundNotificationTarget(dayOnCourseId, result, binding),
            durationSec,
          )
        : createStepNotificationForStepStart(user.id, dayOnCourseId, stepIndex, durationSec);
      void notificationStart.catch(() => {
        logger.error(
          "Error creating step notification (step/start)",
          new Error("TRAINING_STEP_START_NOTIFICATION_FAILED"),
        );
      });
    }

    return c.json({ success: true });
  } catch (error) {
    const invalidState = invalidStepStateResponse(c, error);
    if (invalidState) return invalidState;
    if (error instanceof Error && error.message === "DayOnCourse or day not found") {
      return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
    }
    if (error instanceof Error && error.message === "Step not found") {
      return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
    }
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error starting step", new Error("TRAINING_STEP_START_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/pause ====================
const pauseStepBodySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  ...stepBindingBodyFields,
  timeLeftSec: z.number().int().min(0, "timeLeftSec >= 0"),
});

trainingRoutes.post("/step/pause", zValidator("json", pauseStepBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseId, dayOnCourseId, stepIndex, timeLeftSec } = c.req.valid("json");
    const binding = parseStepBinding(c, c.req.valid("json"));
    if (binding instanceof Response) return binding;
    const accessResponse = await requireStepMutationAccess(c, {
      courseId,
      dayOnCourseId,
      stepIndex,
      ...(binding ? binding : {}),
    });
    if (accessResponse) return accessResponse;

    const result = await writeStepProgressApplication.execute(
      user.id,
      dayOnCourseId,
      stepIndex,
      {
        type: "pause",
        remainingSec: timeLeftSec,
      },
      binding ? { ...binding, expectedCourseId: courseId } : undefined,
    );
    try {
      await syncUserCourseStatusFromDays(user.id, result.courseId);
    } catch {
      logger.error(
        "Error syncing course status after step/pause",
        new Error("TRAINING_STEP_PAUSE_SYNC_FAILED"),
      );
    }

    // Очищаем job из push-очереди при постановке таймера на паузу
    try {
      if (binding)
        await pauseBoundStepNotification(
          user.id,
          boundNotificationTarget(dayOnCourseId, result, binding),
          timeLeftSec,
        );
      else {
        const day = await getDayFromDayOnCourseId(dayOnCourseId);
        await pauseStepNotification(user.id, day, stepIndex, timeLeftSec);
      }
    } catch {
      logger.error(
        "Error pausing step notification (step/pause)",
        new Error("TRAINING_STEP_PAUSE_NOTIFICATION_FAILED"),
      );
    }

    return c.json({ success: true });
  } catch (error) {
    const invalidState = invalidStepStateResponse(c, error);
    if (invalidState) return invalidState;
    if (error instanceof Error && error.message === "DayOnCourse or day not found") {
      return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
    }
    if (error instanceof Error && error.message === "Step not found") {
      return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
    }
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error pausing step", new Error("TRAINING_STEP_PAUSE_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/resume ====================
const resumeStepBodySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  ...stepBindingBodyFields,
});

trainingRoutes.post("/step/resume", zValidator("json", resumeStepBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseId, dayOnCourseId, stepIndex } = c.req.valid("json");
    const binding = parseStepBinding(c, c.req.valid("json"));
    if (binding instanceof Response) return binding;
    const accessResponse = await requireStepMutationAccess(c, {
      courseId,
      dayOnCourseId,
      stepIndex,
      ...(binding ? binding : {}),
    });
    if (accessResponse) return accessResponse;

    const result = await writeStepProgressApplication.execute(
      user.id,
      dayOnCourseId,
      stepIndex,
      {
        type: "resume",
      },
      binding ? { ...binding, expectedCourseId: courseId } : undefined,
    );
    try {
      await syncUserCourseStatusFromDays(user.id, result.courseId);
    } catch {
      logger.error(
        "Error syncing course status after step/resume",
        new Error("TRAINING_STEP_RESUME_SYNC_FAILED"),
      );
    }

    // Возвращаем отложенный push-job в очередь при возобновлении
    try {
      if (binding)
        await resumeBoundStepNotification(
          user.id,
          boundNotificationTarget(dayOnCourseId, result, binding),
        );
      else {
        const day = await getDayFromDayOnCourseId(dayOnCourseId);
        await resumeStepNotification(user.id, day, stepIndex, 0, dayOnCourseId);
      }
    } catch {
      logger.error(
        "Error resuming step notification (step/resume)",
        new Error("TRAINING_STEP_RESUME_NOTIFICATION_FAILED"),
      );
    }

    return c.json({ success: true });
  } catch (error) {
    const invalidState = invalidStepStateResponse(c, error);
    if (invalidState) return invalidState;
    if (error instanceof Error && error.message === "DayOnCourse or day not found") {
      return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
    }
    if (error instanceof Error && error.message === "Step not found") {
      return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
    }
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error resuming step", new Error("TRAINING_STEP_RESUME_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/reset ====================
const resetStepBodySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  ...stepBindingBodyFields,
  durationSec: z.number().int().min(0, "durationSec >= 0").optional(),
});

trainingRoutes.post("/step/reset", zValidator("json", resetStepBodySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseId, dayOnCourseId, stepIndex } = c.req.valid("json");
    const binding = parseStepBinding(c, c.req.valid("json"));
    if (binding instanceof Response) return binding;
    const accessResponse = await requireStepMutationAccess(c, {
      courseId,
      dayOnCourseId,
      stepIndex,
      ...(binding ? binding : {}),
    });
    if (accessResponse) return accessResponse;

    const result = await writeStepProgressApplication.execute(
      user.id,
      dayOnCourseId,
      stepIndex,
      {
        type: "reset",
      },
      binding ? { ...binding, expectedCourseId: courseId } : undefined,
    );
    try {
      await syncUserCourseStatusFromDays(user.id, result.courseId);
    } catch {
      logger.error(
        "Error syncing course status after step/reset",
        new Error("TRAINING_STEP_RESET_SYNC_FAILED"),
      );
    }

    // Полностью удаляем уведомление и job при рестарте шага
    try {
      if (binding)
        await resetBoundStepNotification(
          user.id,
          boundNotificationTarget(dayOnCourseId, result, binding),
        );
      else {
        const day = await getDayFromDayOnCourseId(dayOnCourseId);
        await resetStepNotification(user.id, day, stepIndex);
      }
    } catch {
      logger.error(
        "Error resetting step notification (step/reset)",
        new Error("TRAINING_STEP_RESET_NOTIFICATION_FAILED"),
      );
    }

    return c.json({ success: true });
  } catch (error) {
    const invalidState = invalidStepStateResponse(c, error);
    if (invalidState) return invalidState;
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
    logger.error("Error resetting step", new Error("TRAINING_STEP_RESET_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/step/complete/practice ====================
const completePracticeBodySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  ...stepBindingBodyFields,
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
      const binding = parseStepBinding(c, c.req.valid("json"));
      if (binding instanceof Response) return binding;
      const accessResponse = await requireStepMutationAccess(c, {
        courseId,
        dayOnCourseId,
        stepIndex,
        ...(binding ? binding : {}),
      });
      if (accessResponse) return accessResponse;

      const result = await writeStepProgressApplication.execute(
        user.id,
        dayOnCourseId,
        stepIndex,
        {
          type: "complete",
        },
        binding ? { ...binding, expectedCourseId: courseId } : undefined,
      );
      try {
        await syncUserCourseStatusFromDays(user.id, result.courseId);
      } catch {
        logger.error(
          "Error syncing course status after step/complete/practice",
          new Error("TRAINING_STEP_PRACTICE_SYNC_FAILED"),
        );
      }
      if (binding) {
        await resetBoundStepNotification(
          user.id,
          boundNotificationTarget(dayOnCourseId, result, binding),
        ).catch(() =>
          logger.error(
            "Error clearing completed step notification",
            new Error("TRAINING_STEP_COMPLETION_NOTIFICATION_FAILED"),
          ),
        );
      }

      return c.json({ success: true });
    } catch (error) {
      const invalidState = invalidStepStateResponse(c, error);
      if (invalidState) return invalidState;
      if (error instanceof Error && error.message === "DayOnCourse or day not found") {
        return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
      }
      if (error instanceof Error && error.message === "Step not found") {
        return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
      }
      if (isSubscriptionOrCreditsRequiredError(error)) {
        return subscriptionOrCreditsResponse(c);
      }
      logger.error("Error completing practice step", new Error("TRAINING_STEP_PRACTICE_FAILED"));
      return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
    }
  },
);

const completeTheoryBodySchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: z.string().cuid("dayOnCourseId должен быть CUID"),
  stepIndex: z.number().int().min(0, "stepIndex >= 0"),
  ...stepBindingBodyFields,
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
      const binding = parseStepBinding(c, c.req.valid("json"));
      if (binding instanceof Response) return binding;
      const accessResponse = await requireStepMutationAccess(c, {
        courseId,
        dayOnCourseId,
        stepIndex,
        ...(binding ? binding : {}),
      });
      if (accessResponse) return accessResponse;

      const validation = binding
        ? await validateTheoryStepForCompletion(dayOnCourseId, stepIndex, binding)
        : await validateTheoryStepForCompletion(dayOnCourseId, stepIndex);
      if (!validation.valid) {
        const status =
          validation.code === "NOT_FOUND"
            ? 404
            : validation.code === "STALE_STEP_BINDING"
              ? 409
              : 400;
        return c.json({ success: false, error: validation.error, code: validation.code }, status);
      }

      const result = await writeStepProgressApplication.execute(
        user.id,
        dayOnCourseId,
        stepIndex,
        {
          type: "complete",
        },
        binding ? { ...binding, expectedCourseId: courseId } : undefined,
      );
      await syncUserCourseStatusFromDays(user.id, result.courseId);
      if (binding) {
        await resetBoundStepNotification(
          user.id,
          boundNotificationTarget(dayOnCourseId, result, binding),
        ).catch(() =>
          logger.error(
            "Error clearing completed theory notification",
            new Error("TRAINING_STEP_THEORY_NOTIFICATION_FAILED"),
          ),
        );
      }

      return c.json({ success: true });
    } catch (error) {
      const invalidState = invalidStepStateResponse(c, error);
      if (invalidState) return invalidState;
      if (error instanceof Error && error.message === "DayOnCourse or day not found") {
        return c.json({ success: false, error: "День не найден", code: "NOT_FOUND" }, 404);
      }
      if (error instanceof Error && error.message === "Step not found") {
        return c.json({ success: false, error: "Шаг не найден", code: "NOT_FOUND" }, 404);
      }
      if (isSubscriptionOrCreditsRequiredError(error)) {
        return subscriptionOrCreditsResponse(c);
      }
      logger.error("Error completing theory step", new Error("TRAINING_STEP_THEORY_FAILED"));
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
    const result = await writeDiaryApplication.execute(user.id, dayOnCourseId, content);

    if (!result.success) {
      const isForbidden = result.error === "Нет доступа к курсу";
      return c.json({ success: false, error: result.error }, isForbidden ? 403 : 400);
    }

    return c.json({ success: true });
  } catch {
    logger.error("Error saving diary entry", new Error("TRAINING_DIARY_SAVE_FAILED"));
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
    const result = await readDiaryApplication.execute({
      actorUserId: user.id,
      courseId,
      upToDayOnCourseId,
    });

    if (result.error) {
      return c.json({ success: false, error: result.error }, 403);
    }

    return c.json({ success: true, data: { entries: result.entries } }) satisfies Response &
      TypedResponse<DiaryRead>;
  } catch {
    logger.error("Error getting diary entries", new Error("TRAINING_DIARY_READ_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /training/video/url ====================
// Получить URL для воспроизведения видео (HLS манифест)
const videoUrlSchema = z.object({
  videoUrl: z.string().min(1, "videoUrl обязателен"),
});

/**
 * Read-only preview of an already permitted private trainer video. Never
 * return a raw thumbnailPath, storage key, videoId or a playback ticket.
 * This uses exactly the existing premium/rewarded and video ownership checks.
 */
const videoPreviewQuerySchema = z.object({
  videoUrl: z.string().min(1).max(4096),
});

trainingRoutes.get("/video/preview", zValidator("query", videoPreviewQuerySchema), async (c) => {
  c.header("Cache-Control", "private, no-store, max-age=0");
  c.header("Vary", "Cookie");
  try {
    const user = c.get("user");
    if (!user?.id) return c.json({ success: false, code: "UNAUTHORIZED" }, 401);
    const { videoUrl } = c.req.valid("query");
    let storageUrl: URL;
    try {
      storageUrl = new URL(videoUrl);
    } catch {
      return c.json({ success: false, code: "INVALID_VIDEO" }, 400);
    }
    const host = storageUrl.hostname.toLowerCase();
    const storagePath = storageUrl.pathname;
    const knownStorage =
      storageUrl.protocol === "https:" &&
      !storageUrl.username &&
      !storageUrl.password &&
      !storageUrl.hash &&
      ((host === "storage.yandexcloud.net" &&
        storagePath.startsWith("/gafus-media/uploads/trainers/")) ||
        (host === "gafus-media.storage.yandexcloud.net" &&
          storagePath.startsWith("/uploads/trainers/")));
    if (!knownStorage) return c.json({ success: false, code: "INVALID_VIDEO" }, 400);
    const videoId = extractVideoIdFromCdnUrl(videoUrl);
    if (
      !videoId ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(videoId) ||
      !storagePath.includes(`/videocourses/${videoId}/`)
    ) {
      return c.json({ success: false, code: "INVALID_VIDEO" }, 400);
    }
    // Subscription, Gafus-step unlock and rewarded access are reads here;
    // do not create rewarded grants, consume credits or mutate progress.
    await requirePremiumOrRewardedAccessForVideoUrl({
      userId: user.id,
      platform: getRewardedPlatform(c),
      videoUrl,
    });
    const { video, hasAccess } = await getCachedVideoPlaybackAccess(user.id, videoId);
    if (!hasAccess) return c.json({ success: false, code: "FORBIDDEN" }, 403);
    if (
      !video ||
      video.transcodingStatus !== "COMPLETED" ||
      !video.thumbnailPath ||
      !video.hlsManifestPath
    ) {
      return c.json({ success: false, code: "NOT_FOUND" }, 404);
    }
    const posterUrl = await trainingVideoPoster(
      video.thumbnailPath,
      Math.min(HLS_DIRECT_RESOURCE_TTL_SECONDS, 300),
    );
    return c.json({ success: true, data: { posterUrl } });
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) return subscriptionOrCreditsResponse(c);
    // Sensitive provider storage keys, URL signatures and internal paths must
    // not appear in error bodies or logs. Frontend leaves a dark placeholder.
    logger.error("[training/video/preview] failure", new Error("VIDEO_PREVIEW_FAILED"));
    return c.json({ success: false, code: "PREVIEW_UNAVAILABLE" }, 503);
  }
});

trainingRoutes.post("/video/url", zValidator("json", videoUrlSchema), async (c) => {
  // Логируем сразу при входе в обработчик
  try {
    logger.info("[training/video/url] === ЗАПРОС ПОЛУЧЕН ===");

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
      logger.info("[training/video/url] Пользователь получен");
    } catch {
      logger.error(
        "[training/video/url] Ошибка получения пользователя",
        new Error("VIDEO_URL_AUTH_FAILED"),
      );
      return c.json({ success: false, error: "Ошибка авторизации", code: "AUTH_ERROR" }, 401);
    }

    // Получаем и валидируем videoUrl
    let videoUrl: string;
    try {
      const body = c.req.valid("json");
      videoUrl = body.videoUrl;
      logger.info("[training/video/url] VideoUrl получен из body");
    } catch {
      logger.error(
        "[training/video/url] Ошибка получения videoUrl из body",
        new Error("VIDEO_URL_BODY_INVALID"),
      );
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
      logger.warn("[training/video/url] videoUrl пустой или невалидный");
      return c.json(
        {
          success: false,
          error: "videoUrl обязателен",
          code: "VALIDATION_ERROR",
        },
        400,
      );
    }

    logger.info("[training/video/url] Запрос video URL");

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
      logger.info("[training/video/url] Внешнее видео, возвращаем как есть");
      return c.json({ success: true, data: { url: videoUrl } });
    }

    // Для CDN видео ищем TrainerVideo и получаем signed URL
    const isCDNVideo =
      videoUrl.includes("gafus-media.storage.yandexcloud.net") ||
      videoUrl.includes("storage.yandexcloud.net/gafus-media");

    if (isCDNVideo) {
      const videoId = extractVideoIdFromCdnUrl(videoUrl);
      if (!videoId) {
        logger.warn("[training/video/url] Не удалось извлечь videoId из CDN URL");
        return c.json(
          { success: false, error: "Некорректный URL видео", code: "INVALID_URL" },
          400,
        );
      }

      let playbackAccess: VideoPlaybackAccess;
      try {
        playbackAccess = await getCachedVideoPlaybackAccess(user.id, videoId);
      } catch {
        logger.error(
          "[training/video/url] Ошибка поиска видео в БД",
          new Error("VIDEO_URL_METADATA_FAILED"),
        );
        return c.json(
          { success: false, error: "Ошибка поиска видео в базе данных", code: "DATABASE_ERROR" },
          500,
        );
      }

      const { video, hasAccess } = playbackAccess;

      if (!video || video.transcodingStatus !== "COMPLETED" || !video.hlsManifestPath) {
        logger.warn("[training/video/url] Видео не найдено или ещё обрабатывается");
        return c.json(
          { success: false, error: "Видео не найдено или ещё обрабатывается", code: "NOT_FOUND" },
          404,
        );
      }

      if (!hasAccess) {
        logger.warn("[training/video/url] Нет доступа к видео");
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

        const apiUrl = trainingVideoApiUrl(c);
        // .m3u8 в пути нужен для нативных плееров (iOS/Android), иначе возможна ошибка "Operation Stopped"
        const signedUrl = `${apiUrl}/api/v1/training/video/${videoId}/manifest.m3u8?token=${token}`;
        const posterUrl = video.thumbnailPath
          ? await trainingVideoPoster(video.thumbnailPath, HLS_DIRECT_RESOURCE_TTL_SECONDS)
          : undefined;
        logger.info("[training/video/url] Сгенерирован signed URL");
        return c.json({ success: true, data: { url: signedUrl, videoId, posterUrl } });
      } catch {
        logger.error(
          "[training/video/url] Ошибка генерации signed URL",
          new Error("VIDEO_URL_TOKEN_GENERATION_FAILED"),
        );
        return c.json(
          {
            success: false,
            error: "Ошибка генерации signed URL",
            code: "TOKEN_GENERATION_ERROR",
          },
          500,
        );
      }
    }

    // Для других URL возвращаем как есть
    logger.info("[training/video/url] Неизвестный тип видео, возвращаем как есть");
    return c.json({ success: true, data: { url: videoUrl } });
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }

    // Never forward provider errors, signed query strings or user identifiers.
    logger.error(
      "[training/video/url] КРИТИЧЕСКАЯ ОШИБКА в обработчике",
      new Error("VIDEO_URL_REQUEST_FAILED"),
    );

    return c.json(
      {
        success: false,
        error: "Внутренняя ошибка сервера",
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
    } catch {
      logger.error(
        "[training/video/progress] Ошибка получения прогресса",
        new Error("VIDEO_PROGRESS_READ_FAILED"),
      );
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
    } catch {
      logger.error(
        "[training/video/progress] Ошибка сохранения прогресса",
        new Error("VIDEO_PROGRESS_WRITE_FAILED"),
      );
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
    });

    const manifestBuffer = await trainingVideoPlaylist(video.hlsManifestPath);
    const manifestContent = manifestBuffer.toString("utf-8");

    // Do not log raw playlist lines: they may contain signed URLs or metadata.
    logger.info("[training/video/:videoId/manifest] Манифест загружен", {
      videoId,
      manifestLength: manifestContent.length,
    });

    // Получаем base URL для формирования абсолютных URL
    const apiUrl = trainingVideoApiUrl(c);

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

    // Hono c.text() overrides Content-Type to text/plain. Safari/native HLS
    // needs the actual playlist MIME type; use a typed Response instead.
    return new Response(modifiedManifest, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch {
    // Do not expose storage/provider exception messages or stack traces in logs.
    logger.error("[training/video/:videoId/manifest] Ошибка получения манифеста", undefined, {
      videoId: c.req.param("videoId"),
      code: "HLS_MANIFEST_FETCH_FAILED",
    });
    return c.json(
      {
        success: false,
        error: "Ошибка получения манифеста",
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
      const playlistBuffer = await trainingVideoPlaylist(fullSegmentPath);
      const apiUrl = trainingVideoApiUrl(c);
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

    // Same-origin authenticated HLS streaming supports browsers where Object
    // Storage does not provide CORS, plus mobile Range seek/resume requests.
    const rangeHeader = c.req.header("range");
    const validRange =
      rangeHeader?.startsWith("bytes=") && !rangeHeader.includes(",") ? rangeHeader : undefined;
    if (localLegacyTrainingVideoEnabled()) {
      // Browser HLS fetches same-origin API URLs: public legacy storage has no
      // CORS header. This GET-only proxy never grants access without the
      // existing playback token plus the current course/video ACL checks.
      const remote = await readLocalLegacyTrainerVideo(fullSegmentPath, validRange);
      const headers: Record<string, string> = {
        "Content-Type": remote.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "private, no-store",
        "Accept-Ranges": "bytes",
      };
      for (const name of ["content-length", "content-range"] as const) {
        const value = remote.headers.get(name);
        if (value) headers[name] = value;
      }
      return new Response(remote.body, { status: remote.status, headers });
    }
    const { stream, contentLength, contentType, contentRange, isPartialContent } =
      await streamFileFromCDN(fullSegmentPath, validRange);

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Length": contentLength.toString(),
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
    };
    if (contentRange) {
      responseHeaders["Content-Range"] = contentRange;
    }

    return new Response(stream as unknown as BodyInit, {
      status: isPartialContent ? 206 : 200,
      headers: responseHeaders,
    });
  } catch {
    // Segment paths and provider errors may include private object/storage details.
    logger.error("[training/video/:videoId/segment] Ошибка получения сегмента", undefined, {
      videoId: c.req.param("videoId"),
      code: "HLS_SEGMENT_FETCH_FAILED",
    });
    return c.json(
      {
        success: false,
        error: "Ошибка получения сегмента",
        code: "INTERNAL_SERVER_ERROR",
      },
      500,
    );
  }
});
