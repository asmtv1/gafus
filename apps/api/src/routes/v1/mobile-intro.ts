import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getMobileIntroReport, recordMobileIntroAuthOutcome, recordMobileIntroEvent } from "@gafus/core/services/mobileIntro";
import { requireRole } from "../../middleware/auth.js";

export const mobileIntroRoutes = new Hono();

const isoDate = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const eventSchema = z.object({
  installationId: z.string().trim().min(16).max(128),
  introVersion: z.string().trim().min(1).max(32),
  platform: z.enum(["IOS", "ANDROID"]),
  event: z.enum(["OPENED", "COMPLETED", "SKIPPED"]),
  openedAt: isoDate,
  occurredAt: isoDate,
}).superRefine((value, ctx) => {
  if (value.openedAt.getTime() > Date.now() + 5 * 60 * 1000 || value.occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Время события не может быть в будущем" });
  }
  if (value.occurredAt < value.openedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Событие не может быть раньше открытия" });
  }
});

const authOutcomeSchema = z.object({
  installationId: z.string().trim().min(16).max(128),
  introVersion: z.string().trim().min(1).max(32),
  platform: z.enum(["IOS", "ANDROID"]),
  openedAt: isoDate,
  outcome: z.enum(["REGISTERED", "LOGGED_IN"]),
  userId: z.string().min(1).max(128).optional(),
});

const reportSchema = z.object({ start: isoDate, end: isoDate }).refine((value) => value.end > value.start, { message: "Некорректный период" });

mobileIntroRoutes.post("/events", bodyLimit({ maxSize: 2 * 1024 }), zValidator("json", eventSchema), async (c) => {
  await recordMobileIntroEvent(c.req.valid("json"));
  return c.json({ success: true, data: { recorded: true } });
});

// Authenticated fallback for a client that had to queue the outcome after a successful login.
mobileIntroRoutes.post("/auth-outcome", bodyLimit({ maxSize: 1024 }), zValidator("json", authOutcomeSchema), async (c) => {
  const input = c.req.valid("json");
  const user = c.get("user");
  if (!user) return c.json({ success: false, error: "Требуется авторизация" }, 401);
  if (input.userId && input.userId !== user.id) {
    return c.json({ success: false, error: "Пользователь события не совпадает с текущей сессией" }, 409);
  }
  await recordMobileIntroAuthOutcome({ ...input, userId: user.id });
  return c.json({ success: true, data: { recorded: true } });
});

mobileIntroRoutes.get("/admin/report", requireRole("ADMIN"), zValidator("query", reportSchema), async (c) => {
  return c.json({ success: true, data: await getMobileIntroReport(c.req.valid("query")) });
});
