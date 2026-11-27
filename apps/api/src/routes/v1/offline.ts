import { saveProgressJournalTx } from "@gafus/course-server/video-progress";
import { checkVideoAccess } from "../../modules/video/composition/video-access.js";
import { readOfflineProgressVersions } from "@gafus/course-progress-server/offline-mutation-rows";
import { subscriptionAccessPort } from "../../modules/app-subscription/composition/subscription-access-instance.js";
import type { PreventionRowsPort } from "@gafus/core/services/petPrevention";
/**
 * Offline Routes
 * Endpoints для работы с офлайн-данными курсов
 */
import { Hono } from "hono";
import { z } from "zod/v3";
import { zValidator } from "@hono/zod-validator";

import {
  getCourseVersion,
  checkCourseUpdates,
  downloadFullCourse,
} from "@gafus/course-read-server/offline-application";
import { applyDailyCourseStepAndDayTx } from "../../modules/daily-course/composition/dailyCourseApplication.js";
import { sqlTraining } from "../../modules/training/composition/sql-training-instance.js";
import { offlineMutationRows } from "../../modules/offline/composition/offline-mutation-rows-instance.js";
import { preventionRows as defaultPreventionRows } from "../../modules/pet-prevention/composition/prevention-rows-instance.js";
import { batchEntrySchema } from "@gafus/core/services/petPrevention";
// Journal exports are loaded ONLY for v2 requests: a mixed-version API
// process with an older @gafus/core build must still start legacy offline.
import {
  getAppSubscriptionAccess,
  isOfflineCourseDownloadIncludedPlanCode,
} from "@gafus/core/services/appSubscription";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-offline");

import type { TrainingServiceApi } from "@gafus/core/services/training";
import type { OfflineMutationRowsPort, DailyJournalPort, VideoJournalPort } from "@gafus/core/services/offline";
export type OfflineRouteTrainingPort = Pick<TrainingServiceApi,
  "getTrainingDays" | "requireCourseStepOperationAccess" | "applyStepDayAndCourseTx"> & {
  /** Supplied by app.ts; compatibility-only callers can omit it temporarily. */
  journalRows?: OfflineMutationRowsPort;
  dailyJournal?: DailyJournalPort;
  videoJournal?: VideoJournalPort;
  canAccessVideo?: typeof checkVideoAccess;
  readProgressVersions?: typeof readOfflineProgressVersions;
  preventionRows?: PreventionRowsPort;
};
export function createOfflineRoutes({
  getTrainingDays,
  requireCourseStepOperationAccess,
  applyStepDayAndCourseTx,
  journalRows,
  dailyJournal,
  videoJournal,
  canAccessVideo,
  readProgressVersions,
  preventionRows,
}: OfflineRouteTrainingPort) {
  const offlineRoutes = new Hono();

// ==================== GET /offline/course/version ====================
// Получить версию курса
const versionQuerySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
});

