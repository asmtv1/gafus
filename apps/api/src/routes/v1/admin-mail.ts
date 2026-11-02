import { Hono } from "hono";
import { readAdminActorRole } from "@gafus/core/services/adminUser";
import { getAdminMailDashboard, getAdminMailAlertCount } from "@gafus/core/services/systemHealth";
import { requireRole } from "../../middleware/auth.js";

/** Privacy-preserving mail queue overview: no recipients, bodies, tokens or attachments. */
export const adminMailRoutes = new Hono();
adminMailRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
adminMailRoutes.get("/", requireRole("ADMIN"), async c => {
  try {
    if (await readAdminActorRole(c.get("user").id) !== "ADMIN") return c.json({ success: false, code: "FORBIDDEN" }, 403);
    return c.json({ success: true, data: await getAdminMailDashboard() });
  } catch {
    return c.json({ success: false, code: "MAIL_UNAVAILABLE" }, 503);
  }
});
adminMailRoutes.get("/alerts", requireRole("ADMIN"), async c => {
  try {
    if (await readAdminActorRole(c.get("user").id) !== "ADMIN") return c.json({ success: false, code: "FORBIDDEN" }, 403);
    return c.json({ success: true, data: { count: await getAdminMailAlertCount() } });
  } catch {
    return c.json({ success: false, code: "MAIL_UNAVAILABLE" }, 503);
  }
});
