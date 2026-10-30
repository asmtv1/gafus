import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@gafus/prisma";
import {
  getDefaultAppSubscriptionSettings,
  updateDefaultAppSubscriptionSettings,
} from "@gafus/core/services/appSubscription";
import { requireRole } from "../../middleware/auth.js";

export const adminSettingsRoutes = new Hono();
adminSettingsRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

const pricingSchema = z.object({
  twoWeeksEnabled: z.boolean(),
  yookassaTwoWeeksPriceRub: z.number().min(1).max(100000),
  twoWeeksIntervalDays: z.number().int().min(1).max(366),
  monthlyEnabled: z.boolean(),
  yookassaMonthlyPriceRub: z.number().min(1).max(100000),
  monthlyIntervalDays: z.number().int().min(1).max(366),
  threeMonthsEnabled: z.boolean(),
  yookassaThreeMonthsPriceRub: z.number().min(1).max(100000),
  threeMonthsIntervalDays: z.number().int().min(1).max(366),
  monthlyAppleProductId: z.string().trim().min(1).max(255).nullable(),
}).strict();

async function dbRole(actorId: string) {
  const user = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
  return user?.role;
}

adminSettingsRoutes.get("/subscriptions", requireRole("ADMIN", "MODERATOR"), async c => {
  try {
    const role = await dbRole(c.get("user").id);
    if (role !== "ADMIN" && role !== "MODERATOR") {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    const settings = await getDefaultAppSubscriptionSettings();
    return c.json({ success: true, data: {
      twoWeeksEnabled: settings?.twoWeeksEnabled ?? false,
      yookassaTwoWeeksPriceRub: Number(settings?.yookassaTwoWeeksPriceRub ?? 1185),
      twoWeeksIntervalDays: settings?.twoWeeksIntervalDays ?? 30,
      monthlyEnabled: settings?.monthlyEnabled ?? true,
      yookassaMonthlyPriceRub: Number(settings?.yookassaMonthlyPriceRub ?? 1465),
      monthlyIntervalDays: settings?.monthlyIntervalDays ?? 30,
      threeMonthsEnabled: settings?.threeMonthsEnabled ?? false,
      yookassaThreeMonthsPriceRub: Number(settings?.yookassaThreeMonthsPriceRub ?? 2470),
      threeMonthsIntervalDays: settings?.threeMonthsIntervalDays ?? 30,
      monthlyAppleProductId: settings?.monthlyAppleProductId ?? null,
    } });
  } catch {
    return c.json({ success: false, code: "SETTINGS_UNAVAILABLE" }, 503);
  }
});

adminSettingsRoutes.put("/subscriptions", requireRole("ADMIN"), async c => {
  const parsed = pricingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "INVALID_SETTINGS" }, 400);
  try {
    const actorId = c.get("user").id;
    if (await dbRole(actorId) !== "ADMIN") {
      return c.json({ success: false, code: "FORBIDDEN" }, 403);
    }
    await updateDefaultAppSubscriptionSettings({ ...parsed.data, actorId });
    return c.json({ success: true });
  } catch {
    return c.json({ success: false, code: "SETTINGS_UPDATE_FAILED" }, 500);
  }
});
