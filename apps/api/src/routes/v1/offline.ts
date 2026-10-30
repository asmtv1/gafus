/**
 * Offline Routes
 * Endpoints для работы с офлайн-данными курсов
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getCourseVersion,
  checkCourseUpdates,
  downloadFullCourse,
} from "@gafus/core/services/offline";
import { getTrainingDays, requireCourseStepOperationAccess } from "@gafus/core/services/training";
import { batchEntrySchema } from "@gafus/core/services/petPrevention";
// Journal exports are loaded ONLY for v2 requests: a mixed-version API
// process with an older @gafus/core build must still start legacy offline.
import {
  getAppSubscriptionAccess,
  isOfflineCourseDownloadIncludedPlanCode,
} from "@gafus/core/services/appSubscription";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-offline");

export const offlineRoutes = new Hono();

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

    const subscription = await getAppSubscriptionAccess(user.id);
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
const v2PracticeMutationSchema = z
  .object({
    eventId: v2EventIdSchema,
    operation: z.literal("training.complete.practice"),
    courseId: z.string().cuid(),
    dayOnCourseId: z.string().cuid(),
    stepIndex: z.number().int().min(0),
  })
  .strict();
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
const v2MutationSchema = z.union([v2PracticeMutationSchema, v2PreventionMutationSchema]);
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
    if (error.message === "DayOnCourse or day not found" || error.message === "Step not found") {
      return { status: 404, code: "NOT_FOUND", message: "Шаг не найден" };
    }
    if (error.message.startsWith("INVALID_STATE"))
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
      });
      return c.json(result, 200, v2NoStoreHeaders);
    }
    const rawPlatform = c.req.header("x-rewarded-platform") ?? c.req.header("x-platform");
    const platform = rawPlatform === "IOS" ? "IOS" : "ANDROID";
    await requireCourseStepOperationAccess({
      userId: ownerId,
      platform,
      expectedCourseId: input.courseId,
      dayOnCourseId: input.dayOnCourseId,
      stepIndex: input.stepIndex,
    });
    const journal = await import("@gafus/core/services/offline");
    if (typeof journal.submitNewOfflinePracticeMutation !== "function") {
      return c.json({ success: false, code: "JOURNAL_UNAVAILABLE" }, 503, v2NoStoreHeaders);
    }
    const result = await journal.submitNewOfflinePracticeMutation({ ownerId, ...input });
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
    const response = await journal.findNewOfflineMutationReceipt(c.get("user").id, eventId);
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