offlineRoutes.get("/course/version", zValidator("query", versionQuerySchema), async (c) => {
  try {
    const { courseType } = c.req.valid("query");
    const result = await getCourseVersion(courseType);

    if (!result.success) {
      return c.json({ success: false, error: result.error || "Ошибка", code: "NOT_FOUND" }, 404);
    }

    return c.json({ success: true, data: { version: result.version } });
  } catch (error) {
    logger.error("Error getting course version", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /offline/course/updates ====================
// Проверить обновления курса
const updatesQuerySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
  clientVersion: z.string().min(1, "clientVersion обязателен"),
});

offlineRoutes.get("/course/updates", zValidator("query", updatesQuerySchema), async (c) => {
  try {
    const { courseType, clientVersion } = c.req.valid("query");
    const result = await checkCourseUpdates(courseType, clientVersion);

    if (!result.success) {
      return c.json({ success: false, error: result.error || "Ошибка", code: "NOT_FOUND" }, 404);
    }

    return c.json({
      success: true,
      data: {
        hasUpdates: result.hasUpdates,
        serverVersion: result.serverVersion,
      },
    });
  } catch (error) {
    logger.error("Error checking course updates", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== GET /offline/course/download ====================
// Скачать полный курс
const downloadQuerySchema = z.object({
  courseType: z.string().min(1, "courseType обязателен"),
});

offlineRoutes.get("/course/download", zValidator("query", downloadQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { courseType } = c.req.valid("query");

    const subscription = await getAppSubscriptionAccess(user.id, undefined, subscriptionAccessPort);
    if (!subscription.hasActiveSubscription) {
      return c.json(
        {
          success: false,
          error: "Скачивание курса доступно по подписке",
          code: "SUBSCRIPTION_REQUIRED",
        },
        402,
      );
    }
    if (!isOfflineCourseDownloadIncludedPlanCode(subscription.planCode)) {
      return c.json(
        {
          success: false,
          error: "Скачивание курсов доступно на тарифах от одного месяца",
          code: "OFFLINE_DOWNLOAD_NOT_INCLUDED",
        },
        403,
      );
    }

    try {
      await getTrainingDays(user.id, courseType);
    } catch (accessError) {
      if (accessError instanceof Error && accessError.message === "COURSE_ACCESS_DENIED") {
        return c.json(
          { success: false, error: "Нет доступа к курсу", code: "COURSE_ACCESS_DENIED" },
          403,
        );
      }
      throw accessError;
    }

    const result = await downloadFullCourse(courseType);

    if (!result.success) {
      return c.json({ success: false, error: result.error || "Ошибка", code: "NOT_FOUND" }, 404);
    }

    if (result.data && readProgressVersions && c.req.header("X-Gafus-Sync-Protocol") === "2") {
      const versions = await readProgressVersions(user.id, result.data.course.id);
      for (const day of result.data.trainingDays) {
        for (const step of day.steps) if (step.stepOnDayId) {
          step.offlineProgressVersion = versions[day.id + ":" + step.stepOnDayId] ?? "none";
        }
      }
    }
    return c.json({ success: true, data: result.data }, 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    logger.error("Error downloading course", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// Ensure validation failures before a POST handler also remain non-cacheable.
// These apply ONLY to new-only v2 paths, never to legacy download endpoints.
offlineRoutes.use("/mutations", async (c, next) => {
  await next();
  c.header("Cache-Control", "private, no-store");
});
offlineRoutes.use("/mutations/:eventId", async (c, next) => {
  await next();
  c.header("Cache-Control", "private, no-store");
});

// ===== OFF021 NEW-ONLY V2 JOURNAL — never reuse legacy progress POST paths =====
// Old servers have no /offline/mutations endpoint and return 404 without a
// mutation, preventing mixed-version retries from double-applying on old nodes.
const v2EventIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    "Требуется канонический UUIDv4",
  );
const v2VersionFields = {
  expectedVersion: z.string().regex(/^(?:none|[0-9a-f]{64})$/).optional(),
  previousEventId: v2EventIdSchema.optional(),
};
const validVersionBase = (v: { expectedVersion?: string; previousEventId?: string }) =>
  !(v.expectedVersion && v.previousEventId);
const v2PracticeMutationSchema = z
  .object({
    eventId: v2EventIdSchema,
    operation: z.enum(["training.complete.practice", "training.complete.theory"]),
    courseId: z.string().cuid(),
    dayOnCourseId: z.string().cuid(),
    stepIndex: z.number().int().min(0),
    expectedStepOnDayId: z.string().min(1).max(128).optional(),
    expectedStepId: z.string().min(1).max(128).optional(),
    ...v2VersionFields,
  })
  .strict()
  .refine(value => Boolean(value.expectedStepOnDayId) === Boolean(value.expectedStepId) &&
    (value.operation === "training.complete.practice" || Boolean(value.expectedStepOnDayId)) && validVersionBase(value) &&
    (!(value.expectedVersion || value.previousEventId) || Boolean(value.expectedStepOnDayId)),
    { message: "Incomplete occurrence binding" });
const v2PreventionItemSchema = batchEntrySchema
  .extend({ eventId: v2EventIdSchema, clientId: v2EventIdSchema })
  .strict();
const v2PreventionMutationSchema = z
  .object({
    eventId: v2EventIdSchema,
    operation: z.literal("prevention.batch"),
    petId: z.string().trim().min(1).max(128),
    entries: z.array(v2PreventionItemSchema).min(1).max(50),
  })
  .strict()
  .superRefine((data, ctx) => {
    const clients = new Set<string>();
    const events = new Set<string>();
    data.entries.forEach((item, index) => {
      if (clients.has(item.clientId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entries", index, "clientId"],
          message: "Duplicate clientId",
        });
      }
      if (events.has(item.eventId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entries", index, "eventId"],
          message: "Duplicate itemEventId",
        });
      }
      clients.add(item.clientId);
      events.add(item.eventId);
    });
  });
const v2DailyMutationSchema = z.object({
  eventId: v2EventIdSchema,
  operation: z.literal("daily.complete"),
  scheduleId: z.string().cuid(),
  stepIndex: z.number().int().min(0),
  expectedBundleStepId: z.string().min(1).max(128),
  expectedStepId: z.string().min(1).max(128),
  ...v2VersionFields,
}).strict().refine(validVersionBase);
const v2TimerBase = z.object({
  eventId: v2EventIdSchema, stepIndex: z.number().int().min(0),
  expectedStepId: z.string().min(1).max(128),
  action: z.enum(["start", "pause", "resume", "reset"]),
  remainingSec: z.number().int().min(0).max(86400).optional(),
  recordedAt: z.number().int().positive().safe(),
  ...v2VersionFields,
});
const v2TimerMutationSchema = z.discriminatedUnion("operation", [
  v2TimerBase.extend({ operation: z.literal("training.timer"), courseId: z.string().cuid(),
    dayOnCourseId: z.string().cuid(), expectedStepOnDayId: z.string().min(1).max(128) }).strict(),
  v2TimerBase.extend({ operation: z.literal("daily.timer"), scheduleId: z.string().cuid(),
    expectedBundleStepId: z.string().min(1).max(128) }).strict(),
]).refine(v => Boolean(v.expectedVersion) !== Boolean(v.previousEventId) &&
    ((v.action === "start" || v.action === "pause") === (v.remainingSec !== undefined)));
const v2VideoMutationSchema = z.object({
  eventId: v2EventIdSchema, operation: z.literal("video.progress"),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  positionSec: z.number().int().min(0).max(2073600), ...v2VersionFields,
}).strict().refine(v => Boolean(v.expectedVersion) !== Boolean(v.previousEventId));
const v2MutationSchema = z.union([v2PracticeMutationSchema, v2PreventionMutationSchema, v2DailyMutationSchema, v2TimerMutationSchema, v2VideoMutationSchema]);
const v2NoStoreHeaders = { "Cache-Control": "private, no-store" };

function v2ErrorResponse(error: unknown): {
  status: 400 | 403 | 402 | 404 | 409 | 503 | 500;
  code: string;
  message: string;
} {
  if (error instanceof Error && error.name === "OfflineMutationJournalError") {
    const code = (error as Error & { code?: string }).code;
    if (code === "IDEMPOTENCY_KEY_CONFLICT")
      return {
        status: 409,
        code: "IDEMPOTENCY_KEY_CONFLICT",
        message: "Конфликт идентификатора операции",
      };
    if (code === "PET_NOT_FOUND")
      return { status: 404, code: "PET_NOT_FOUND", message: "Питомец не найден" };
    if (code === "INVALID_BATCH_INPUT")
      return { status: 400, code: "INVALID_BATCH_INPUT", message: "Неверная пачка событий" };
    return { status: 503, code: "JOURNAL_UNAVAILABLE", message: "Синхронизация пока недоступна" };
  }
  if (error instanceof Error) {
    if (error.message === "COURSE_ACCESS_DENIED" || error.message === "COURSE_DAY_MISMATCH") {
      return { status: 403, code: "FORBIDDEN", message: "Нет доступа к курсу" };
    }
    if (error.message === "DayOnCourse or day not found" || error.message === "Step not found" || error.message === "STEP_NOT_FOUND" || error.message === "SCHEDULE_NOT_FOUND" || error.message === "VIDEO_NOT_FOUND") {
      return { status: 404, code: "NOT_FOUND", message: "Шаг не найден" };
    }
    if (error.message === "STALE_PROGRESS_VERSION")
      return { status: 409, code: "STALE_PROGRESS_VERSION", message: "Прогресс изменён на другом устройстве" };
    if (error.message.startsWith("INVALID_STATE") || error.message === "STALE_STEP_BINDING" || error.message === "STALE_DAILY_STEP_BINDING")
      return { status: 409, code: "INVALID_STATE", message: "Неверное состояние шага" };
    if (error.name === "SubscriptionOrCreditsRequiredError") {
      return {
        status: 402,
        code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
        message: "Нужен доступ к шагу",
      };
    }
  }
  return { status: 500, code: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера" };
}

/** Bounded v2 training practice COMPLETE only. No v1 replay, no new Gafus. */
offlineRoutes.post("/mutations", zValidator("json", v2MutationSchema), async (c) => {
  if (c.req.header("x-gafus-sync-protocol") !== "2") {
    return c.json({ success: false, code: "UNSUPPORTED_SYNC_PROTOCOL" }, 400, v2NoStoreHeaders);
  }
  const input = c.req.valid("json");
  if (c.req.header("idempotency-key") !== input.eventId) {
    return c.json({ success: false, code: "INVALID_IDEMPOTENCY_KEY" }, 400, v2NoStoreHeaders);
  }
  // A Mobile authEpoch is intentionally never accepted as server identity.
  if (c.req.header("x-client-auth-epoch")) {
    return c.json({ success: false, code: "UNSUPPORTED_EPOCH_HEADER" }, 400, v2NoStoreHeaders);
  }
  const ownerId = c.get("user").id;
  try {
    if (input.operation === "prevention.batch") {
      const journal = await import("@gafus/core/services/offline");
      if (typeof journal.submitNewOfflinePreventionBatch !== "function") {
        return c.json({ success: false, code: "JOURNAL_UNAVAILABLE" }, 503, v2NoStoreHeaders);
      }
      const result = await journal.submitNewOfflinePreventionBatch({
        ownerId,
        eventId: input.eventId,
        operation: input.operation,
        petId: input.petId,
        entries: input.entries.map((entry) => ({
          ...entry,
          performedAt: entry.performedAt.toISOString(),
          reminderOnDate: entry.reminderOnDate?.toISOString() ?? null,
        })),
      }, journalRows, preventionRows);
      return c.json(result, 200, v2NoStoreHeaders);
    }
    if (input.operation === "video.progress") {
      const journal = await import("@gafus/core/services/offline");
      if (!videoJournal || !canAccessVideo || typeof journal.submitNewOfflineVideoProgress !== "function")
        return c.json({success:false,code:"JOURNAL_UNAVAILABLE"},503,v2NoStoreHeaders);
      // Identical fresh permission policy to the existing video progress route;
      // never grants access from the cached media metadata or from a device timestamp.
      if (!await canAccessVideo({userId:ownerId,videoId:input.videoId}))
        return c.json({success:false,code:"FORBIDDEN"},403,v2NoStoreHeaders);
      const result = await journal.submitNewOfflineVideoProgress({ownerId,...input},videoJournal,journalRows);
      return c.json(result,200,v2NoStoreHeaders);
    }
    if (input.operation === "daily.complete") {
      const journal = await import("@gafus/core/services/offline");
      if (!dailyJournal || typeof journal.submitNewOfflineDailyCompletion !== "function")
        return c.json({ success: false, code: "JOURNAL_UNAVAILABLE" }, 503, v2NoStoreHeaders);
      const result = await journal.submitNewOfflineDailyCompletion({ ownerId, ...input }, dailyJournal, journalRows);
      return c.json(result, 200, v2NoStoreHeaders);
    }
    if (input.operation === "daily.timer") {
      const journal = await import("@gafus/core/services/offline");
      if (!dailyJournal || typeof journal.submitNewOfflineTimerMutation !== "function")
        return c.json({ success: false, code: "JOURNAL_UNAVAILABLE" }, 503, v2NoStoreHeaders);
      const result = await journal.submitNewOfflineTimerMutation({ ownerId, ...input }, { applyStepDayAndCourseTx }, dailyJournal, journalRows);
      return c.json(result, 200, v2NoStoreHeaders);
    }
    const rawPlatform = c.req.header("x-rewarded-platform") ?? c.req.header("x-platform");
    const platform = rawPlatform === "IOS" ? "IOS" : "ANDROID";
    const authorized = await requireCourseStepOperationAccess({
      userId: ownerId,
      platform,
      expectedCourseId: input.courseId,
      dayOnCourseId: input.dayOnCourseId,
      stepIndex: input.stepIndex,
      expectedStepOnDayId: input.expectedStepOnDayId,
      expectedStepId: input.expectedStepId,
    });
    const journal = await import("@gafus/core/services/offline");
    if (typeof journal.submitNewOfflinePracticeMutation !== "function") {
      return c.json({ success: false, code: "JOURNAL_UNAVAILABLE" }, 503, v2NoStoreHeaders);
    }
    if (!authorized?.binding?.expectedStepOnDayId ||
        !authorized.binding.expectedStepId ||
        authorized.binding.expectedCourseId !== input.courseId) {
      return c.json({ success: false, code: "JOURNAL_UNAVAILABLE" }, 503, v2NoStoreHeaders);
    }
    if (input.operation === "training.timer") {
      if (typeof journal.submitNewOfflineTimerMutation !== "function")
        return c.json({ success: false, code: "JOURNAL_UNAVAILABLE" }, 503, v2NoStoreHeaders);
      const result = await journal.submitNewOfflineTimerMutation({ ownerId, ...input }, { applyStepDayAndCourseTx }, dailyJournal, journalRows, authorized.binding);
      return c.json(result, 200, v2NoStoreHeaders);
    }
    const result = await journal.submitNewOfflinePracticeMutation(
      { ownerId, ...input }, { applyStepDayAndCourseTx }, journalRows, authorized.binding,
    );
    return c.json(result, 200, v2NoStoreHeaders);
  } catch (error) {
    const failure = v2ErrorResponse(error);
    if (failure.status === 500)
      logger.error("OFF021 new-only journal mutation failed", error as Error);
    return c.json(
      { success: false, code: failure.code, error: failure.message },
      failure.status,
      v2NoStoreHeaders,
    );
  }
});

// Reconciliation is owner-scoped to the VERIFIED current JWT by app middleware.
offlineRoutes.get("/mutations/:eventId", async (c) => {
  if (c.req.header("x-gafus-sync-protocol") !== "2") {
    return c.json({ success: false, code: "UNSUPPORTED_SYNC_PROTOCOL" }, 400, v2NoStoreHeaders);
  }
  const eventId = c.req.param("eventId");
  if (!v2EventIdSchema.safeParse(eventId).success) {
    return c.json({ success: false, code: "INVALID_EVENT_ID" }, 400, v2NoStoreHeaders);
  }
  try {
    const journal = await import("@gafus/core/services/offline");
    if (typeof journal.findNewOfflineMutationReceipt !== "function") {
      return c.json({ success: false, code: "JOURNAL_UNAVAILABLE" }, 503, v2NoStoreHeaders);
    }
    const response = await journal.findNewOfflineMutationReceipt(c.get("user").id, eventId, journalRows);
    if (!response) return c.json({ success: false, code: "NOT_FOUND" }, 404, v2NoStoreHeaders);
    return c.json(response, 200, v2NoStoreHeaders);
  } catch (error) {
    const failure = v2ErrorResponse(error);
    if (failure.status === 500) logger.error("OFF021 journal lookup failed", error as Error);
    return c.json(
      { success: false, code: failure.code, error: failure.message },
      failure.status,
      v2NoStoreHeaders,
    );
  }
});

  return offlineRoutes;
}

// Standalone route composition with the same concrete adapters as app.ts.
export const offlineRoutes = createOfflineRoutes({
  getTrainingDays: sqlTraining.getTrainingDays,
  requireCourseStepOperationAccess: sqlTraining.requireCourseStepOperationAccess,
  applyStepDayAndCourseTx: sqlTraining.applyStepDayAndCourseTx as unknown as TrainingServiceApi["applyStepDayAndCourseTx"],
  journalRows: offlineMutationRows,
  dailyJournal: applyDailyCourseStepAndDayTx as unknown as DailyJournalPort,
  videoJournal: saveProgressJournalTx as unknown as VideoJournalPort,
  canAccessVideo: checkVideoAccess,
  readProgressVersions: readOfflineProgressVersions,
  preventionRows: defaultPreventionRows,
});
