import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  createReminderAG4,
  ReminderConflictError,
  ReminderUnknownError,
  ReminderInvalidError,
  ReminderCapError,
} from "@gafus/core/services/reminders";
import { reminderOperationLookupAG4ReviewRoutes } from
  "./g1-reminder-operation-lookupAG4.review.js";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-reminders");
export const remindersRoutes = new Hono();

/** ЧЧ:ММ, 00:00 – 23:59 */
const REMINDER_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** "1", "1,3,5", "1,2,3,4,5,6,7" и т.д. */
const REMINDER_DAYS_RE = /^[1-7](,[1-7])*$/;

const reminderTimeSchema = z
  .string()
  .regex(REMINDER_TIME_RE, "Некорректный формат времени (ожидается ЧЧ:ММ)");

const reminderDaysSchema = z
  .string()
  .regex(REMINDER_DAYS_RE, "Некорректный формат дней (1-7 через запятую)")
  .nullable()
  .optional();

const timezoneSchema = z
  .string()
  .refine((tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Некорректная timezone")
  .optional();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  /** null / отсутствие — каждый день */
  reminderTime: reminderTimeSchema,
  reminderDays: reminderDaysSchema,
  timezone: timezoneSchema,
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  reminderTime: reminderTimeSchema.optional(),
  reminderDays: reminderDaysSchema,
  timezone: timezoneSchema,
});

remindersRoutes.get("/", async (c) => {
  try {
    const user = c.get("user");
    const data = await getReminders(user.id);
    return c.json({ success: true, data });
  } catch {
    logger.error("GET reminders error", new Error("REMINDER_READ_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

remindersRoutes.post("/", zValidator("json", createSchema), async (c) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  try {
    const user = c.get("user");
    const body = c.req.valid("json");
    const idempotencyKey = c.req.header("Idempotency-Key");
    const data = idempotencyKey === undefined
      ? await createReminder(
        user.id, body.name, body.reminderTime, body.reminderDays, body.timezone,
      )
      : (await createReminderAG4(user.id, {
        name: body.name, reminderTime: body.reminderTime,
        reminderDays: body.reminderDays, timezone: body.timezone,
      }, idempotencyKey)).reminder;
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof ReminderConflictError) {
      return c.json({ success: false, code: error.code }, 409);
    }
    if (error instanceof ReminderUnknownError) {
      return c.json({ success: false, code: error.code }, 409);
    }
    if (error instanceof ReminderInvalidError) {
      return c.json({ success: false, code: error.code }, 400);
    }
    if (error instanceof ReminderCapError) {
      return c.json({ success: false, code: error.code, error: error.message }, 400);
    }
    if (error instanceof Error) {
      const clientErrors = [
        "Максимум 5 напоминаний",
        "Некорректный формат времени",
        "Некорректный формат дней",
        "Некорректная timezone",
      ];
      if (clientErrors.some((msg) => error.message.startsWith(msg))) {
        return c.json({ success: false, error: error.message }, 400);
      }
    }
    logger.error("POST reminders failed", new Error("REMINDER_CREATE_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

remindersRoutes.put("/:id", zValidator("json", updateSchema), async (c) => {
  try {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");
    const data = await updateReminder(user.id, id, body);
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Напоминание не найдено") {
        return c.json({ success: false, error: error.message }, 404);
      }
      const clientErrors = [
        "Некорректный формат времени",
        "Некорректный формат дней",
        "Некорректная timezone",
      ];
      if (clientErrors.some((msg) => error.message.startsWith(msg))) {
        return c.json({ success: false, error: error.message }, 400);
      }
    }
    logger.error("PUT reminders error", new Error("REMINDER_UPDATE_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

remindersRoutes.delete("/:id", async (c) => {
  try {
    const user = c.get("user");
    const { id } = c.req.param();
    await deleteReminder(user.id, id);
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Напоминание не найдено") {
      return c.json({ success: false, error: error.message }, 404);
    }
    logger.error("DELETE reminders error", new Error("REMINDER_DELETE_FAILED"));
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

// AG4 owner-scoped read-only operation status; GET never attempts a new POST.
remindersRoutes.route("/", reminderOperationLookupAG4ReviewRoutes);
