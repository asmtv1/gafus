/** AG4 GET owner operation lookup, unmounted REVIEW ONLY. */
import { Hono } from "hono";
import {
  lookupReminderAG4, ReminderInvalidError, ReminderUnknownError,
} from "@gafus/core/services/reminders";

export const reminderOperationLookupAG4ReviewRoutes = new Hono();
reminderOperationLookupAG4ReviewRoutes.get("/operations/:idempotencyKey", async (c) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  try {
    const actor = c.get("user");
    if (!actor?.id) return c.json({ success: false, code: "UNAUTHORIZED" }, 401);
    const receipt = await lookupReminderAG4(actor.id, c.req.param("idempotencyKey"));
    return c.json({ success: true, data: receipt });
  } catch (error) {
    if (error instanceof ReminderUnknownError) {
      // Missing/expired/tombstoned/foreign => one indistinguishable 404.
      return c.json({ success: false, code: error.code }, 404);
    }
    if (error instanceof ReminderInvalidError) {
      return c.json({ success: false, code: error.code }, 400);
    }
    // Do not log/surface raw path key, user or Prisma error details.
    return c.json({ success: false, code: "INTERNAL_ERROR" }, 500);
  }
});
