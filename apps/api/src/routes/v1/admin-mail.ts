import { Hono } from "hono";
import { prisma } from "@gafus/prisma";
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
    const staff = await prisma.user.findUnique({
      where: { id: c.get("user").id }, select: { role: true },
    });
    if (staff?.role !== "ADMIN") return c.json({ success: false, code: "FORBIDDEN" }, 403);
    return c.json({ success: true, data: await getAdminMailDashboard() });
  } catch {
    return c.json({ success: false, code: "MAIL_UNAVAILABLE" }, 503);
  }
});
adminMailRoutes.get("/alerts", requireRole("ADMIN"), async c => {
  try {
    const staff = await prisma.user.findUnique({
      where: { id: c.get("user").id }, select: { role: true },
    });
    if (staff?.role !== "ADMIN") return c.json({ success: false, code: "FORBIDDEN" }, 403);
    return c.json({ success: true, data: { count: await getAdminMailAlertCount() } });
  } catch {
    return c.json({ success: false, code: "MAIL_UNAVAILABLE" }, 503);
  }
});
