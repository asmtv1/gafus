/** AG1 source-only route for AG4 review. NOT MOUNTED into live remindersRoutes. */
import { Hono } from "hono";
import { z } from "zod/v3";
import { zValidator } from "@hono/zod-validator";
import {
  lookupOwnReminderCreateReceipt,
  ReminderIdempotencyInvalidError,
} from "../../../../../packages/core/src/services/reminders/g1ReminderCreateIdempotency.review.js";

export const reminderCreateLookupReviewRoutes = new Hono();

// Body rather than URL/query avoids leaving a private creation key in URLs.
const lookupSchema = z.object({ idempotencyKey: z.string().uuid() }).strict();

reminderCreateLookupReviewRoutes.post("/create/lookup", zValidator("json", lookupSchema),
  async (c) => {
    c.header("Cache-Control", "private, no-store");
    try {
      const verifiedOwner = c.get("user");
      if (!verifiedOwner?.id) return c.json({ success: false, code: "UNAUTHORIZED" }, 401);
      const { idempotencyKey } = c.req.valid("json");
      const data = await lookupOwnReminderCreateReceipt(verifiedOwner.id, idempotencyKey);
      return c.json({ success: true, data });
    } catch (error) {
      if (error instanceof ReminderIdempotencyInvalidError) {
        return c.json({ success: false, code: error.code }, 400);
      }
      // Do not leak owner IDs, UUIDs, reminders, database details or raw errors.
      return c.json({ success: false, code: "INTERNAL_ERROR" }, 500);
    }
  });
