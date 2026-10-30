import { Hono } from "hono";
import { z } from "zod";
import { getAdminFeedReports, moderateAdminFeedReport } from "@gafus/core/services/feed";
import {
  getQuestionModeration, moderateQuestionReport, unblockQuestionsUser,
} from "@gafus/core/services/questions";
import { requireRole } from "../../middleware/auth.js";

/** Real feed/question moderation, driven by the existing Core state transitions. */
export const adminModerationRoutes = new Hono();
adminModerationRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const feedModeration = z.object({
  action: z.enum(["dismiss", "hide", "delete", "restore", "block", "unblock"]),
  reason: z.string().trim().min(1).max(1000),
}).strict();
const questionModeration = z.object({
  reportId: id,
  action: z.enum(["dismiss", "hide", "delete", "close", "block"]),
  reason: z.string().trim().min(1).max(1000),
}).strict();

/** Core raises typed 4xx domain errors; never return a database or provider message. */
function moderationError(error: unknown) {
  if (error && typeof error === "object") {
    const detail = error as { status?: unknown; code?: unknown };
    const status = detail.status;
    if ([400, 401, 403, 404, 409].includes(status as number)) {
      const code = detail.code === "FORBIDDEN" ? "FORBIDDEN"
        : status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "INVALID_ACTION";
      return { status: status as 400 | 401 | 403 | 404 | 409, code };
    }
  }
  return { status: 503 as const, code: "MODERATION_UNAVAILABLE" };
}

adminModerationRoutes.get("/feed/reports", requireRole("ADMIN", "MODERATOR"), async c => {
  const cursor = c.req.query("cursor");
  if (cursor !== undefined && !id.safeParse(cursor).success) {
    return c.json({ success: false, code: "INVALID_CURSOR" }, 400);
  }
  try {
    const data = await getAdminFeedReports(c.get("user").id, cursor ?? null);
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = moderationError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status);
  }
});

adminModerationRoutes.post("/feed/reports/:reportId", requireRole("ADMIN", "MODERATOR"), async c => {
  const reportId = c.req.param("reportId");
  if (!id.safeParse(reportId).success) return c.json({ success: false, code: "INVALID_ID" }, 400);
  let input: z.infer<typeof feedModeration>;
  try { input = feedModeration.parse(await c.req.json()); }
  catch { return c.json({ success: false, code: "INVALID_ACTION" }, 400); }
  try {
    const data = await moderateAdminFeedReport(c.get("user").id, reportId, input);
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = moderationError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status);
  }
});

adminModerationRoutes.get("/questions/reports", requireRole("ADMIN"), async c => {
  const page = z.coerce.number().int().min(1).max(10000).safeParse(c.req.query("page") ?? "1");
  if (!page.success) return c.json({ success: false, code: "INVALID_PAGE" }, 400);
  try {
    const data = await getQuestionModeration(c.get("user").id, page.data);
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = moderationError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status);
  }
});

adminModerationRoutes.post("/questions/reports", requireRole("ADMIN"), async c => {
  let input: z.infer<typeof questionModeration>;
  try { input = questionModeration.parse(await c.req.json()); }
  catch { return c.json({ success: false, code: "INVALID_ACTION" }, 400); }
  try {
    const data = await moderateQuestionReport(c.get("user").id, input);
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = moderationError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status);
  }
});

adminModerationRoutes.delete("/questions/blocks/:userId", requireRole("ADMIN"), async c => {
  const userId = c.req.param("userId");
  if (!id.safeParse(userId).success) return c.json({ success: false, code: "INVALID_ID" }, 400);
  try {
    const data = await unblockQuestionsUser(c.get("user").id, userId);
    return c.json({ success: true, data });
  } catch (error) {
    const mapped = moderationError(error);
    return c.json({ success: false, code: mapped.code }, mapped.status);
  }
});
