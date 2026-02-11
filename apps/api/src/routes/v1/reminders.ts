import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder,
} from "@gafus/core/services/reminders";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-reminders");
export const remindersRoutes = new Hono();

const createSchema = z.object({
  name: z.string().min(1),
  reminderTime: z.string().min(1),
  reminderDays: z.string().optional(),
  timezone: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  reminderTime: z.string().min(1).optional(),
  reminderDays: z.string().nullable().optional(),
  timezone: z.string().optional(),
});

remindersRoutes.get("/", async (c) => {
  try {
    const user = c.get("user");
    const data = await getReminders(user.id);
    return c.json({ success: true, data });
  } catch (error) {
    logger.error("GET reminders error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

remindersRoutes.post("/", zValidator("json", createSchema), async (c) => {
  try {
    const user = c.get("user");
    const body = c.req.valid("json");
    const data = await createReminder(
      user.id,
      body.name,
      body.reminderTime,
      body.reminderDays,
      body.timezone,
    );
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === "Максимум 5 напоминаний") {
      return c.json({ success: false, error: error.message }, 400);
    }
    logger.error("POST reminders error", error as Error);
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
    if (error instanceof Error && error.message === "Напоминание не найдено") {
      return c.json({ success: false, error: error.message }, 404);
    }
    logger.error("PUT reminders error", error as Error);
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
    logger.error("DELETE reminders error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});
