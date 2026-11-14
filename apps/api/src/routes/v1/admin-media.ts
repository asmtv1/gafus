import { Hono } from "hono";
import { getStorageStats } from "@gafus/statistics";
import { listChatOutboxDeadLetters, retryChatOutboxDeadLetter } from "../../modules/chat2/infrastructure/outbox-diagnostics.js";

import { requireRole } from "../../middleware/auth.js";

/** Read-only admin media statistics, shared by the future independent UI. */
export const adminMediaRoutes = new Hono();

adminMediaRoutes.get("/stats", requireRole("ADMIN"), async c => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  try {
    const result = await getStorageStats();
    if (!result.success) return c.json({ success: false, code: "STORAGE_UNAVAILABLE" }, 503);
    return c.json({ success: true, data: result.data });
  } catch {
    // Never expose database/provider errors to a client.
    return c.json({ success: false, code: "STORAGE_UNAVAILABLE" }, 503);
  }
});


// Operators can inspect bounded, PII-free failures and retry one exact event.
// The event itself retains its durable unique ID, preserving idempotency.
adminMediaRoutes.get("/chat-outbox/dead-letters", requireRole("ADMIN"), async c => {
  c.header("Cache-Control", "private, no-store");
  try {
    return c.json({ success: true, data: await listChatOutboxDeadLetters() });
  } catch {
    return c.json({ success: false, code: "DIAGNOSTICS_UNAVAILABLE" }, 503);
  }
});

adminMediaRoutes.post("/chat-outbox/dead-letters/:eventId/retry", requireRole("ADMIN"), async c => {
  c.header("Cache-Control", "private, no-store");
  const eventId = c.req.param("eventId");
  if (!/^[a-zA-Z0-9_-]{10,64}$/.test(eventId))
    return c.json({ success: false, code: "VALIDATION_ERROR" }, 400);
  try {
    const retried = await retryChatOutboxDeadLetter(eventId);
    return retried
      ? c.json({ success: true })
      : c.json({ success: false, code: "CONFLICT_OR_NOT_FOUND" }, 409);
  } catch {
    return c.json({ success: false, code: "RETRY_UNAVAILABLE" }, 503);
  }
});
