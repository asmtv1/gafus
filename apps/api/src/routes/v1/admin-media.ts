import { Hono } from "hono";
import { getStorageStats } from "@gafus/core/services/adminStorage";

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
