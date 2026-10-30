import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@gafus/prisma";
import { getReengagementMetrics } from "@gafus/core/services/adminReengagement";
import { getRewardedAdsAdminDashboard } from "@gafus/core/services/adminRewardedAds";
import { requireRole } from "../../middleware/auth.js";

export const adminAnalyticsRoutes = new Hono();
adminAnalyticsRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

async function adminCurrent(userId: string) {
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return actor?.role === "ADMIN";
}

adminAnalyticsRoutes.get("/reengagement", requireRole("ADMIN"), async c => {
  try {
    if (!(await adminCurrent(c.get("user").id))) {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    const result = await getReengagementMetrics();
    if (!result.success) return c.json({ success: false, code: "REENGAGEMENT_UNAVAILABLE" }, 503);
    return c.json({ success: true, data: result.data });
  } catch {
    return c.json({ success: false, code: "REENGAGEMENT_UNAVAILABLE" }, 503);
  }
});

const rewardedDays = z.union([z.literal("7"), z.literal("30"), z.literal("90")]);
adminAnalyticsRoutes.get("/rewarded-ads", requireRole("ADMIN"), async c => {
  const daysRaw = c.req.query("days") ?? "30";
  const days = rewardedDays.safeParse(daysRaw);
  if (!days.success) return c.json({ success: false, code: "INVALID_PERIOD" }, 400);
  try {
    if (!(await adminCurrent(c.get("user").id))) {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    const data = await getRewardedAdsAdminDashboard({ days: Number(days.data) as 7 | 30 | 90 });
    return c.json({ success: true, data });
  } catch {
    return c.json({ success: false, code: "REWARDED_DASHBOARD_UNAVAILABLE" }, 503);
  }
});
