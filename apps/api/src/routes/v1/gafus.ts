import { Hono } from "hono";
import { z } from "zod";
import {
  getGafusStatus, listGafusTransactions, unlockContentWithGafus, listGafusMiniGuides,
  getGafusPostReactionProgress,
  getAuthorizedMiniGuideContent,
  GafusError,
} from "@gafus/core/services/gafus";

export const gafusRoutes = new Hono();

const targetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("COURSE_STEP"),
    dayOnCourseId: z.string().min(1).max(128),
    stepOnDayId: z.string().min(1).max(128),
  }).strict(),
  z.object({
    type: z.literal("MINI_GUIDE"),
    courseId: z.string().min(1).max(128),
  }).strict(),
]);

const unlockSchema = z.object({
  clientRequestId: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/),
  target: targetSchema,
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return { status: 403 as const, body: { success: false, error: "Недостаточно прав", code: "GAFUS_FORBIDDEN" } };
  }
  if (error instanceof Error && /^(INVALID_SETTING|INVALID_SETTINGS_KEYS|REASON_REQUIRED|INVALID_REQUEST_ID)/.test(error.message)) {
    return { status: 400 as const, body: { success: false, error: "Некорректные настройки или причина", code: "GAFUS_VALIDATION_ERROR" } };
  }
  if (error instanceof Error && /^(SETTINGS_REVISION_CONFLICT|REQUEST_CONFLICT)$/.test(error.message)) {
    return { status: 409 as const, body: { success: false, error: "Конфликт версии или запроса", code: "GAFUS_CONFLICT" } };
  }
  if (error instanceof z.ZodError) {
    return { status: 400 as const, body: { success: false, error: "Некорректные данные", code: "GAFUS_VALIDATION_ERROR" } };
  }
  if (error instanceof GafusError) {
    const status = error.code === "GAFUS_INSUFFICIENT_BALANCE" || error.code === "GAFUS_IDEMPOTENCY_CONFLICT"
      ? 409 : error.code === "GAFUS_DISABLED" ? 503 : 403;
    return { status, body: { success: false, error: error.message, code: error.code } };
  }
  return { status: 500 as const, body: { success: false, error: "Не удалось обработать запрос", code: "GAFUS_INTERNAL_ERROR" } };
}

gafusRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

gafusRoutes.get("/status", async c => {
  try {
    const status = await getGafusStatus(c.get("user").id);
    return c.json({ success: true, data: status });
  } catch (e) {
    const mapped = errorResponse(e);
    return c.json(mapped.body, mapped.status as 500);
  }
});

gafusRoutes.get("/history", async c => {
  try {
    const parsed = z.object({
      cursor: z.string().min(1).max(128).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(c.req.query());
    const page = await listGafusTransactions({
      userId: c.get("user").id, cursor: parsed.cursor, limit: parsed.limit,
    });
    return c.json({ success: true, data: {
      items: page.items.map(item => ({
        id: item.id, kind: item.kind, delta: item.delta, balanceAfter: item.balanceAfter,
        createdAt: item.createdAt.toISOString(), rewardKind: item.rewardKind,
        sourceEntityType: item.sourceEntityType, sourceEntityId: item.sourceEntityId,
        targetKey: item.targetKey,
      })),
      nextCursor: page.nextCursor,
    } });
  } catch (e) {
    const mapped = errorResponse(e);
    return c.json(mapped.body, mapped.status as 500);
  }
});

gafusRoutes.post("/unlock", async c => {
  try {
    // No userId, price, duration or balance accepted from the client.
    const body = unlockSchema.parse(await c.req.json());
    const result = await unlockContentWithGafus({
      userId: c.get("user").id,
      target: body.target,
      clientRequestId: body.clientRequestId,
    });
    return c.json({ success: true, data: result });
  } catch (e) {
    const mapped = errorResponse(e);
    return c.json(mapped.body, mapped.status as 500);
  }
});

/** Never serialize guide HTML until the server authorizes this user. */
gafusRoutes.get("/reaction-progress/:postId", async c => {
  try {
    const postId = z.string().min(1).max(128).parse(c.req.param("postId"));
    const data = await getGafusPostReactionProgress(c.get("user").id, postId);
    if (!data) return c.json({ success: false, code: "GAFUS_NOT_FOUND" }, 404);
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = errorResponse(error);
    return c.json(mapped.body, mapped.status as 500);
  }
});

gafusRoutes.get("/mini-guides", async c => {
  try {
    return c.json({ success: true, data: await listGafusMiniGuides(c.get("user").id) });
  } catch (error) {
    const mapped = errorResponse(error);
    return c.json(mapped.body, mapped.status as 500);
  }
});

gafusRoutes.get("/mini-guide/:courseId", async c => {
  try {
    const courseId = z.string().min(1).max(128).parse(c.req.param("courseId"));
    const userId = c.get("user").id;
    const content = await getAuthorizedMiniGuideContent({ userId, courseId });
    if (!content) {
      return c.json({ success: false, error: "Откройте мини-гайд за Гафус или оформите подписку", code: "GAFUS_ACCESS_REQUIRED" }, 403);
    }
    return c.json({ success: true, data: { courseId, guideContent: content } });
  } catch (e) {
    const mapped = errorResponse(e);
    return c.json(mapped.body, mapped.status as 500);
  }
});
